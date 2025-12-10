'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import VideoPlayer from '@/components/VideoPlayer'
import Chat, { ChatHandle } from '@/components/Chat'
import VoiceChat, { VoiceChatHandle } from '@/components/VoiceChat'
import Playlist from '@/components/Playlist'
import Reactions from '@/components/Reactions'

interface RoomClientProps {
  roomId: string
  videoUrl: string
}

export default function RoomClient({ roomId, videoUrl: initialVideoUrl }: RoomClientProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [micMuted, setMicMuted] = useState(false)
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting')
  const [amHost, setAmHost] = useState(false)
  const [currentVideoUrl, setCurrentVideoUrl] = useState(initialVideoUrl)
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Invitado'
    return localStorage.getItem('syncwatch:name') || 'Invitado'
  })
  const [users, setUsers] = useState<Array<{ id: string; name: string; isHost: boolean }>>([])
  const voiceChatRef = useRef<VoiceChatHandle>(null)
  const chatRef = useRef<ChatHandle>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // Single effect for socket creation and all event handlers
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Prevent creating multiple sockets
    if (socketRef.current) return

    const baseURL = process.env.NEXT_PUBLIC_APP_URL || undefined
    console.log('Creating socket connection to:', baseURL || 'default')
    
    const client = io(baseURL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    })
    
    socketRef.current = client

    // Connection events
    client.on('connect', () => {
      console.log('Socket connected:', client.id)
      setSocketStatus('connected')
      const currentName = localStorage.getItem('syncwatch:name') || 'Invitado'
      console.log('Emitting join-room with username:', currentName)
      client.emit('join-room', { roomId, username: currentName })
    })

    client.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message)
      setSocketStatus('reconnecting')
    })

    client.on('reconnect_attempt', () => {
      console.log('Socket reconnecting...')
      setSocketStatus('reconnecting')
    })

    client.on('reconnect', () => {
      console.log('Socket reconnected:', client.id)
      setSocketStatus('connected')
      const currentName = localStorage.getItem('syncwatch:name') || 'Invitado'
      client.emit('join-room', { roomId, username: currentName })
    })

    client.on('disconnect', (reason) => {
      console.warn('Socket disconnected:', reason)
      setSocketStatus('disconnected')
      setAmHost(false)
    })

    // Host status events
    client.on('is-host', (hostStatus: boolean) => {
      console.log('Received is-host event:', hostStatus)
      setAmHost(hostStatus)
    })

    client.on('host-changed', ({ hostId }: { hostId: string }) => {
      console.log('Host changed to:', hostId, 'My ID:', client.id)
      setAmHost(hostId === client.id)
    })

    // Presence events
    client.on('presence', ({ users: roomUsers }: { users: Array<{ id: string; name: string; isHost: boolean }> }) => {
      console.log('Presence update:', roomUsers)
      setUsers(roomUsers)
      // Also update host status from presence data as fallback
      const me = roomUsers.find(u => u.id === client.id)
      if (me) {
        setAmHost(me.isHost)
      }
    })

    setSocket(client)

    return () => {
      console.log('Cleaning up socket connection')
      client.removeAllListeners()
      client.disconnect()
      socketRef.current = null
    }
  }, [roomId])

  // Heartbeat effect
  useEffect(() => {
    if (!socket || socketStatus !== 'connected') return

    heartbeatRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { roomId })
      }
    }, 15000)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [socket, socketStatus, roomId])

  // Username change handler
  const handleUsernameChange = useCallback((newName: string) => {
    const trimmed = newName.slice(0, 50)
    setUsername(trimmed)
    if (typeof window !== 'undefined') {
      localStorage.setItem('syncwatch:name', trimmed)
    }
    if (socket?.connected) {
      socket.emit('join-room', { roomId, username: trimmed })
    }
  }, [socket, roomId])

  // Video change handler (for playlist)
  const handleVideoChange = useCallback((newUrl: string) => {
    setCurrentVideoUrl(newUrl)
  }, [])

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Reactions overlay - positioned over the video */}
      <div className="lg:col-span-2 relative">
        <Reactions roomId={roomId} socket={socket} username={username} />
      </div>

      <div className="lg:col-span-3 mb-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="username" className="text-sm text-gray-300">Nombre</label>
          <input
            id="username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-gray-400">
          {users.map((u) => (
            <span key={u.id} className="px-2 py-1 rounded border border-gray-700 text-gray-200 bg-gray-900">
              {u.name}{u.isHost ? ' (Host)' : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 space-y-6">
        <div className="relative">
          <VideoPlayer 
            roomId={roomId} 
            videoUrl={currentVideoUrl} 
            socket={socket}
            socketStatus={socketStatus}
            isHostExternal={amHost}
            username={username}
            users={users}
            onTransferHost={(targetId) => socket?.emit('transfer-host', { roomId, targetId })}
            micMuted={micMuted}
            onToggleMic={() => voiceChatRef.current?.toggleMute()}
            onOpenChat={() => chatRef.current?.focusInput()}
          />
          {/* Reactions are rendered inside VideoPlayer container context */}
        </div>
        
        <div className="p-4 bg-gray-900 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Compartir sala</h3>
            <p className="text-sm text-gray-400 mb-4">
              Envía este enlace a tus amigos para ver juntos.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 p-2 bg-black rounded border border-gray-800 font-mono text-sm overflow-x-auto">
                {`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/room/${roomId}`}
              </code>
            </div>
        </div>
      </div>
      
      <div className="space-y-6">
        <VoiceChat 
          ref={voiceChatRef}
          roomId={roomId} 
          socket={socket} 
          onMuteChange={setMicMuted}
        />
        <Chat ref={chatRef} roomId={roomId} socket={socket} />
      </div>

      {/* Playlist component */}
      <Playlist 
        roomId={roomId} 
        socket={socket} 
        isHost={amHost}
        currentVideoUrl={currentVideoUrl}
        onVideoChange={handleVideoChange}
      />
    </div>
  )
}
