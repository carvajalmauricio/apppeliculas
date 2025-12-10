'use client'

import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { Plus, Trash2, Play, GripVertical, ListMusic, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PlaylistItem {
  id: string
  url: string
  title: string
  addedBy: string
}

interface PlaylistProps {
  roomId: string
  socket: Socket | null
  isHost: boolean
  currentVideoUrl: string
  onVideoChange: (url: string) => void
}

const MP4_REGEX = /\.mp4(\?.*)?$/i

export default function Playlist({ roomId, socket, isHost, currentVideoUrl, onVideoChange }: PlaylistProps) {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [newUrl, setNewUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('playlist-update', ({ playlist: newPlaylist, currentIndex: newIndex }: { playlist: PlaylistItem[], currentIndex: number }) => {
      setPlaylist(newPlaylist)
      setCurrentIndex(newIndex)
      
      // If current video changed, notify parent
      if (newPlaylist[newIndex] && newPlaylist[newIndex].url !== currentVideoUrl) {
        onVideoChange(newPlaylist[newIndex].url)
      }
    })

    socket.on('playlist-next', ({ index, url }: { index: number, url: string }) => {
      setCurrentIndex(index)
      onVideoChange(url)
    })

    // Request current playlist on mount
    socket.emit('playlist-get', { roomId })

    return () => {
      socket.off('playlist-update')
      socket.off('playlist-next')
    }
  }, [socket, roomId, currentVideoUrl, onVideoChange])

  const extractTitle = (url: string): string => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const filename = pathname.split('/').pop() || 'Video'
      return decodeURIComponent(filename.replace('.mp4', ''))
    } catch {
      return 'Video'
    }
  }

  const handleAddVideo = () => {
    if (!socket || !isHost) return
    setError(null)

    let normalized = newUrl.trim()
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`
    }

    try {
      const parsed = new URL(normalized)
      if (!MP4_REGEX.test(parsed.pathname)) {
        setError('Solo se permiten URLs de archivos MP4')
        return
      }
    } catch {
      setError('URL inválida')
      return
    }

    socket.emit('playlist-add', { 
      roomId, 
      url: normalized,
      title: extractTitle(normalized)
    })
    setNewUrl('')
  }

  const handleRemove = (itemId: string) => {
    if (!socket || !isHost) return
    socket.emit('playlist-remove', { roomId, itemId })
  }

  const handlePlayNow = (index: number) => {
    if (!socket || !isHost) return
    socket.emit('playlist-play', { roomId, index })
  }

  const handleNext = () => {
    if (!socket || !isHost || currentIndex >= playlist.length - 1) return
    socket.emit('playlist-play', { roomId, index: currentIndex + 1 })
  }

  const handlePrevious = () => {
    if (!socket || !isHost || currentIndex <= 0) return
    socket.emit('playlist-play', { roomId, index: currentIndex - 1 })
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-24 right-4 z-40 p-3 rounded-full shadow-lg transition-all duration-200",
          "bg-purple-600 text-white hover:bg-purple-500",
          isOpen && "bg-purple-700"
        )}
        aria-label="Playlist"
      >
        <ListMusic size={24} />
        {playlist.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            {playlist.length}
          </span>
        )}
      </button>

      {/* Playlist panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-80 bg-gray-900/95 backdrop-blur-md shadow-2xl z-50 transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ListMusic size={20} />
              Playlist
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Add video form (host only) */}
          {isHost && (
            <div className="p-4 border-b border-gray-800">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL del video MP4..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddVideo()}
                />
                <button
                  onClick={handleAddVideo}
                  className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                >
                  <Plus size={20} className="text-white" />
                </button>
              </div>
              {error && (
                <p className="text-red-400 text-xs mt-2">{error}</p>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          {isHost && playlist.length > 1 && (
            <div className="flex gap-2 p-4 border-b border-gray-800">
              <button
                onClick={handlePrevious}
                disabled={currentIndex <= 0}
                className="flex-1 py-2 px-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={handleNext}
                disabled={currentIndex >= playlist.length - 1}
                className="flex-1 py-2 px-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* Playlist items */}
          <div className="flex-1 overflow-y-auto p-2">
            {playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <ListMusic size={48} className="mb-2 opacity-50" />
                <p className="text-sm">La playlist está vacía</p>
                {isHost && <p className="text-xs mt-1">Añade videos con el botón +</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {playlist.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg transition-colors",
                      index === currentIndex 
                        ? "bg-purple-600/30 border border-purple-500/50" 
                        : "bg-gray-800/50 hover:bg-gray-800"
                    )}
                  >
                    <GripVertical size={16} className="text-gray-600 flex-shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-medium truncate",
                        index === currentIndex ? "text-purple-300" : "text-gray-200"
                      )}>
                        {index === currentIndex && "▶ "}
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Añadido por {item.addedBy}
                      </p>
                    </div>

                    {isHost && (
                      <div className="flex gap-1 flex-shrink-0">
                        {index !== currentIndex && (
                          <button
                            onClick={() => handlePlayNow(index)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Reproducir ahora"
                          >
                            <Play size={14} className="text-gray-400" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="p-1.5 hover:bg-red-600/30 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="p-4 border-t border-gray-800 text-center text-xs text-gray-500">
            {playlist.length} video{playlist.length !== 1 ? 's' : ''} en la lista
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
