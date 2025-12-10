import { Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoOverlayProps {
  showControls: boolean
  isGlobalReady: boolean
  isLocalBuffered: boolean
  isPlaying: boolean
  isHost: boolean
  onPlayPause: () => void
  onSkipBackward: () => void
  onSkipForward: () => void
  onBumpControls: () => void
}

export function VideoOverlay({
  showControls,
  isGlobalReady,
  isLocalBuffered,
  isPlaying,
  isHost,
  onPlayPause,
  onSkipBackward,
  onSkipForward,
  onBumpControls
}: VideoOverlayProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onTouchStart={onBumpControls}
      onClick={onBumpControls}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

      {/* Buffering indicator */}
      {(!isGlobalReady || !isLocalBuffered) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="w-10 h-10 animate-spin" />
            <span className="text-sm font-medium">
              {!isGlobalReady ? 'Esperando a otros usuarios...' : 'Cargando video...'}
            </span>
          </div>
        </div>
      )}

      {/* Center play button + skip buttons */}
      <div className="absolute inset-0 flex items-center justify-center gap-8 pointer-events-none">
        {/* Skip backward */}
        <button
          onClick={(e) => { e.stopPropagation(); onSkipBackward() }}
          disabled={!isHost}
          className={cn(
            "pointer-events-auto w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black/50",
            isHost ? "hover:bg-black/70 hover:scale-110 active:scale-95" : "opacity-40 cursor-not-allowed"
          )}
          aria-label="Retroceder 10 segundos"
          tabIndex={showControls ? 0 : -1}
        >
          <SkipBack size={22} />
        </button>

        {/* Main play/pause button */}
        <button
          onTouchEnd={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPlayPause()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPlayPause()
          }}
          className={cn(
            "pointer-events-auto flex items-center justify-center w-20 h-20 rounded-full backdrop-blur-md text-white transition-all duration-200 shadow-2xl",
            "focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-4 focus:ring-offset-black/50",
            isHost 
              ? "bg-white/20 hover:bg-white/30 hover:scale-110 active:scale-95" 
              : "bg-white/10 opacity-50 cursor-not-allowed"
          )}
          data-testid="play-pause-btn"
          aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
          aria-pressed={isPlaying}
          disabled={!isHost}
          tabIndex={showControls ? 0 : -1}
        >
          {isPlaying ? <Pause size={36} /> : <Play size={36} className="ml-1" />}
        </button>

        {/* Skip forward */}
        <button
          onClick={(e) => { e.stopPropagation(); onSkipForward() }}
          disabled={!isHost}
          className={cn(
            "pointer-events-auto w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black/50",
            isHost ? "hover:bg-black/70 hover:scale-110 active:scale-95" : "opacity-40 cursor-not-allowed"
          )}
          aria-label="Adelantar 10 segundos"
          tabIndex={showControls ? 0 : -1}
        >
          <SkipForward size={22} />
        </button>
      </div>
    </div>
  )
}
