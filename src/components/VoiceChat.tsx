'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import Peer from 'simple-peer'
import { Mic, MicOff } from 'lucide-react'

interface VoiceChatProps {
  roomId: string
  socket: Socket | null
  onMuteChange?: (muted: boolean) => void
}

export interface VoiceChatHandle {
  toggleMute: () => void
  isMuted: boolean
}

function VoiceChatComponent({ roomId, socket, onMuteChange }: VoiceChatProps, ref: React.Ref<VoiceChatHandle>) {
  const [peers, setPeers] = useState<Peer.Instance[]>([])
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<{ peerId: string; stream: MediaStream }[]>([])
  const peersRef = useRef<{ peerID: string; peer: Peer.Instance }[]>([])
  const userVideo = useRef<HTMLAudioElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const upsertRemoteStream = useCallback((peerId: string, incomingStream: MediaStream) => {
    setRemoteStreams((prev) => {
      const existing = prev.find((p) => p.peerId === peerId)
      if (existing) {
        if (existing.stream === incomingStream) return prev
        return prev.map((p) => p.peerId === peerId ? { peerId, stream: incomingStream } : p)
      }
      return [...prev, { peerId, stream: incomingStream }]
    })
  }, [])
  const removeRemoteStream = useCallback((peerId: string) => {
    setRemoteStreams((prev) => prev.filter((p) => p.peerId !== peerId))
  }, [])

  const attachRemoteStream = useCallback((peerId: string, peer: Peer.Instance) => {
    const handleStream = (incoming: MediaStream) => {
      console.log('VoiceChat: Received remote stream from', peerId)
      console.log('VoiceChat: Stream has', incoming.getAudioTracks().length, 'audio tracks')
      upsertRemoteStream(peerId, incoming)
    }

    peer.on('track', (track, incomingStream) => {
      console.log('VoiceChat: Track from', peerId, track.kind)
      handleStream(incomingStream)
    })

    peer.on('stream', handleStream)

    peer.on('close', () => {
      console.log('VoiceChat: Peer closed connection to', peerId)
      removeRemoteStream(peerId)
    })
  }, [removeRemoteStream, upsertRemoteStream])

  const hasPeer = useCallback((peerId: string) => {
    return peersRef.current.some(p => p.peerID === peerId)
  }, [])

  const createPeer = useCallback((userToSignal: string, callerID: string, stream: MediaStream) => {
    console.log('VoiceChat: Creating peer (initiator) for', userToSignal)
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.opentok.com:3478' },
        ]
      }
    })

    peer.on('signal', (signal) => {
      console.log('VoiceChat: Sending signal to', userToSignal)
      socket?.emit('voice-sending-signal', { userToSignal, callerID, signal })
    })

    peer.on('error', (err) => {
      console.error('VoiceChat: Peer error (initiator):', err)
    })

    peer.on('iceStateChange', (state) => {
      console.warn('VoiceChat: ICE state change (initiator):', state)
      if (state === 'failed' || state === 'disconnected') {
        removeRemoteStream(userToSignal)
        peer.destroy()
      }
    })

    peer.on('connect', () => {
      console.log('VoiceChat: Peer connected (initiator) to', userToSignal)
    })

    attachRemoteStream(userToSignal, peer)

    return peer
  }, [attachRemoteStream, socket])

  const addPeer = useCallback((incomingSignal: Peer.SignalData, callerID: string, stream: MediaStream) => {
    console.log('VoiceChat: Adding peer (receiver) from', callerID)
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.opentok.com:3478' },
        ]
      }
    })

    peer.on('signal', (signal) => {
      console.log('VoiceChat: Returning signal to', callerID)
      socket?.emit('voice-returning-signal', { signal, callerID })
    })

    peer.on('error', (err) => {
      console.error('VoiceChat: Peer error (receiver):', err)
    })

    peer.on('iceStateChange', (state) => {
      console.warn('VoiceChat: ICE state change (receiver):', state)
      if (state === 'failed' || state === 'disconnected') {
        removeRemoteStream(callerID)
        peer.destroy()
      }
    })

    peer.on('connect', () => {
      console.log('VoiceChat: Peer connected (receiver) to', callerID)
    })

    attachRemoteStream(callerID, peer)

    peer.signal(incomingSignal)

    return peer
  }, [attachRemoteStream, socket])

  const toggleMute = useCallback(() => {
    if (stream) {
      const [track] = stream.getAudioTracks()
      if (!track) return
      track.enabled = !track.enabled
      setIsMuted(!track.enabled)
      onMuteChange?.(!track.enabled)
    }
  }, [onMuteChange, stream])

  useEffect(() => {
    if (!socket) {
      console.log('VoiceChat: No socket available')
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Media devices not supported or insecure context')
      return
    }

    setIsConnecting(true)
    console.log('VoiceChat: Requesting microphone access...')

    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
      .then((currentStream) => {
        console.log('VoiceChat: Microphone access granted')
        streamRef.current = currentStream
        setStream(currentStream)
        setIsConnecting(false)
        
        if (userVideo.current) {
          userVideo.current.srcObject = currentStream
        }

        console.log('VoiceChat: Joining voice chat room', roomId)
        socket.emit('join-voice-chat', { roomId })

        socket.on('voice-all-users', (users: string[]) => {
          console.log('VoiceChat: Received voice-all-users', users)
          const newPeers: Peer.Instance[] = []
          users.forEach((userID) => {
            if (hasPeer(userID)) return
            const peer = createPeer(userID, socket.id!, currentStream)
            peersRef.current.push({
              peerID: userID,
              peer,
            })
            newPeers.push(peer)
          })
          if (newPeers.length) setPeers((prev) => [...prev, ...newPeers])
        })

        socket.on('voice-user-joined', (payload: { userID: string }) => {
          console.log('VoiceChat: User joined voice chat', payload.userID)
        })

        socket.on('voice-user-joined-signal', (payload: { signal: Peer.SignalData; callerID: string }) => {
          console.log('VoiceChat: Received voice-user-joined-signal from', payload.callerID)
          if (hasPeer(payload.callerID)) {
            console.warn('VoiceChat: Peer already exists, ignoring duplicate join', payload.callerID)
            return
          }
          const peer = addPeer(payload.signal, payload.callerID, currentStream)
          peersRef.current.push({
            peerID: payload.callerID,
            peer,
          })
          setPeers((prevPeers) => [...prevPeers, peer])
        })

        socket.on('voice-receiving-returned-signal', (payload: { signal: Peer.SignalData; id: string }) => {
          console.log('VoiceChat: Received voice-receiving-returned-signal from', payload.id)
          const item = peersRef.current.find((p) => p.peerID === payload.id)
          if (item) {
            try {
              item.peer.signal(payload.signal)
            } catch (err) {
              console.error('VoiceChat: Failed to apply returned signal (ignored)', err)
            }
          } else {
            console.warn('VoiceChat: Could not find peer for returned signal', payload.id)
          }
        })
      })
      .catch(err => {
        console.error('VoiceChat: Failed to get user media:', err)
        setIsConnecting(false)
        alert('Could not access microphone. Please grant permission and try again.')
      })

    return () => {
      console.log('VoiceChat: Cleaning up')
      streamRef.current?.getTracks().forEach(track => {
        track.stop()
        console.log('VoiceChat: Stopped track', track.kind)
      })
      peersRef.current.forEach(p => {
        p.peer.destroy()
        console.log('VoiceChat: Destroyed peer', p.peerID)
      })
      peersRef.current = []
      setRemoteStreams([])
      
      socket.off('voice-all-users')
      socket.off('voice-user-joined')
      socket.off('voice-user-joined-signal')
      socket.off('voice-receiving-returned-signal')
    }
  }, [addPeer, createPeer, hasPeer, roomId, socket])

  useImperativeHandle(ref, () => ({
    toggleMute,
    isMuted,
  }), [isMuted, toggleMute])

  return (
    <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            isConnecting ? 'bg-yellow-500 animate-pulse' : 
            stream ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="text-sm font-medium text-gray-200">Voice Chat</span>
          {peers.length > 0 && (
            <span className="text-xs text-gray-400">({peers.length} connected)</span>
          )}
        </div>
        
        <button
          onClick={toggleMute}
          disabled={!stream}
          className={`p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isMuted ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
          }`}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
      </div>

      {/* Render audio elements for peers */}
      <div className="sr-only">
        {remoteStreams.map(({ peerId, stream }) => (
          <RemoteAudio key={peerId} peerId={peerId} stream={stream} />
        ))}
      </div>
    </div>
  )
}

const RemoteAudio = ({ peerId, stream }: { peerId: string, stream: MediaStream }) => {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audioEl = ref.current
    if (!audioEl) return

    const playSafely = () => {
      audioEl.play().catch(err => {
        console.error('VoiceChat Audio: Failed to play stream from', peerId, err)
      })
    }

    // Prevent overlapping play requests when stream updates
    audioEl.pause()

    // Avoid reassigning when the same stream instance is already set
    const currentStream = audioEl.srcObject as MediaStream | null
    if (currentStream !== stream) {
      audioEl.srcObject = stream
    }

    const handleCanPlay = () => playSafely()
    audioEl.addEventListener('canplay', handleCanPlay)
    audioEl.addEventListener('loadedmetadata', handleCanPlay)

    // Try immediately as well (some browsers fire canplay later)
    requestAnimationFrame(playSafely)

    return () => {
      audioEl.removeEventListener('canplay', handleCanPlay)
      audioEl.removeEventListener('loadedmetadata', handleCanPlay)
      audioEl.pause()
    }
  }, [stream, peerId])

  return <audio playsInline autoPlay ref={ref} />
}

export default forwardRef(VoiceChatComponent)
