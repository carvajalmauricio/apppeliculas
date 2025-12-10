/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import VideoPlayer from '../src/components/VideoPlayer'
import React from 'react'
import { Socket } from 'socket.io-client'
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
} as unknown as Socket

describe('VideoPlayer Mobile Failures', () => {
  const roomId = 'test-room'
  // We need to save the original location descriptor to restore it
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock video element methods
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0,
    })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      writable: true,
      value: 4, // HAVE_ENOUGH_DATA
    })
  })

  afterEach(() => {
    // Restore window.location if we messed with it
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor)
    }
  })

  it('converts localhost video URL to relative path when accessed externally', () => {
    // Mock window.location for external access
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hostname: 'my-tunnel.trycloudflare.com',
        href: 'https://my-tunnel.trycloudflare.com/room/123',
      }
    })
    
    const localVideoUrl = 'http://localhost:3000/video.mp4'
    
    render(<VideoPlayer roomId={roomId} videoUrl={localVideoUrl} socket={mockSocket} />)
    
    const videoElement = document.querySelector('video')
    expect(videoElement?.getAttribute('src')).toContain('/api/proxy-video')
  })

  it('does NOT convert localhost video URL when accessed locally', () => {
    // Mock window.location for local access
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hostname: 'localhost',
        href: 'http://localhost:3000/room/123',
      }
    })
    
    const localVideoUrl = 'http://localhost:3000/video.mp4'
    
    render(<VideoPlayer roomId={roomId} videoUrl={localVideoUrl} socket={mockSocket} />)
    
    const videoElement = document.querySelector('video')
    expect(videoElement).toHaveAttribute('src', localVideoUrl)
  })

  it('handles video error gracefully in safePlay', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    render(<VideoPlayer roomId={roomId} videoUrl="http://example.com/vid.mp4" socket={mockSocket} />)
    const videoElement = document.querySelector('video')!
    
    // Simulate an error on the video element
    Object.defineProperty(videoElement, 'error', {
      configurable: true,
      get: () => ({ code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' })
    })

    // Trigger play via socket event (which calls safePlay)
    const playCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'play')?.[1]
    
    act(() => {
      playCallback({ time: 10 })
    })

    // Should log error and NOT call play()
    expect(consoleSpy).toHaveBeenCalledWith(
      'Video element has error: code=%s, message=%s',
      4,
      'MEDIA_ERR_SRC_NOT_SUPPORTED'
    )
    expect(videoElement.play).not.toHaveBeenCalled()
    
    consoleSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('attempts to play if error object is empty/malformed (iOS case)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    render(<VideoPlayer roomId={roomId} videoUrl="http://example.com/vid.mp4" socket={mockSocket} />)
    const videoElement = document.querySelector('video')!
    
    // Simulate empty error object (iOS sometimes does this)
    Object.defineProperty(videoElement, 'error', {
      configurable: true,
      get: () => ({}) // Empty object, no code
    })

    // Trigger play via socket event
    const playCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'play')?.[1]
    
    act(() => {
      playCallback({ time: 10 })
    })

    // Should WARN but still attempt to play
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Video element reports error without code'), expect.anything())
    expect(videoElement.play).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('correctly emits pause when video pauses (simulating the loop cause)', () => {
    render(<VideoPlayer roomId={roomId} videoUrl="http://example.com/vid.mp4" socket={mockSocket} />)
    const videoElement = document.querySelector('video')!
    
    // Become host
    const hostCallback = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'is-host')?.[1]
    act(() => { hostCallback(true) })

    // Simulate video pausing (e.g. due to error or user action)
    fireEvent.pause(videoElement)

    // Should emit pause
    expect(mockSocket.emit).toHaveBeenCalledWith('pause', expect.objectContaining({ roomId }))
  })
})
