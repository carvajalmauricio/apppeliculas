import { Play, Pause, SkipBack, SkipForward, Maximize, Minimize, PictureInPicture2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoTimeline } from './VideoTimeline'
import { VolumeControl } from './VolumeControl'
import { PlaybackSpeedMenu, PlaybackSpeed } from './PlaybackSpeedMenu'

interface VideoControlsProps {
  showControls: boolean
  mediaState: { currentTime: number; duration: number; buffered: number }
  seeking: boolean
  seekPreview: number | null
  isHost: boolean
  isPlaying: boolean
  isMuted: boolean
  volume: number
  isFullscreen: boolean
  playbackSpeed: PlaybackSpeed
  showSpeedMenu: boolean
  isPiPSupported: boolean
  isPiPActive: boolean
  onPlayPause: () => void
  onSkipBackward: () => void
  onSkipForward: () => void
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onToggleFullScreen: () => void
  onTogglePiP: () => void
  onChangeSpeed: (speed: PlaybackSpeed) => void
  onSeek: (time: number) => void
  onSeekStart: () => void
  onSeekEnd: () => void
  setShowSpeedMenu: (show: boolean) => void
  showVolumeSlider: boolean
  setShowVolumeSlider: (show: boolean) => void
}

export function VideoControls({
  showControls,
  mediaState,
  seeking,
  seekPreview,
  isHost,
  isPlaying,
  isMuted,
  volume,
  isFullscreen,
  playbackSpeed,
  showSpeedMenu,
  isPiPSupported,
  isPiPActive,
  onPlayPause,
  onSkipBackward,
  onSkipForward,
  onToggleMute,
  onVolumeChange,
  onToggleFullScreen,
  onTogglePiP,
  onChangeSpeed,
  onSeek,
  onSeekStart,
  onSeekEnd,
  setShowSpeedMenu,
  showVolumeSlider,
  setShowVolumeSlider
}: VideoControlsProps) {
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pointer-events-auto">
      {/* Timeline with buffer indicator */}
      <VideoTimeline
        currentTime={mediaState.currentTime}
        duration={mediaState.duration}
        buffered={mediaState.buffered}
        seeking={seeking}
        seekPreview={seekPreview}
        isHost={isHost}
        onSeek={onSeek}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
      />

      {/* Bottom bar controls */}
      <div className="flex items-center justify-between text-white" role="toolbar" aria-label="Controles del reproductor">
        {/* Left side controls */}
        <div className="flex items-center gap-2">
          {/* Play/Pause mini button */}
          <button 
            onClick={onPlayPause}
            disabled={!isHost}
            className={cn(
              "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
              !isHost && "opacity-50 cursor-not-allowed"
            )}
            aria-label={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          {/* Skip backward */}
          <button 
            onClick={onSkipBackward}
            disabled={!isHost}
            className={cn(
              "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
              !isHost && "opacity-50 cursor-not-allowed"
            )}
            aria-label="Retroceder 10 segundos (←)"
          >
            <SkipBack size={18} />
          </button>

          {/* Skip forward */}
          <button 
            onClick={onSkipForward}
            disabled={!isHost}
            className={cn(
              "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
              !isHost && "opacity-50 cursor-not-allowed"
            )}
            aria-label="Adelantar 10 segundos (→)"
          >
            <SkipForward size={18} />
          </button>

          {/* Volume control */}
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onToggleMute={onToggleMute}
            onVolumeChange={onVolumeChange}
            showVolumeSlider={showVolumeSlider}
            setShowVolumeSlider={setShowVolumeSlider}
          />

          {/* Time display */}
          <span className="text-sm font-medium tabular-nums ml-2" aria-live="off">
            <span aria-label="Tiempo actual">{formatTime(seeking && seekPreview !== null ? seekPreview : mediaState.currentTime)}</span>
            <span className="text-white/50 mx-1" aria-hidden="true">/</span>
            <span aria-label="Duración total">{formatTime(mediaState.duration)}</span>
          </span>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          {/* Playback Speed Menu */}
          <PlaybackSpeedMenu
            playbackSpeed={playbackSpeed}
            showSpeedMenu={showSpeedMenu}
            setShowSpeedMenu={setShowSpeedMenu}
            onChangeSpeed={onChangeSpeed}
          />

          {/* Picture-in-Picture */}
          {isPiPSupported && (
            <button 
              onClick={onTogglePiP}
              className={cn(
                "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
                "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
                isPiPActive && "bg-blue-600/50"
              )}
              aria-label={isPiPActive ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture'}
              aria-pressed={isPiPActive}
            >
              <PictureInPicture2 size={20} />
            </button>
          )}

          {/* Fullscreen */}
          <button 
            onClick={onToggleFullScreen} 
            className={cn(
              "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
            )}
            aria-label={isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}
