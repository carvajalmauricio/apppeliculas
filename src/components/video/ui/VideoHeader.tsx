import { Mic, MicOff, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoHeaderProps {
  socketStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  isHost: boolean
  username: string
  users: Array<{ id: string; name: string; isHost: boolean }>
  onTransferHost?: (targetId: string) => void
  showControls: boolean
  isFullscreen: boolean
  micMuted: boolean
  onToggleMic?: () => void
  onOpenChat?: () => void
  socketId?: string
}

export function VideoHeader({
  socketStatus,
  isHost,
  username,
  users,
  onTransferHost,
  showControls,
  isFullscreen,
  micMuted,
  onToggleMic,
  onOpenChat,
  socketId
}: VideoHeaderProps) {
  return (
    <>
      {/* Status badges - Top Left */}
      {isFullscreen ? (
        // Minimal indicator for fullscreen
        <div className={cn(
          "absolute left-3 top-3 z-30 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          <div 
            className={cn(
              "w-3 h-3 rounded-full shadow-lg ring-2 ring-black/20",
              socketStatus === 'connected' && "bg-emerald-500",
              socketStatus === 'connecting' && "bg-amber-500 animate-pulse",
              socketStatus === 'reconnecting' && "bg-amber-500 animate-pulse",
              socketStatus === 'disconnected' && "bg-red-500"
            )}
            title={`${socketStatus === 'connected' ? 'Conectado' : socketStatus === 'disconnected' ? 'Desconectado' : 'Reconectando...'} - ${isHost ? 'Host' : 'Invitado'} - ${username}`}
          />
        </div>
      ) : (
        // Full badges for normal view
        <div className={cn(
          "absolute left-3 top-3 z-30 flex flex-col gap-2 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          <span className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg",
            "flex items-center gap-1.5",
            isHost 
              ? "bg-gradient-to-r from-blue-600/90 to-blue-500/90 text-white" 
              : "bg-gray-900/80 text-gray-200"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              isHost ? "bg-white animate-pulse" : "bg-gray-400"
            )} />
            {isHost ? 'Host' : 'Invitado'}
          </span>
          
          <span className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg",
            "flex items-center gap-1.5",
            socketStatus === 'connected' && "bg-emerald-600/90 text-white",
            socketStatus === 'connecting' && "bg-amber-500/90 text-white",
            socketStatus === 'reconnecting' && "bg-amber-600/90 text-white",
            socketStatus === 'disconnected' && "bg-red-600/90 text-white"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              socketStatus === 'connected' && "bg-white",
              socketStatus === 'connecting' && "bg-white animate-pulse",
              socketStatus === 'reconnecting' && "bg-white animate-pulse",
              socketStatus === 'disconnected' && "bg-white"
            )} />
            {socketStatus === 'connected' && 'Conectado'}
            {socketStatus === 'connecting' && 'Conectando...'}
            {socketStatus === 'reconnecting' && 'Reconectando...'}
            {socketStatus === 'disconnected' && 'Desconectado'}
          </span>
          
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900/80 backdrop-blur-md text-gray-200 shadow-lg">
            👤 {username}
          </span>
          
          {isHost && users.length > 1 && (
            <div className="flex flex-col gap-1 bg-gray-900/80 backdrop-blur-md rounded-lg p-2 shadow-lg">
              <label className="text-xs text-gray-300 font-medium">Transferir control:</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => {
                  if (!e.target.value) return
                  onTransferHost?.(e.target.value)
                  e.target.value = ''
                }}
                defaultValue=""
              >
                <option value="" disabled>Selecciona usuario</option>
                {users.filter(u => u.id !== socketId).map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Top Right - Mic & Chat buttons */}
      <div
        className={cn(
          "pointer-events-none absolute top-3 right-3 z-30 flex gap-2 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}
        style={{ paddingRight: 'env(safe-area-inset-right)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          type="button"
          aria-label={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
          aria-pressed={!micMuted}
          onClick={onToggleMic}
          className={cn(
            "pointer-events-auto rounded-xl p-2.5 backdrop-blur-md shadow-lg transition-all duration-200",
            "hover:scale-105 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
            micMuted 
              ? "bg-red-600/90 text-white hover:bg-red-500/90" 
              : "bg-gray-900/80 text-white hover:bg-gray-800/90"
          )}
        >
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button
          type="button"
          aria-label="Abrir chat"
          onClick={onOpenChat}
          className={cn(
            "pointer-events-auto rounded-xl bg-gray-900/80 text-white p-2.5 backdrop-blur-md shadow-lg transition-all duration-200",
            "hover:bg-gray-800/90 hover:scale-105 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
          )}
        >
          <MessageSquare size={20} />
        </button>
      </div>
    </>
  )
}
