/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Chat from '../src/components/Chat'
import { Socket } from 'socket.io-client'

// Mock socket
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
} as unknown as Socket

describe('Chat Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders chat interface', () => {
    render(<Chat roomId="test-room" socket={mockSocket} />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeDefined()
    expect(screen.getByText('Chat')).toBeDefined()
  })

  it('sends a message when form is submitted', () => {
    render(<Chat roomId="test-room" socket={mockSocket} />)
    
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello World' } })
    
    const form = input.closest('form')
    fireEvent.submit(form!)

    expect(mockSocket.emit).toHaveBeenCalledWith('send-message', {
      roomId: 'test-room',
      message: 'Hello World',
    })
    
    // Input should be cleared
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('displays received messages', () => {
    // Setup the on handler to capture the callback
    let messageCallback: (data: any) => void = () => {}
    (mockSocket.on as any).mockImplementation((event: string, cb: any) => {
      if (event === 'receive-message') {
        messageCallback = cb
      }
    })

    render(<Chat roomId="test-room" socket={mockSocket} />)

    // Simulate receiving a message
    const testMessage = {
      senderId: 'user-123',
      message: 'Test message from server',
    }

    // Trigger the callback
    act(() => {
      messageCallback(testMessage)
    })

    // Check if message is displayed
    expect(screen.getByText('Test message from server')).toBeDefined()
  })

  it('does not crash if socket is null', () => {
    render(<Chat roomId="test-room" socket={null} />)
    expect(screen.getByText('Chat')).toBeDefined()
  })
})
