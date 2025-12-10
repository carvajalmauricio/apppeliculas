'use client'

import { useState, useEffect, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { cn } from '@/lib/utils'

interface Reaction {
  id: string
  emoji: string
  username: string
  x: number
  y: number
}

interface ReactionsProps {
  roomId: string
  socket: Socket | null
  username: string
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🔥', '💯', '😢']

export default function Reactions({ roomId, socket, username }: ReactionsProps) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [showPicker, setShowPicker] = useState(false)

  // Listen for reactions from others
  useEffect(() => {
    if (!socket) return

    socket.on('reaction', ({ id, emoji, username: sender, x, y }: Reaction) => {
      const reaction: Reaction = { id, emoji, username: sender, x, y }
      setReactions(prev => [...prev, reaction])
      
      // Remove reaction after animation
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id))
      }, 2000)
    })

    return () => {
      socket.off('reaction')
    }
  }, [socket])

  const sendReaction = useCallback((emoji: string) => {
    if (!socket) return

    // Random position in center-ish area
    const x = 30 + Math.random() * 40 // 30% to 70% from left
    const y = 20 + Math.random() * 40 // 20% to 60% from top

    socket.emit('send-reaction', { roomId, emoji, username, x, y })
    setShowPicker(false)
  }, [socket, roomId, username])

  // Keyboard shortcut for reactions (1-8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (document.activeElement instanceof HTMLInputElement || 
          document.activeElement instanceof HTMLTextAreaElement) {
        return
      }

      const num = parseInt(e.key)
      if (num >= 1 && num <= 8) {
        sendReaction(EMOJIS[num - 1])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sendReaction])

  return (
    <>
      {/* Floating reactions overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute animate-float-up"
            style={{
              left: `${reaction.x}%`,
              top: `${reaction.y}%`,
            }}
          >
            <div className="flex flex-col items-center">
              <span className="text-4xl drop-shadow-lg">{reaction.emoji}</span>
              <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm mt-1">
                {reaction.username}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reaction button */}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className={cn(
          "fixed bottom-24 left-4 z-40 p-3 rounded-full shadow-lg transition-all duration-200",
          "bg-yellow-500 text-white hover:bg-yellow-400",
          showPicker && "bg-yellow-600"
        )}
        aria-label="Reacciones"
      >
        <span className="text-xl">😀</span>
      </button>

      {/* Emoji picker */}
      {showPicker && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setShowPicker(false)}
          />
          <div className="fixed bottom-40 left-4 z-50 bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl p-3 border border-gray-700">
            <div className="grid grid-cols-4 gap-2">
              {EMOJIS.map((emoji, index) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="relative w-12 h-12 text-2xl hover:bg-gray-800 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95"
                  title={`Tecla ${index + 1}`}
                >
                  {emoji}
                  <span className="absolute bottom-0 right-1 text-[10px] text-gray-500">
                    {index + 1}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Usa teclas 1-8 para reaccionar rápido
            </p>
          </div>
        </>
      )}
    </>
  )
}
