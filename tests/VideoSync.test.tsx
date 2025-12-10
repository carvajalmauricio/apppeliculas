/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import VideoPlayer from '../src/components/VideoPlayer'
import React from 'react'
import { Socket } from 'socket.io-client'

// Mock socket
const createMockSocket = () => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
  id: 'test-socket-id'
} as unknown as Socket)

// Mock HTMLMediaElement
beforeEach(() => {
  vi.clearAllMocks()
  
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  })
})

describe('Video Sync Across Different Networks', () => {
  const roomId = 'test-room'
  const videoUrl = 'https://example.com/video.mp4'

  describe('Host Broadcasting Events', () => {
    it('host emits play event with correct roomId and time', async () => {
      const mockSocket = createMockSocket()
      
      render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(true)
      })

      // Set global ready
      const bufferCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'global-buffer-state')?.[1]
      act(() => {
        bufferCallback({ isReady: true })
      })

      // Get play button and click
      const playButton = screen.getByTestId('play-pause-btn')
      
      fireEvent.click(playButton)

      // Verify emit was called with correct parameters
      expect(mockSocket.emit).toHaveBeenCalledWith('play', expect.objectContaining({
        roomId,
        time: expect.any(Number)
      }))
    })

    it('host emits pause event when pausing', async () => {
      const mockSocket = createMockSocket()
      
      render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(true)
      })

      // Simulate playing state
      const playButton = screen.getByTestId('play-pause-btn')
      
      // First play
      const bufferCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'global-buffer-state')?.[1]
      act(() => {
        bufferCallback({ isReady: true })
      })
      fireEvent.click(playButton)
      
      // Then pause
      fireEvent.click(playButton)

      // Verify pause was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('pause', expect.objectContaining({
        roomId,
        time: expect.any(Number)
      }))
    })

    it('validates socket connection before emitting play', () => {
      const mockSocket = createMockSocket()
      mockSocket.connected = false
      
      // Mock window.alert
      window.alert = vi.fn()
      
      render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(true)
      })

      const bufferCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'global-buffer-state')?.[1]
      act(() => {
        bufferCallback({ isReady: true })
      })

      const playButton = screen.getByTestId('play-pause-btn')
      
      fireEvent.click(playButton)

      // Should not emit and should alert user
      expect(mockSocket.emit).not.toHaveBeenCalledWith('play', expect.anything())
      expect(window.alert).toHaveBeenCalledWith('Connection lost. Please refresh the page.')
    })
  })

  describe('Client Receiving Events', () => {
    it('client receives and processes play event', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user non-host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(false)
      })

      // Get the play event handler
      const playCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'play')?.[1]
      expect(playCallback).toBeDefined()

      // Simulate receiving play event from host
      const videoElement = container.querySelector('video') as HTMLVideoElement
      Object.defineProperty(videoElement, 'currentTime', { value: 0, writable: true, configurable: true })
      
      act(() => {
        playCallback({ time: 10.5 })
      })

      // Video should play
      expect(videoElement.play).toHaveBeenCalled()
    })

    it('client receives and processes pause event', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user non-host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(false)
      })

      // Get the pause event handler
      const pauseCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'pause')?.[1]
      expect(pauseCallback).toBeDefined()

      // Simulate receiving pause event from host
      const videoElement = container.querySelector('video') as HTMLVideoElement
      
      act(() => {
        pauseCallback({ time: 15.3 })
      })

      // Video should pause and sync time
      expect(videoElement.pause).toHaveBeenCalled()
      expect(videoElement.currentTime).toBe(15.3)
    })

    it('client receives and processes seek event', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user non-host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(false)
      })

      // Get the seek event handler
      const seekCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'seek')?.[1]
      expect(seekCallback).toBeDefined()

      // Simulate receiving seek event from host
      const videoElement = container.querySelector('video') as HTMLVideoElement
      Object.defineProperty(videoElement, 'currentTime', { value: 0, writable: true, configurable: true })
      
      act(() => {
        seekCallback({ time: 30.7 })
      })

      // Video should seek to new time
      expect(videoElement.currentTime).toBe(30.7)
    })

    it('syncs time when difference is significant on play event', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      const playCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'play')?.[1]
      const videoElement = container.querySelector('video') as HTMLVideoElement
      
      // Set current time to 5s
      Object.defineProperty(videoElement, 'currentTime', { value: 5, writable: true, configurable: true })
      
      // Receive play event at 10s (diff > 0.5s)
      act(() => {
        playCallback({ time: 10 })
      })

      // Should sync to 10s
      expect(videoElement.currentTime).toBe(10)
      expect(videoElement.play).toHaveBeenCalled()
    })

    it('applies persisted state with play', () => {
      const mockSocket = createMockSocket()
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)

      const persistedCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'persisted-state')?.[1]
      expect(persistedCallback).toBeDefined()

      const videoElement = container.querySelector('video') as HTMLVideoElement
      Object.defineProperty(videoElement, 'currentTime', { value: 0, writable: true, configurable: true })
      Object.defineProperty(videoElement, 'readyState', { value: 2, configurable: true })

      act(() => {
        persistedCallback({ time: 12.3, isPlaying: true })
      })

      expect(videoElement.currentTime).toBe(12.3)
      expect(videoElement.play).toHaveBeenCalled()
    })

    it('applies persisted state with pause', () => {
      const mockSocket = createMockSocket()
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)

      const persistedCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'persisted-state')?.[1]
      expect(persistedCallback).toBeDefined()

      const videoElement = container.querySelector('video') as HTMLVideoElement
      Object.defineProperty(videoElement, 'currentTime', { value: 5, writable: true, configurable: true })

      act(() => {
        persistedCallback({ time: 5, isPlaying: false })
      })

      expect(videoElement.pause).toHaveBeenCalled()
      expect(videoElement.currentTime).toBe(5)
    })
  })

  describe('Non-host Restrictions', () => {
    it('non-host cannot emit play event', () => {
      const mockSocket = createMockSocket()
      
      render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user non-host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(false)
      })

      const playButton = screen.getByTestId('play-pause-btn')
      
      // Button should be disabled
      expect(playButton).toBeDisabled()
      
      // Try to click anyway
      fireEvent.click(playButton)

      // Should not emit play event
      expect(mockSocket.emit).not.toHaveBeenCalledWith('play', expect.anything())
    })

    it('non-host cannot emit pause event', () => {
      const mockSocket = createMockSocket()
      
      render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      // Make user non-host
      const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
      act(() => {
        hostCallback(false)
      })

      const playButton = screen.getByTestId('play-pause-btn')
      
      expect(playButton).toBeDisabled()
      
      fireEvent.click(playButton)

      // Should not emit pause event
      expect(mockSocket.emit).not.toHaveBeenCalledWith('pause', expect.anything())
    })
  })

  describe('Buffering State Sync', () => {
    it('emits buffer status when state changes', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      const videoElement = container.querySelector('video') as HTMLVideoElement
      
      // Mock video properties for buffered state
      Object.defineProperty(videoElement, 'readyState', { value: 4, configurable: true })
      Object.defineProperty(videoElement, 'currentTime', { value: 0, configurable: true })
      Object.defineProperty(videoElement, 'duration', { value: 100, configurable: true })
      Object.defineProperty(videoElement, 'buffered', { 
        value: { 
          length: 1, 
          start: () => 0, 
          end: () => 10 
        }, 
        configurable: true 
      })

      // Trigger buffer check
      act(() => {
        fireEvent(videoElement, new Event('progress'))
      })

      // Should emit buffer status
      expect(mockSocket.emit).toHaveBeenCalledWith('buffer-status', expect.objectContaining({
        roomId,
        isBuffered: expect.any(Boolean)
      }))
    })

    it('receives global buffer state and pauses if not ready', () => {
      const mockSocket = createMockSocket()
      
      const { container } = render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
      
      const videoElement = container.querySelector('video') as HTMLVideoElement
      Object.defineProperty(videoElement, 'paused', { value: false, configurable: true })
      
      // Get buffer state callback
      const bufferCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'global-buffer-state')?.[1]
      
      // Simulate global not ready
      act(() => {
        bufferCallback({ isReady: false })
      })

      // Should pause video
      expect(videoElement.pause).toHaveBeenCalled()
    })
  })
})
