'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Touch as ReactTouch } from 'react'
import { Socket } from 'socket.io-client'
import { Settings, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoHeader } from './video/ui/VideoHeader'
import { VideoOverlay } from './video/ui/VideoOverlay'
import { VideoControls } from './video/ui/VideoControls'
import { GestureOverlay, SeekAnimation } from './video/ui/GestureOverlay'
import { PlaybackSpeed, PLAYBACK_SPEEDS } from './video/ui/PlaybackSpeedMenu'

interface VideoPlayerProps {
  roomId: string
  videoUrl: string
  socket: Socket | null
  socketStatus?: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  username?: string
  users?: Array<{ id: string; name: string; isHost: boolean }>
  onTransferHost?: (targetId: string) => void
  micMuted?: boolean
  onToggleMic?: () => void
  onOpenChat?: () => void
  isHostExternal?: boolean
}

export default function VideoPlayer({ roomId, videoUrl, socket, socketStatus = 'connected', username = 'Invitado', users = [], onTransferHost, micMuted = false, onToggleMic, onOpenChat, isHostExternal }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [isGlobalReady, setIsGlobalReady] = useState(true)
  const [isLocalBuffered, setIsLocalBuffered] = useState(false)
  const [bufferingTimeout, setBufferingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false)
  const [hasUserGesture, setHasUserGesture] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const hideControlsTimer = useRef<number | null>(null)
  const [mediaState, setMediaState] = useState({ currentTime: 0, duration: 0, buffered: 0 })
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [gestureHint, setGestureHint] = useState<string | null>(null)
  const [volumeHint, setVolumeHint] = useState<string | null>(null)
  const [seekAnimations, setSeekAnimations] = useState<SeekAnimation[]>([])
  const gestureHintTimer = useRef<number | null>(null)
  const [seeking, setSeeking] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const isRemoteUpdate = useRef(false)
  const [processedUrl, setProcessedUrl] = useState(videoUrl)
  const proxyFallbackTried = useRef(false)
  const lastTapRef = useRef<number>(0)
  const touchStartRef = useRef<ReactTouch | null>(null)
  const seekAnimationKey = useRef(0)

  // New usability states
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isPiPSupported, setIsPiPSupported] = useState(false)
  const [isPiPActive, setIsPiPActive] = useState(false)
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('')
  const speedMenuRef = useRef<HTMLDivElement>(null)

  // Keep host flag in sync with presence in case the initial is-host event is missed
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (isHostExternal !== undefined) return
    if (!socket) return
    const me = users.find((u) => u.id === socket.id)
    if (me && me.isHost !== isHost) {
      setIsHost(me.isHost)
    }
  }, [users, socket, isHost, isHostExternal])

  useEffect(() => {
    if (isHostExternal === undefined) return
    if (isHostExternal !== isHost) {
      setIsHost(isHostExternal)
    }
  }, [isHostExternal, isHost])

  const isMp4Source = useMemo(() => {
    try {
      const urlObj = new URL(processedUrl, window.location.href)
      const pathMatches = /\.mp4($|\?)/i.test(urlObj.pathname)
      const nestedUrl = urlObj.searchParams.get('url')
      const nestedMatches = nestedUrl ? /\.mp4($|\?)/i.test(new URL(nestedUrl, window.location.href).pathname) : false
      return pathMatches || nestedMatches
    } catch {
      // For relative URLs without window present in SSR
      return processedUrl.toLowerCase().includes('.mp4')
    }
  }, [processedUrl])

  const bumpControls = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) {
      window.clearTimeout(hideControlsTimer.current)
    }
    if (isPlaying) {
      hideControlsTimer.current = window.setTimeout(() => setShowControls(false), 2500)
    }
  }, [isPlaying])

  const showGestureHint = (text: string) => {
    setGestureHint(text)
    if (gestureHintTimer.current) window.clearTimeout(gestureHintTimer.current)
    gestureHintTimer.current = window.setTimeout(() => setGestureHint(null), 900)
  }

  // Trigger seek animation (double-tap ripple effect)
  const triggerSeekAnimation = (side: 'left' | 'right') => {
    seekAnimationKey.current += 1
    const animation: SeekAnimation = { side, key: seekAnimationKey.current }
    setSeekAnimations(prev => [...prev, animation])
    setTimeout(() => {
      setSeekAnimations(prev => prev.filter(a => a.key !== animation.key))
    }, 600)
  }

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        mozFullScreenElement?: Element | null
        msFullscreenElement?: Element | null
      }
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Clear gesture hint on unmount
  useEffect(() => {
    return () => {
      if (gestureHintTimer.current) window.clearTimeout(gestureHintTimer.current)
    }
  }, [])

  // Check PiP support
  useEffect(() => {
    setIsPiPSupported(document.pictureInPictureEnabled ?? false)
  }, [])

  // PiP state listener
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePiPEnter = () => setIsPiPActive(true)
    const handlePiPExit = () => setIsPiPActive(false)

    video.addEventListener('enterpictureinpicture', handlePiPEnter)
    video.addEventListener('leavepictureinpicture', handlePiPExit)

    return () => {
      video.removeEventListener('enterpictureinpicture', handlePiPEnter)
      video.removeEventListener('leavepictureinpicture', handlePiPExit)
    }
  }, [])

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
  }, [showSpeedMenu])

  // Announce changes to screen readers
  const announce = useCallback((message: string) => {
    setAriaAnnouncement(message)
    setTimeout(() => setAriaAnnouncement(''), 1000)
  }, [])

  // Fix URL for external clients if it points to localhost
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const fixUrl = (url: string) => {
      try {
        const urlObj = new URL(url)
        const isLocal = ['localhost', '127.0.0.1'].includes(urlObj.hostname) || urlObj.hostname.startsWith('192.168.')
        if (isLocal && window.location.hostname !== urlObj.hostname) {
          console.log('Detected local video URL from external client. Using proxy.')
          return `/api/proxy-video?url=${encodeURIComponent(url)}`
        }
      } catch {
        // Invalid URL or relative path already
      }
      return url
    }
    setProcessedUrl(fixUrl(videoUrl))
    proxyFallbackTried.current = false
  }, [videoUrl])

  const safePlay = useCallback((reason: string) => {
    const video = videoRef.current
    if (!video) return

    if (!isMp4Source) {
      console.warn('Formato no soportado, solo MP4. Motivo:', reason)
      return
    }

    if (!video.src) {
      console.warn('No hay fuente de video para reproducir. Motivo:', reason)
      return
    }

    const bypassReadyState = reason.startsWith('remote') || reason.includes('sync')

    if (autoPlayBlocked && !hasUserGesture) {
      console.warn('Auto-play previously blocked, waiting for user gesture. reason:', reason)
      return
    }

    if (video.error) {
      if (typeof video.error.code === 'number' && video.error.code !== 0) {
        if (video.error.code === 4) {
          console.error('Video element has error: code=%s, message=%s', video.error.code, video.error.message || 'unknown')
          if (!proxyFallbackTried.current) {
            proxyFallbackTried.current = true
            const proxied = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`
            console.warn('Video error code 4, retrying through proxy', { reason, proxied })
            setProcessedUrl(proxied)
            video.src = proxied
            video.load()
            setPlaybackError(null)
            return
          }
          setPlaybackError('No se pudo reproducir el video tras reintentar. Verifica que el MP4 sea válido y accesible (CORS/HTTPS).')
          setIsPlaying(false)
          return
        }

        console.error(`Video element has error: code=${video.error.code}, message=${video.error.message}`)
        setPlaybackError(`No se pudo reproducir el video (código ${video.error.code}). Verifica que el MP4 sea accesible.`)
        setIsPlaying(false)
        return
      }
      console.warn('Video element reports error without code, attempting play anyway:', video.error)
    }

    if (!hasUserGesture && !video.muted) {
      video.muted = true
      setIsMuted(true)
    }

    if (video.readyState < 2 && !hasUserGesture && !bypassReadyState) {
      console.warn('Delaying play, readyState < 2 and no user gesture yet. reason:', reason)
      return
    }

    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err: unknown) => {
        if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
          console.warn('Play aborted (AbortError), will allow next attempt to retry')
          return
        }

        console.error('Failed to play video:', err)
        if (err && typeof err === 'object' && 'name' in err && ((err as { name?: string }).name === 'NotAllowedError' || (err as { name?: string }).name === 'NotSupportedError')) {
          setAutoPlayBlocked(true)
          setIsPlaying(false)
          setPlaybackError('No se pudo reproducir el video. Revisa compatibilidad y permisos de autoplay.')
        }
      })
    }
  }, [autoPlayBlocked, hasUserGesture, isMp4Source, videoUrl])
  
  // Connect to socket
  useEffect(() => {
    if (!socket) return

    const onConnect = () => {
      console.log('Connected to socket')
      socket.emit('join-room', { roomId, username })
    }

    if (socket.connected) {
      onConnect()
    }

    socket.on('connect', onConnect)

    socket.on('is-host', (hostStatus: boolean) => {
      setIsHost(hostStatus)
      console.log('Am I host?', hostStatus)
    })

    socket.on('global-buffer-state', ({ isReady }: { isReady: boolean }) => {
      console.log('Global buffer state:', isReady);
      setIsGlobalReady(isReady);
        
      if (!isReady && videoRef.current && !videoRef.current.paused) {
        // Force pause if someone is buffering
        console.log('Pausing due to buffering...');
        videoRef.current.pause();
        setIsPlaying(false);
      }
        
      // Clear any existing timeout when state changes
      if (bufferingTimeout) {
        clearTimeout(bufferingTimeout);
        setBufferingTimeout(null);
      }
        
      // If not ready, set a timeout to auto-recovery after 10 seconds
      if (!isReady && isHost) {
        const timeout = setTimeout(() => {
          console.warn('Buffering timeout reached - forcing ready state');
          setIsGlobalReady(true);
          socket.emit('force-ready', { roomId });
        }, 10000); // 10 second timeout
        setBufferingTimeout(timeout);
      }
    });

    socket.on('sync-request', ({ requesterId }: { requesterId: string }) => {
        // Only host responds to sync requests
        if (videoRef.current) {
            socket.emit('sync-response', { 
                requesterId, 
                time: videoRef.current.currentTime, 
                isPlaying: !videoRef.current.paused 
            });
        }
    });

    socket.on('play', ({ time }: { time: number }) => {
      console.log(`Received play event at ${time}s`);
      if (videoRef.current) {
        const diff = Math.abs(videoRef.current.currentTime - time);
        if (diff > 0.5) {
          console.log(`Syncing time from ${videoRef.current.currentTime}s to ${time}s`);
          videoRef.current.currentTime = time;
        }
        isRemoteUpdate.current = true;
        safePlay('remote-play');
        setIsPlaying(true);
        console.log('Video playing');
      }
    })

    socket.on('pause', ({ time }: { time: number }) => {
      console.log(`Received pause event at ${time}s`);
      if (videoRef.current) {
        isRemoteUpdate.current = true;
        videoRef.current.pause();
        videoRef.current.currentTime = time;
        setIsPlaying(false);
        console.log('Video paused');
      }
    })

    socket.on('seek', ({ time }: { time: number }) => {
      console.log(`Received seek event to ${time}s`);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        console.log('Video seeked');
      }
    })

    socket.on('sync-response', ({ time, isPlaying: remoteIsPlaying }: { time: number, isPlaying: boolean }) => {
        if (videoRef.current) {
            const diff = Math.abs(videoRef.current.currentTime - time);
            if (diff > 1) { // Only sync if difference is significant
                videoRef.current.currentTime = time;
            }
            
            if (remoteIsPlaying && videoRef.current.paused) {
            safePlay('sync-response');
            setIsPlaying(true);
            } else if (!remoteIsPlaying && !videoRef.current.paused) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    });

    socket.on('sync-check', ({ time, isPlaying: remoteIsPlaying, sentAt }: { time: number, isPlaying: boolean, sentAt?: number }) => {
      if (videoRef.current && !isHost) { // Only non-hosts sync to host
         const networkDelay = sentAt ? (Date.now() - sentAt) / 1000 : 0;
         const targetTime = time + networkDelay;
         const diff = Math.abs(videoRef.current.currentTime - targetTime);
         if (diff > 1.5) { // tighten drift threshold with latency compensation
           console.log("Drift detected, syncing...", { targetTime, diff });
           videoRef.current.currentTime = targetTime;
         }
             
         if (remoteIsPlaying !== !videoRef.current.paused) {
         if (remoteIsPlaying) safePlay('sync-check');
           else videoRef.current.pause();
           setIsPlaying(remoteIsPlaying);
         }
      }
    });

    socket.on('host-changed', ({ hostId }: { hostId: string }) => {
      const amHost = hostId === socket.id;
      setIsHost(amHost);
      if (!amHost && socket.connected) {
        socket.emit('sync-request', { requesterId: socket.id });
      }
    });

    socket.on('persisted-state', ({ time, isPlaying: persistedPlaying }: { time: number, isPlaying: boolean }) => {
      const video = videoRef.current;
      if (!video || Number.isNaN(time)) return;

      const diff = Math.abs(video.currentTime - time);
      if (diff > 0.5) {
        video.currentTime = time;
      }

      if (persistedPlaying) {
        safePlay('persisted-state');
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    });

    return () => {
      socket.off('connect', onConnect)
      socket.off('is-host')
      socket.off('global-buffer-state')
      socket.off('sync-request')
      socket.off('play')
      socket.off('pause')
      socket.off('seek')
      socket.off('sync-response')
      socket.off('sync-check')
      socket.off('host-changed')
      socket.off('persisted-state')
    }
  }, [bufferingTimeout, isHost, roomId, safePlay, socket, username])

  // Periodic time update from host
    useEffect(() => {
      if (!isHost || !socket || !videoRef.current) return;

      const interval = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused) {
          socket.emit('time-update', { 
            roomId, 
            time: videoRef.current.currentTime,
            isPlaying: true 
          });
        }
      }, 2000);

      return () => clearInterval(interval);
    }, [isHost, roomId, socket]);

  // Check buffer status periodically
    useEffect(() => {
      if (!socket || !videoRef.current) return;

      const emitReadyIfPossible = () => {
        const video = videoRef.current!
        // Be lenient: consider buffered once HAVE_CURRENT_DATA (2) or any buffered range exists
        const hasData = video.readyState >= 2 || video.buffered.length > 0
        if (!isLocalBuffered && hasData) {
          setIsLocalBuffered(true)
          socket.emit('buffer-status', { roomId, isBuffered: true })
        }
      }

      const checkBuffer = () => {
          if (!videoRef.current) return;
          
          const video = videoRef.current;
          const currentTime = video.currentTime;
          const duration = video.duration;
          
          let bufferedEnd = 0;
          for (let i = 0; i < video.buffered.length; i++) {
              if (video.buffered.start(i) <= currentTime && video.buffered.end(i) >= currentTime) {
                  bufferedEnd = video.buffered.end(i);
                  break;
              }
          }
          
          // IMPROVED: More lenient buffering logic
          // Consider buffered if:
          // 1. Browser has enough data (readyState === 4 = HAVE_ENOUGH_DATA)
          // 2. We are very close to the end of the video
          // 3. We have at least 1 second buffered AND readyState >= 2 (HAVE_CURRENT_DATA)
          // 4. ReadyState >= 3 (HAVE_FUTURE_DATA) - can play without stalling
            const isBuffered = 
              (video.readyState >= 2) || // HAVE_CURRENT_DATA or better
              (bufferedEnd >= duration - 0.5) ||
              (video.readyState >= 1 && (bufferedEnd - currentTime > 0.5));
          
          // Only emit if state changed to avoid spam
          if (isBuffered !== isLocalBuffered) {
              console.log(`Buffer state changed: ${isBuffered}, readyState: ${video.readyState}, buffered: ${(bufferedEnd - currentTime).toFixed(2)}s`);
              setIsLocalBuffered(isBuffered);
              socket.emit('buffer-status', { roomId, isBuffered });
          }
      };

      // Initial check on mount
      checkBuffer();
      
      const videoEl = videoRef.current;

      const interval = setInterval(checkBuffer, 1000);
      videoEl.addEventListener('progress', checkBuffer);
      videoEl.addEventListener('waiting', checkBuffer);
      videoEl.addEventListener('canplaythrough', checkBuffer);
      videoEl.addEventListener('loadeddata', checkBuffer);
      videoEl.addEventListener('loadedmetadata', emitReadyIfPossible);
      videoEl.addEventListener('canplay', emitReadyIfPossible);
      
      return () => {
          clearInterval(interval);
            if (videoEl) {
              videoEl.removeEventListener('progress', checkBuffer);
              videoEl.removeEventListener('waiting', checkBuffer);
              videoEl.removeEventListener('canplaythrough', checkBuffer);
              videoEl.removeEventListener('loadeddata', checkBuffer);
              videoEl.removeEventListener('loadedmetadata', emitReadyIfPossible);
              videoEl.removeEventListener('canplay', emitReadyIfPossible);
            }
      };
  }, [isLocalBuffered, roomId, socket]);

  const handlePlay = () => {
    if (!isHost) {
      console.log('Non-host cannot play');
      return;
    }

    if (!isMp4Source) {
      console.warn('Solo se permiten videos MP4')
      return
    }
    
    if (!socket || !socket.connected) {
      console.error('Socket not connected, cannot play');
      alert('Connection lost. Please refresh the page.');
      return;
    }
    
    if (!isGlobalReady) {
        const forcePlay = window.confirm(
            "Some users are still buffering. Do you want to start anyway?\n\n" +
            "Click OK to force start, or Cancel to wait."
        );
        
        if (!forcePlay) {
            return;
        }
        
        // Force global ready state
        console.log('Host forcing play despite buffering');
        setIsGlobalReady(true);
        socket.emit('force-ready', { roomId });
    }
    
    if (videoRef.current) {
      setHasUserGesture(true);
      setAutoPlayBlocked(false);
      const currentTime = videoRef.current.currentTime;
      console.log(`Host initiating play at ${currentTime}s`);
      safePlay('host-click');
      setIsPlaying(true);
      if (socket) {
        socket.emit('play', { roomId, time: currentTime })
      }
      // socket.emit('play') is handled by onPlay
    }
  }

  const handlePause = () => {
    if (!isHost) {
      console.log('Non-host cannot pause');
      return;
    }
    
    if (!socket || !socket.connected) {
      console.error('Socket not connected, cannot pause');
      return;
    }
    
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      console.log(`Host initiating pause at ${currentTime}s`);
      videoRef.current.pause();
      setIsPlaying(false);
      if (socket) {
        socket.emit('pause', { roomId, time: currentTime })
      }
      // socket.emit('pause') is handled by onPause
    }
  }

  const handleSeekFromInput = (time: number) => {
    if (!isHost) {
      console.log('Non-host cannot seek');
      return;
    }
    if (!socket || !socket.connected) {
      console.error('Socket not connected, cannot seek');
      return;
    }

    setSeekPreview(time)

    if (videoRef.current) {
      videoRef.current.currentTime = time
      setMediaState((prev) => ({ ...prev, currentTime: time }))
    }
  }

  const commitSeek = () => {
    if (!isHost || !socket || !socket.connected || seekPreview === null) return
    setIsLocalBuffered(false)
    socket.emit('buffer-status', { roomId, isBuffered: false })
    const time = seekPreview
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setMediaState((prev) => ({ ...prev, currentTime: time }))
    }
    socket.emit('seek', { roomId, time })
    setSeekPreview(null)
    setSeeking(false)
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
      if (!videoRef.current.muted && volume === 0) {
        setVolume(0.5)
        videoRef.current.volume = 0.5
      }
    }
  }

  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      const clampedVolume = Math.max(0, Math.min(1, newVolume))
      videoRef.current.volume = clampedVolume
      setVolume(clampedVolume)
      setIsMuted(clampedVolume === 0)
      videoRef.current.muted = clampedVolume === 0
    }
  }

  const skipBackward = () => {
    if (!isHost || !videoRef.current) return
    const newTime = Math.max(0, videoRef.current.currentTime - 10)
    videoRef.current.currentTime = newTime
    if (socket?.connected) {
      socket.emit('seek', { roomId, time: newTime })
    }
    triggerSeekAnimation('left')
    showGestureHint('-10s')
    announce('Retrocedido 10 segundos')
  }

  const skipForward = () => {
    if (!isHost || !videoRef.current) return
    const newTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10)
    videoRef.current.currentTime = newTime
    if (socket?.connected) {
      socket.emit('seek', { roomId, time: newTime })
    }
    triggerSeekAnimation('right')
    showGestureHint('+10s')
    announce('Adelantado 10 segundos')
  }

  const seekToStart = () => {
    if (!isHost || !videoRef.current) return
    videoRef.current.currentTime = 0
    if (socket?.connected) {
      socket.emit('seek', { roomId, time: 0 })
    }
    showGestureHint('Inicio')
    announce('Ir al inicio')
  }

  const seekToEnd = () => {
    if (!isHost || !videoRef.current) return
    const endTime = videoRef.current.duration || 0
    videoRef.current.currentTime = endTime
    if (socket?.connected) {
      socket.emit('seek', { roomId, time: endTime })
    }
    showGestureHint('Fin')
    announce('Ir al final')
  }

  const changePlaybackSpeed = (speed: PlaybackSpeed) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
      setPlaybackSpeed(speed)
      showGestureHint(`${speed}x`)
      announce(`Velocidad ${speed}x`)
    }
    setShowSpeedMenu(false)
  }

  const togglePictureInPicture = async () => {
    const video = videoRef.current
    if (!video || !isPiPSupported) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        announce('Salió de Picture-in-Picture')
      } else {
        await video.requestPictureInPicture()
        announce('Modo Picture-in-Picture activado')
      }
    } catch (err) {
      console.error('PiP error:', err)
    }
  }

  const toggleFullScreen = () => {
    const target = containerRef.current
    if (!target) return

    type FullscreenTarget = HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
      mozRequestFullScreen?: () => Promise<void> | void
      msRequestFullscreen?: () => Promise<void> | void
    }

    type FullscreenDoc = Document & {
      webkitFullscreenElement?: Element | null
      mozFullScreenElement?: Element | null
      msFullscreenElement?: Element | null
      webkitExitFullscreen?: () => Promise<void> | void
      mozCancelFullScreen?: () => Promise<void> | void
      msExitFullscreen?: () => Promise<void> | void
    }

    type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

    const requestFs = (el: HTMLElement) => {
      const anyEl = el as FullscreenTarget
      const fn = anyEl.requestFullscreen || anyEl.webkitRequestFullscreen || anyEl.mozRequestFullScreen || anyEl.msRequestFullscreen
      if (fn) {
        const result = fn.call(anyEl)
        if (result && typeof result.catch === 'function') {
          result.catch((err: unknown) => console.error('Failed to enter fullscreen', err))
        }
      } else {
        console.warn('Fullscreen API not available on this element')
      }
    }

    const doc = document as FullscreenDoc
    if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
      const exitFn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen
      if (exitFn) exitFn.call(document)
    } else {
      const video = videoRef.current as WebkitVideo | null
      if (video && typeof video.webkitEnterFullscreen === 'function') {
        try {
          video.webkitEnterFullscreen()
          return
        } catch (err) {
          console.warn('webkitEnterFullscreen failed, falling back to container fullscreen', err)
        }
      }
      requestFs(target)
    }
  }

  // Track time and duration for custom controls
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTime = () => {
      // Calculate buffered amount
      let bufferedEnd = 0
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
          bufferedEnd = video.buffered.end(i)
          break
        }
      }
      setMediaState({ 
        currentTime: video.currentTime, 
        duration: video.duration || 0,
        buffered: bufferedEnd
      })
    }

    const handleLoaded = () => {
      setMediaState({ 
        currentTime: video.currentTime, 
        duration: video.duration || 0,
        buffered: 0 
      })
    }

    video.addEventListener('timeupdate', handleTime)
    video.addEventListener('progress', handleTime)
    video.addEventListener('loadedmetadata', handleLoaded)

    return () => {
      video.removeEventListener('timeupdate', handleTime)
      video.removeEventListener('progress', handleTime)
      video.removeEventListener('loadedmetadata', handleLoaded)
    }
  }, [videoRef])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    bumpControls()
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current)
      if (gestureHintTimer.current) window.clearTimeout(gestureHintTimer.current)
    }
  }, [bumpControls, isPlaying])

  useEffect(() => {
    if (!volumeHint) return
    const timer = window.setTimeout(() => setVolumeHint(null), 900)
    return () => window.clearTimeout(timer)
  }, [volumeHint])

  useEffect(() => {
    if (!gestureHint) return
    const timer = window.setTimeout(() => setGestureHint(null), 900)
    return () => window.clearTimeout(timer)
  }, [gestureHint])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.setAttribute('x-webkit-airplay', 'allow')
    video.setAttribute('x5-video-player-type', 'h5')
    video.setAttribute('x5-video-player-fullscreen', 'true')
    video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback')
  }, [isMp4Source])

  const handleTouchStart = (e: React.TouchEvent) => {
    setHasUserGesture(true)
    setAutoPlayBlocked(false)
    bumpControls()
    touchStartRef.current = e.touches[0]
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !videoRef.current) return
    const start = touchStartRef.current
    const current = e.touches[0]
    const deltaY = start.clientY - current.clientY
    // Adjust volume with vertical swipe
    if (Math.abs(deltaY) > 25) {
      const video = videoRef.current
      const change = deltaY / 400
      const nextVolume = Math.max(0, Math.min(1, video.volume + change))
      video.volume = nextVolume
      setVolumeHint(`Volumen ${Math.round(nextVolume * 100)}%`)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    bumpControls()
    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current
    const touch = e.changedTouches[0]
    const video = videoRef.current
    if (video && timeSinceLastTap > 0 && timeSinceLastTap < 280) {
      const rect = video.getBoundingClientRect()
      const isLeft = touch.clientX - rect.left < rect.width / 2
      const jump = isLeft ? -10 : 10
      const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + jump))
      video.currentTime = target
      if (isHost && socket?.connected) {
        socket.emit('seek', { roomId, time: target })
      }
      triggerSeekAnimation(isLeft ? 'left' : 'right')
      showGestureHint(isLeft ? '-10s' : '+10s')
    }
    lastTapRef.current = now
    touchStartRef.current = null
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (document.activeElement instanceof HTMLInputElement || 
          document.activeElement instanceof HTMLTextAreaElement ||
          (document.activeElement as HTMLElement)?.isContentEditable) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'arrowleft':
          e.preventDefault()
          skipBackward()
          break
        case 'arrowright':
          e.preventDefault()
          skipForward()
          break
        case 'arrowup':
          e.preventDefault()
          handleVolumeChange(Math.min(1, volume + 0.1))
          setVolumeHint(`Volumen ${Math.round(Math.min(1, volume + 0.1) * 100)}%`)
          announce(`Volumen ${Math.round(Math.min(1, volume + 0.1) * 100)}%`)
          break
        case 'arrowdown':
          e.preventDefault()
          handleVolumeChange(Math.max(0, volume - 0.1))
          setVolumeHint(`Volumen ${Math.round(Math.max(0, volume - 0.1) * 100)}%`)
          announce(`Volumen ${Math.round(Math.max(0, volume - 0.1) * 100)}%`)
          break
        case 'home':
          e.preventDefault()
          seekToStart()
          break
        case 'end':
          e.preventDefault()
          seekToEnd()
          break
        case 'f':
          e.preventDefault()
          toggleFullScreen()
          announce(isFullscreen ? 'Salió de pantalla completa' : 'Pantalla completa')
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          announce(isMuted ? 'Audio activado' : 'Audio silenciado')
          break
        case 'p':
          if (e.shiftKey && isPiPSupported) {
            e.preventDefault()
            togglePictureInPicture()
          }
          break
        case ' ':
        case 'enter':
          e.preventDefault()
          if (isHost) {
            if (isPlaying) {
              handlePause()
              announce('Video pausado')
            } else {
              handlePlay()
              announce('Video reproduciendo')
            }
          }
          break
        case ',':
          // Decrease speed
          if (isHost) {
            e.preventDefault()
            const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
            if (currentIdx > 0) {
              changePlaybackSpeed(PLAYBACK_SPEEDS[currentIdx - 1])
            }
          }
          break
        case '.':
          // Increase speed
          if (isHost) {
            e.preventDefault()
            const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
            if (currentIdx < PLAYBACK_SPEEDS.length - 1) {
              changePlaybackSpeed(PLAYBACK_SPEEDS[currentIdx + 1])
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [volume, isHost, isPlaying, isMuted, isFullscreen, playbackSpeed, isPiPSupported, announce])

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "relative w-full max-w-5xl mx-auto bg-black rounded-xl overflow-hidden shadow-2xl",
        "ring-1 ring-white/10",
        isFullscreen && "max-w-none rounded-none"
      )}
      role="region"
      aria-label="Reproductor de video"
      tabIndex={0}
    >
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
      >
        {ariaAnnouncement}
      </div>

      <VideoHeader
        socketStatus={socketStatus}
        isHost={isHost}
        username={username}
        users={users}
        onTransferHost={onTransferHost}
        showControls={showControls}
        isFullscreen={isFullscreen}
        micMuted={micMuted}
        onToggleMic={onToggleMic}
        onOpenChat={onOpenChat}
        socketId={socket?.id}
      />

      {/* Error overlays */}
      {!isMp4Source && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center px-6 py-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <Settings className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Formato no soportado</p>
            <p className="text-gray-400 text-sm">Solo se permiten videos en formato MP4. Por favor, actualiza la fuente del video.</p>
          </div>
        </div>
      )}
      
      {playbackError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center px-6 py-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <VolumeX className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Error de reproducción</p>
            <p className="text-gray-400 text-sm">{playbackError}</p>
          </div>
        </div>
      )}
      
      {autoPlayBlocked && !hasUserGesture && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => {
              setHasUserGesture(true)
              setAutoPlayBlocked(false)
              safePlay('user-gesture')
            }}
            className="group flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-2xl hover:from-blue-500 hover:to-blue-600 transition-all duration-300 hover:scale-105"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
            <span className="font-semibold text-lg">Pulsa para reproducir</span>
          </button>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        src={isMp4Source ? processedUrl : undefined}
        className="w-full h-auto touch-manipulation select-none"
        playsInline
        preload="metadata"
        muted={isMuted || !hasUserGesture || autoPlayBlocked}
        crossOrigin="anonymous"
        onPlay={() => {
          setIsPlaying(true)
          bumpControls()
          if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false
            return
          }
          if (isHost && socket) {
            socket.emit('play', { roomId, time: videoRef.current?.currentTime })
          }
        }}
        onPause={() => {
          setIsPlaying(false)
          bumpControls()
          if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false
            return
          }
          if (isHost && socket) {
            socket.emit('pause', { roomId, time: videoRef.current?.currentTime })
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          setHasUserGesture(true)
          setAutoPlayBlocked(false)
          bumpControls()
        }}
      />

      <GestureOverlay
        gestureHint={gestureHint}
        volumeHint={volumeHint}
        seekAnimations={seekAnimations}
      />

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
         <VideoOverlay
            showControls={showControls}
            isGlobalReady={isGlobalReady}
            isLocalBuffered={isLocalBuffered}
            isPlaying={isPlaying}
            isHost={isHost}
            onPlayPause={isPlaying ? handlePause : handlePlay}
            onSkipBackward={skipBackward}
            onSkipForward={skipForward}
            onBumpControls={bumpControls}
          />

          <VideoControls
            showControls={showControls}
            mediaState={mediaState}
            seeking={seeking}
            seekPreview={seekPreview}
            isHost={isHost}
            isPlaying={isPlaying}
            isMuted={isMuted}
            volume={volume}
            isFullscreen={isFullscreen}
            playbackSpeed={playbackSpeed}
            showSpeedMenu={showSpeedMenu}
            isPiPSupported={isPiPSupported}
            isPiPActive={isPiPActive}
            onPlayPause={isPlaying ? handlePause : handlePlay}
            onSkipBackward={skipBackward}
            onSkipForward={skipForward}
            onToggleMute={toggleMute}
            onVolumeChange={handleVolumeChange}
            onToggleFullScreen={toggleFullScreen}
            onTogglePiP={togglePictureInPicture}
            onChangeSpeed={changePlaybackSpeed}
            onSeek={handleSeekFromInput}
            onSeekStart={() => isHost && setSeeking(true)}
            onSeekEnd={commitSeek}
            setShowSpeedMenu={setShowSpeedMenu}
            showVolumeSlider={showVolumeSlider}
            setShowVolumeSlider={setShowVolumeSlider}
          />
      </div>
    </div>
  )
}
