import { useRef, useEffect } from 'react'
import { Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'

// Playback speed options
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number]

interface PlaybackSpeedMenuProps {
  playbackSpeed: PlaybackSpeed
  showSpeedMenu: boolean
  setShowSpeedMenu: (show: boolean) => void
  onChangeSpeed: (speed: PlaybackSpeed) => void
}

export function PlaybackSpeedMenu({
  playbackSpeed,
  showSpeedMenu,
  setShowSpeedMenu,
  onChangeSpeed
}: PlaybackSpeedMenuProps) {
  const speedMenuRef = useRef<HTMLDivElement>(null)

  // Click outside speed menu to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false)
      }
    }
    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSpeedMenu, setShowSpeedMenu])

  return (
    <div className="relative" ref={speedMenuRef}>
      <button 
        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
        className={cn(
          "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
          "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
        )}
        aria-label={`Velocidad de reproducción: ${playbackSpeed}x`}
        aria-expanded={showSpeedMenu}
        aria-haspopup="menu"
      >
        <Gauge size={20} />
        <span className="ml-1 text-xs font-medium">{playbackSpeed}x</span>
      </button>
      
      {showSpeedMenu && (
        <div 
          className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-md rounded-lg shadow-xl overflow-hidden min-w-[100px] border border-white/10"
          role="menu"
          aria-label="Opciones de velocidad"
        >
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              onClick={() => onChangeSpeed(speed)}
              className={cn(
                "w-full px-4 py-2 text-sm text-left transition-colors",
                "hover:bg-white/10 focus:outline-none focus:bg-white/20",
                "min-h-[44px] flex items-center",
                speed === playbackSpeed ? "text-blue-400 font-semibold" : "text-white"
              )}
              role="menuitemradio"
              aria-checked={speed === playbackSpeed}
            >
              {speed}x {speed === 1 && '(Normal)'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
