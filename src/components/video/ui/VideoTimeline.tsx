import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface VideoTimelineProps {
  currentTime: number
  duration: number
  buffered: number
  seeking: boolean
  seekPreview: number | null
  isHost: boolean
  onSeek: (time: number) => void
  onSeekStart: () => void
  onSeekEnd: () => void
}

export function VideoTimeline({
  currentTime,
  duration,
  buffered,
  seeking,
  seekPreview,
  isHost,
  onSeek,
  onSeekStart,
  onSeekEnd
}: VideoTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<number>(0)

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const timeline = timelineRef.current
    if (!timeline || !duration) return
    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    setHoverTime(percent * duration)
    setHoverPosition(x)
  }

  const handleTimelineLeave = () => {
    setHoverTime(null)
  }

  return (
    <div 
      ref={timelineRef}
      className="relative w-full group mb-3"
      onMouseMove={handleTimelineHover}
      onMouseLeave={handleTimelineLeave}
    >
      {/* Hover time preview */}
      {hoverTime !== null && !seeking && (
        <div 
          className="absolute -top-10 px-2 py-1 rounded-md bg-black/90 text-white text-xs font-medium transform -translate-x-1/2 pointer-events-none transition-opacity"
          style={{ left: hoverPosition }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Seek preview tooltip */}
      {seeking && seekPreview !== null && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-lg">
          {formatTime(seekPreview)} / {formatTime(duration)}
        </div>
      )}

      {/* Timeline track */}
      <div className="relative h-1.5 bg-white/20 rounded-full overflow-hidden group-hover:h-2.5 transition-all duration-200">
        {/* Buffer progress */}
        <div 
          className="absolute h-full bg-white/30 rounded-full transition-all duration-200"
          style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
        />
        {/* Playback progress */}
        <div 
          className="absolute h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-100"
          style={{ 
            width: `${duration ? ((seeking && seekPreview !== null ? seekPreview : currentTime) / duration) * 100 : 0}%` 
          }}
        />
      </div>

      {/* Seek thumb */}
      <div 
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-200",
          "opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100",
          seeking && "opacity-100 scale-110"
        )}
        style={{ 
          left: `calc(${duration ? ((seeking && seekPreview !== null ? seekPreview : currentTime) / duration) * 100 : 0}% - 8px)` 
        }}
      />

      {/* Invisible range input for interaction */}
      <input
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={seeking && seekPreview !== null ? seekPreview : currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        onPointerDown={onSeekStart}
        onPointerUp={onSeekEnd}
        onTouchEnd={onSeekEnd}
        disabled={!isHost}
        aria-label="Barra de progreso del video"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(seeking && seekPreview !== null ? seekPreview : currentTime)}
        aria-valuetext={`${formatTime(seeking && seekPreview !== null ? seekPreview : currentTime)} de ${formatTime(duration)}`}
        className={cn(
          "absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-pan-x",
          "focus:opacity-100 focus:ring-2 focus:ring-blue-500",
          !isHost && "cursor-not-allowed"
        )}
      />
    </div>
  )
}
