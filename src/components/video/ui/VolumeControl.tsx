import { Volume2, VolumeX, Volume1 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  showVolumeSlider: boolean
  setShowVolumeSlider: (show: boolean) => void
}

export function VolumeControl({
  volume,
  isMuted,
  onToggleMute,
  onVolumeChange,
  showVolumeSlider,
  setShowVolumeSlider
}: VolumeControlProps) {
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setShowVolumeSlider(true)}
      onMouseLeave={() => setShowVolumeSlider(false)}
    >
      <button 
        onClick={onToggleMute} 
        className={cn(
          "p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
          "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
        )}
        aria-label={isMuted ? 'Activar audio (M)' : 'Silenciar audio (M)'}
        aria-pressed={isMuted}
      >
        <VolumeIcon size={20} />
      </button>
      
      {/* Volume slider */}
      <div className={cn(
        "flex items-center overflow-hidden transition-all duration-200",
        showVolumeSlider ? "w-24 ml-1 opacity-100" : "w-0 opacity-0"
      )}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          aria-label={`Volumen: ${Math.round(volume * 100)}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volume * 100)}
          className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}
