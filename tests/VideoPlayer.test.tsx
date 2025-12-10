/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VideoPlayer from '../src/components/VideoPlayer'
import React from 'react'
import { Socket } from 'socket.io-client'

// Mock socket
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
} as unknown as Socket

// Mock HTMLMediaElement
beforeEach(() => {
  vi.clearAllMocks()
  
  // Mock video element properties and methods
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  })
})

describe('VideoPlayer Component', () => {
  const roomId = 'test-room'
  const videoUrl = 'https://example.com/video.mp4'

  it('renders video player with correct URL', () => {
    render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
    const videoElement = document.querySelector('video')
    expect(videoElement).toBeInTheDocument()
    expect(videoElement).toHaveAttribute('src', videoUrl)
    expect(videoElement).not.toHaveAttribute('controls')
    expect(videoElement).toHaveAttribute('playsinline')
  })

  it('bloquea fuentes que no sean MP4', () => {
    render(<VideoPlayer roomId={roomId} videoUrl="https://example.com/video.mkv" socket={mockSocket} />)
    const videoElement = document.querySelector('video')
    expect(videoElement?.getAttribute('src')).toBeNull()
    expect(screen.getByText(/Solo se permiten videos MP4/i)).toBeInTheDocument()
  })

  it('joins room on mount if socket is connected', () => {
    render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
    expect(mockSocket.emit).toHaveBeenCalledWith('join-room', expect.objectContaining({ roomId }))
  })

  it('handles host status correctly', () => {
    render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
    
    // We need to find the button. In the component, the button has <Play /> or <Pause /> icon.
    // It doesn't have explicit text "Play" or "Pause" usually, just the icon.
    // But let's assume it's the first button or we can find it by role.
    const playButton = screen.getByTestId('play-pause-btn')
    
    // Find the is-host callback
    const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
    
    expect(hostCallback).toBeDefined()

    // Act: Become host
    React.act(() => {
        hostCallback(true)
    })
    
    expect(playButton).not.toBeDisabled()
    
    // Act: Become non-host
    React.act(() => {
        hostCallback(false)
    })
    
    expect(playButton).toBeDisabled()
  })

  it('emits play event when host plays', () => {
    render(<VideoPlayer roomId={roomId} videoUrl={videoUrl} socket={mockSocket} />)
    
    // Become host
    const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
    React.act(() => {
        hostCallback(true)
    })

    // Simulate global ready
    const bufferCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'global-buffer-state')?.[1]
    React.act(() => {
        bufferCallback({ isReady: true })
    })

    const playButton = screen.getByTestId('play-pause-btn')
    fireEvent.click(playButton)

    expect(mockSocket.emit).toHaveBeenCalledWith('play', expect.any(Object))
  })
})
