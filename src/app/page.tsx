import { createRoom } from '@/lib/actions'
import { Play } from 'lucide-react'
import CreateRoomForm from './ui/CreateRoomForm'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
      
      <div className="relative max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          {/* Logo */}
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/30 rotate-3 hover:rotate-0 transition-transform duration-300">
            <Play className="h-10 w-10 text-white ml-1" />
          </div>
          
          {/* Title */}
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Sync Watch
          </h1>
          
          {/* Subtitle */}
          <p className="mt-3 text-base text-gray-400 max-w-xs mx-auto">
            Mira videos con amigos, perfectamente sincronizados en tiempo real.
          </p>
        </div>
        
        {/* Form */}
        <CreateRoomForm action={createRoom} />
        
        {/* Footer */}
        <p className="text-center text-xs text-gray-600">
          Solo se admiten archivos MP4 con acceso público
        </p>
      </div>
    </div>
  )
}
