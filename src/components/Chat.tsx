'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { Send } from 'lucide-react'

export interface ChatProps {
  roomId: string
  socket: Socket | null
}

export interface ChatHandle {
  focusInput: () => void
}

interface Message {
  message: string
  senderId: string
  senderName?: string
  isMe: boolean
}

const MAX_MESSAGE_LENGTH = 500;

function ChatComponent({ roomId, socket }: ChatProps, ref: React.Ref<ChatHandle>) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
  }), [])

  useEffect(() => {
    if (!socket) return

    const handleReceiveMessage = ({ message, senderId, senderName }: { message: string, senderId: string, senderName?: string }) => {
      setMessages((prev) => [...prev, { message, senderId, senderName, isMe: senderId === socket.id }])
    }

    socket.on('receive-message', handleReceiveMessage)

    return () => {
      socket.off('receive-message', handleReceiveMessage)
    }
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || !socket) return

    socket.emit('send-message', { roomId, message: trimmed })
    setInput('')
  }

  return (
    <div className="flex flex-col h-[400px] bg-gray-900 rounded-lg border border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-200">Chat</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.isMe
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.senderName && (
                <p className="text-xs text-gray-300 mb-1 opacity-80">{msg.senderName}{msg.isMe ? ' (tú)' : ''}</p>
              )}
              <p className="text-sm">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          ref={inputRef}
          className="flex-1 bg-gray-800 border-none rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md transition-colors"
          disabled={!input.trim() || input.trim().length > MAX_MESSAGE_LENGTH}
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  )
}

export default forwardRef(ChatComponent)
