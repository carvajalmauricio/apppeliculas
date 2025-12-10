import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { EventEmitter } from 'events'

// Create fresh mock for each test
let baseEmitter: EventEmitter
let mockEmitFn: ReturnType<typeof vi.fn>
let mockDisconnectFn: ReturnType<typeof vi.fn>
let mockRemoveAllListenersFn: ReturnType<typeof vi.fn>
let mockSocketInstance: {
  id: string
  connected: boolean
  emit: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  on: (event: string, callback: (...args: unknown[]) => void) => unknown
  off: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
}

const createMockSocket = () => {
  baseEmitter = new EventEmitter()
  mockEmitFn = vi.fn()
  mockDisconnectFn = vi.fn()
  mockRemoveAllListenersFn = vi.fn(() => baseEmitter.removeAllListeners())
  
  mockSocketInstance = {
    id: 'test-socket-id-123',
    connected: false,
    emit: mockEmitFn,
    disconnect: mockDisconnectFn,
    on: (event: string, callback: (...args: unknown[]) => void) => {
      baseEmitter.on(event, callback)
      return mockSocketInstance
    },
    off: vi.fn(),
    removeAllListeners: mockRemoveAllListenersFn,
  }
  return mockSocketInstance
}

// Helper to emit events to the component (simulates server sending events)
const emitToComponent = (event: string, ...args: unknown[]) => {
  baseEmitter.emit(event, ...args)
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => createMockSocket()),
}))

// Mock child components
vi.mock('@/components/VideoPlayer', () => ({
  default: ({ socketStatus, isHostExternal, username }: { socketStatus: string; isHostExternal: boolean; username: string }) => (
    <div data-testid="video-player">
      <span data-testid="socket-status">{socketStatus}</span>
      <span data-testid="is-host">{isHostExternal ? 'true' : 'false'}</span>
      <span data-testid="username-prop">{username}</span>
    </div>
  ),
}))

vi.mock('@/components/Chat', () => ({
  default: vi.fn(() => <div data-testid="chat">Chat</div>),
}))

vi.mock('@/components/VoiceChat', () => ({
  default: vi.fn(() => <div data-testid="voice-chat">VoiceChat</div>),
}))

import RoomClient from '@/components/RoomClient'

