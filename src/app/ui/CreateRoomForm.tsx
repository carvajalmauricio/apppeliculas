"use client"

import { useState } from 'react'
import { createRoom } from '@/lib/actions'
import { Link2, Loader2, Play, AlertCircle } from 'lucide-react'

interface Props {
  action?: typeof createRoom
}

const MP4_REGEX = /\.mp4(\?.*)?$/i

export default function CreateRoomForm({ action }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)

  const normalizeUrl = (url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`
    }
    return url
  }

  const isValidMp4 = (url: string): boolean => {
    try {
      const parsed = new URL(normalizeUrl(url))
      return MP4_REGEX.test(parsed.pathname)
    } catch {
      return false
    }
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const normalized = normalizeUrl(value.trim())

    try {
      const parsed = new URL(normalized)
      if (!MP4_REGEX.test(parsed.pathname)) {
        setError('Solo se permiten URLs de archivos MP4.')
        return
      }
    } catch {
      setError('URL inválida. Incluye http(s) y un archivo MP4.')
      return
    }

    setSubmitting(true)
    const formData = new FormData()
    formData.set('videoUrl', normalized)
    if (action) {
      await action(formData)
    }
  }

  const showValidIndicator = value.length > 0 && isValidMp4(value)

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      {/* Input container with visual feedback */}
      <div className="relative">
        <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-300 mb-2">
          URL del video
        </label>
        
        <div className={`
          relative rounded-xl overflow-hidden transition-all duration-300
          ${focused ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950' : ''}
          ${error ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-gray-950' : ''}
          ${showValidIndicator ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-gray-950' : ''}
        `}>
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Link2 className={`h-5 w-5 transition-colors duration-200 ${
              showValidIndicator ? 'text-emerald-400' : 
              error ? 'text-red-400' : 
              focused ? 'text-blue-400' : 'text-gray-500'
            }`} />
          </div>
          
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            required
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="
              w-full pl-12 pr-4 py-4 
              bg-gray-900/80 backdrop-blur-sm
              border-2 border-gray-700/50
              text-white text-base
              placeholder-gray-500
              rounded-xl
              focus:outline-none focus:border-transparent
              transition-all duration-200
            "
            placeholder="https://ejemplo.com/video.mp4"
          />
          
          {/* Valid indicator */}
          {showValidIndicator && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
        
        {/* Helper text */}
        <p className="mt-2 text-xs text-gray-500">
          Pega el enlace directo a un archivo MP4
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400" role="alert">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className={`
          group relative w-full flex items-center justify-center gap-3
          py-4 px-6 
          text-base font-semibold
          rounded-xl
          transition-all duration-300
          ${submitting || !value.trim() 
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
            : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]'
          }
        `}
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creando sala...</span>
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            <span>Crear sala</span>
          </>
        )}
      </button>

      {/* Feature hints */}
      <div className="grid grid-cols-3 gap-3 pt-4">
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-gray-900/50">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <span className="text-xs text-gray-400 text-center">Sincronizado</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-gray-900/50">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-xs text-gray-400 text-center">Chat de voz</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-gray-900/50">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-xs text-gray-400 text-center">Chat en vivo</span>
        </div>
      </div>
    </form>
  )
}
