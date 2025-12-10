import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import VoiceChat from '../src/components/VoiceChat'
import { Socket } from 'socket.io-client'

// --- Mocks ---
vi.mock('simple-peer', () => {
  const instances: any[] = []
  ;(globalThis as any).__mockPeerInstances = instances

  class MockPeer {
    static instances = instances
    handlers: Record<string, ((...args: any[]) => void)[]> = {}
    destroyed = false
    opts: any

    constructor(opts: any) {
      this.opts = opts
      MockPeer.instances.push(this)
      // Simula señal del iniciador
      if (opts.initiator) {
        queueMicrotask(() => this.emit('signal', { type: 'offer', sdp: 'fake' }))
      }
    }

    on(event: string, cb: (...args: any[]) => void) {
      if (!this.handlers[event]) this.handlers[event] = []
      this.handlers[event].push(cb)
    }

    emit(event: string, ...args: any[]) {
      (this.handlers[event] || []).forEach(cb => cb(...args))
    }

    signal(data: any) {
      // Cuando recibimos signal, respondemos con otro signal para probar el retorno
      queueMicrotask(() => this.emit('signal', { type: 'answer', sdp: 'answer', from: data?.callerID }))
    }

    destroy() {
      this.destroyed = true
      this.emit('close')
    }
  }

  return { default: MockPeer }
})

// Mock getUserMedia
const mockTrackStop = vi.fn()
const mockAudioTrack = { enabled: true, stop: mockTrackStop, kind: 'audio' as const }
const mockStream = {
  getTracks: () => [mockAudioTrack],
  getAudioTracks: () => [mockAudioTrack],
} as unknown as MediaStream

Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(mockStream)
  },
  writable: true
})

// Socket mock con registro de handlers
const createSocket = () => {
  const handlers: Record<string, (...args: any[]) => void> = {}
  return {
    emit: vi.fn(),
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb
    }),
    off: vi.fn((event: string) => {
      delete handlers[event]
    }),
    getHandler: (event: string) => handlers[event],
    connected: true,
    id: 'socket-1'
  } as unknown as Socket & { getHandler: (event: string) => any }
}

describe('VoiceChat - detección de fallos críticos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const store = (globalThis as any).__mockPeerInstances as any[] | undefined
    if (store) store.length = 0
    mockAudioTrack.enabled = true
  })

  afterEach(() => {
    cleanup()
  })

  it('solicita micrófono y emite join-voice-chat con room correcto', async () => {
    const socket = createSocket()

    render(<VoiceChat roomId="room-1" socket={socket} />)

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: false, audio: true })
    })

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith('join-voice-chat', { roomId: 'room-1' })
    })
  })

  it('crea peers al recibir voice-all-users y envía voice-sending-signal', async () => {
    const socket = createSocket()
    render(<VoiceChat roomId="room-1" socket={socket} />)

    await waitFor(() => {
      expect(typeof socket.getHandler('voice-all-users')).toBe('function')
    })
    const allUsersHandler = socket.getHandler('voice-all-users') as Function

    // Simula llegada de lista de usuarios
    allUsersHandler(['peer-a'])

    // Debe crearse un peer y emitir señal de oferta
    await waitFor(() => {
      const instances = (globalThis as any).__mockPeerInstances as any[]
      expect(instances.length).toBe(1)
      expect(socket.emit).toHaveBeenCalledWith('voice-sending-signal', expect.objectContaining({ userToSignal: 'peer-a' }))
    })
  })

  it('responde con voice-returning-signal cuando recibe voice-user-joined-signal', async () => {
    const socket = createSocket()
    render(<VoiceChat roomId="room-1" socket={socket} />)

    await waitFor(() => {
      expect(typeof socket.getHandler('voice-user-joined-signal')).toBe('function')
    })
    const joinedSignalHandler = socket.getHandler('voice-user-joined-signal') as Function

    // Simula señal entrante
    joinedSignalHandler({ signal: { type: 'offer', sdp: 'sdp-offer' }, callerID: 'peer-b' })

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith('voice-returning-signal', expect.objectContaining({ callerID: 'peer-b' }))
    })
  })

  it('toggleMute deshabilita la pista y llama onMuteChange', async () => {
    const socket = createSocket()
    const onMuteChange = vi.fn()

    render(<VoiceChat roomId="room-1" socket={socket} onMuteChange={onMuteChange} />)

    const muteButton = await waitFor(() => screen.getByRole('button'))

    fireEvent.click(muteButton)

    expect(mockAudioTrack.enabled).toBe(false)
    expect(onMuteChange).toHaveBeenCalledWith(true)
  })

  it('cleanup detiene tracks y destruye peers', async () => {
    const socket = createSocket()
    const { unmount } = render(<VoiceChat roomId="room-1" socket={socket} />)

    await waitFor(() => {
      expect(typeof socket.getHandler('voice-all-users')).toBe('function')
    })
    const allUsersHandler = socket.getHandler('voice-all-users') as Function
    allUsersHandler(['peer-z'])

    await waitFor(() => ((globalThis as any).__mockPeerInstances as any[]).length === 1)

    unmount()

    expect(mockTrackStop).toHaveBeenCalled()
    expect(((globalThis as any).__mockPeerInstances as any[])[0]?.destroyed).toBe(true)
  })
})