describe('RoomClient - Socket Connection and Host Status', () => {
  const mockLocalStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset localStorage mock
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key])
    
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value }),
      removeItem: vi.fn((key: string) => { delete mockLocalStorage[key] }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  describe('Socket Status', () => {
    it('should start with "connecting" status', () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      expect(screen.getByTestId('socket-status').textContent).toBe('connecting')
    })

    it('should update to "connected" when socket connects', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      // Simulate socket connection
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })
    })

    it('should emit join-room when socket connects', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(mockEmitFn).toHaveBeenCalledWith('join-room', {
          roomId: 'room-123',
          username: 'Invitado',
        })
      })
    })

    it('should use stored username from localStorage when connecting', async () => {
      mockLocalStorage['syncwatch:name'] = 'TestUser'
      
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(mockEmitFn).toHaveBeenCalledWith('join-room', {
          roomId: 'room-123',
          username: 'TestUser',
        })
      })
    })
  })

  describe('Host Status', () => {
    it('should start as non-host', () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      expect(screen.getByTestId('is-host').textContent).toBe('false')
    })

    it('should become host when receiving is-host event with true', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      act(() => {
        emitToComponent('is-host', true)
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('true')
      })
    })

    it('should update host status from presence event', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      act(() => {
        emitToComponent('presence', {
          users: [
            { id: 'test-socket-id-123', name: 'TestUser', isHost: true },
          ],
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('true')
      })
    })

    it('should update host status from host-changed event', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      act(() => {
        emitToComponent('host-changed', { hostId: 'test-socket-id-123' })
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('true')
      })
    })

    it('should NOT become host from host-changed if hostId is different', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      act(() => {
        emitToComponent('host-changed', { hostId: 'other-socket-id' })
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('false')
      })
    })
  })

  describe('Room Creator Flow', () => {
    it('should correctly set host status for room creator (first user)', async () => {
      mockLocalStorage['syncwatch:name'] = 'RoomCreator'
      
      render(<RoomClient roomId="new-room-id" videoUrl="http://test.com/video.mp4" />)
      
      // Simulate full connection flow
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      // Server responds with is-host: true for room creator
      act(() => {
        emitToComponent('is-host', true)
      })

      // Server also sends presence
      act(() => {
        emitToComponent('presence', {
          users: [
            { id: 'test-socket-id-123', name: 'RoomCreator', isHost: true },
          ],
        })
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('true')
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })

      // Verify the user's name is displayed
      expect(screen.getByText('RoomCreator (Host)')).toBeInTheDocument()
    })

    it('should maintain connected status after receiving server events', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      // Connect
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })

      // Receive is-host
      act(() => {
        emitToComponent('is-host', true)
      })

      // Status should still be connected
      expect(screen.getByTestId('socket-status').textContent).toBe('connected')

      // Receive presence
      act(() => {
        emitToComponent('presence', {
          users: [{ id: 'test-socket-id-123', name: 'User', isHost: true }],
        })
      })

      // Status should STILL be connected
      expect(screen.getByTestId('socket-status').textContent).toBe('connected')
    })
  })

  describe('Username Initialization', () => {
    it('should use "Invitado" when localStorage is empty', () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      expect(screen.getByTestId('username-prop').textContent).toBe('Invitado')
    })

    it('should use stored username from localStorage', () => {
      mockLocalStorage['syncwatch:name'] = 'StoredUser'
      
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      expect(screen.getByTestId('username-prop').textContent).toBe('StoredUser')
    })

    it('should read localStorage at the time of join-room emission', async () => {
      // Start with no stored name
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      // Simulate localStorage being set just before connect
      mockLocalStorage['syncwatch:name'] = 'LateStoredUser'
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        // Should use the localStorage value at time of connect
        expect(mockEmitFn).toHaveBeenCalledWith('join-room', {
          roomId: 'room-123',
          username: 'LateStoredUser',
        })
      })
    })
  })

  describe('Reconnection', () => {
    it('should handle reconnection properly', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      // Initial connect
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })

      // Disconnect
      act(() => {
        mockSocketInstance.connected = false
        emitToComponent('disconnect', 'transport close')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('disconnected')
      })

      // Reconnect
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('reconnect')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })

      // Should have emitted join-room again on reconnect
      const joinRoomCalls = mockEmitFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'join-room'
      )
      expect(joinRoomCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Single Socket Instance', () => {
    it('should only emit join-room ONCE on initial connect (no duplicate handlers)', async () => {
      render(<RoomClient roomId="room-123" videoUrl="http://test.com/video.mp4" />)
      
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })

      await waitFor(() => {
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
      })

      // Count join-room calls - should be exactly 1
      const joinRoomCalls = mockEmitFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'join-room'
      )
      expect(joinRoomCalls.length).toBe(1)
    })
  })

  describe('Crear sala con enlace MP4 largo', () => {
    it('debe aparecer como creador y conectado', async () => {
      mockLocalStorage['syncwatch:name'] = 'CreadorSala'
      const mp4Url = 'https://m68btj72qc.premilkyway.com/vp/01/03035/f8k5bd6wqacd_x/240638--84bf4bf0-7d4a-4f42-80aa-68b1c9b75cee--yhkv--2092154-streamwish.mp4?t=0Yjf9sMDo0Yn0VGFAcDr8QDowPi2x_igf4BXhkCbx_A&s=1765254379&e=129600&f=15176559&sp=400&i=186.71&srv=jubDiYuWLQCqfHI'
      render(<RoomClient roomId="sala-mp4" videoUrl={mp4Url} />)
      
      // Simular conexión
      act(() => {
        mockSocketInstance.connected = true
        emitToComponent('connect')
      })
      // Simular que el servidor responde que es host
      act(() => {
        emitToComponent('is-host', true)
      })
      // Simular presencia con el usuario como host
      act(() => {
        emitToComponent('presence', {
          users: [
            { id: 'test-socket-id-123', name: 'CreadorSala', isHost: true },
          ],
        })
      })
      await waitFor(() => {
        expect(screen.getByTestId('is-host').textContent).toBe('true')
        expect(screen.getByTestId('socket-status').textContent).toBe('connected')
        expect(screen.getByText('CreadorSala (Host)')).toBeInTheDocument()
      })
    })
  })
})
