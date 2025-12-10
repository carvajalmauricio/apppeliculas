import { SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SeekAnimation {
  side: 'left' | 'right'
  key: number
}

interface GestureOverlayProps {
  gestureHint: string | null
  volumeHint: string | null
  seekAnimations: SeekAnimation[]
}

export function GestureOverlay({
  gestureHint,
  volumeHint,
  seekAnimations
}: GestureOverlayProps) {
  return (
    <>
      {/* Double-tap seek animations */}
      {seekAnimations.map((anim) => (
        <div
          key={anim.key}
          className={cn(
            "absolute top-0 bottom-0 w-1/3 flex items-center justify-center pointer-events-none z-20",
            anim.side === 'left' ? "left-0" : "right-0"
          )}
        >
          <div className="animate-ping rounded-full bg-white/30 p-8">
            {anim.side === 'left' ? (
              <SkipBack size={32} className="text-white" />
            ) : (
              <SkipForward size={32} className="text-white" />
            )}
          </div>
        </div>
      ))}

      {/* Gesture hints overlay */}
      {(gestureHint || volumeHint) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-40">
          <div className="px-6 py-3 rounded-2xl bg-black/80 backdrop-blur-md text-white text-lg font-bold shadow-2xl animate-[fade-in_0.15s_ease-out]">
            {gestureHint || volumeHint}
          </div>
        </div>
      )}
    </>
  )
}
