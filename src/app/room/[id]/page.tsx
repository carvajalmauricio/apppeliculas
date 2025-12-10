import { prisma } from '@/lib/prisma'
import RoomClient from '@/components/RoomClient'
import { notFound } from 'next/navigation'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const room = await prisma.room.findUnique({
    where: { id },
  })

  if (!room) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between py-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">Sync Watch Room</h1>
          <div className="text-sm text-gray-400">
            Room ID: <span className="font-mono text-blue-400">{id}</span>
          </div>
        </header>

        <main>
          <RoomClient roomId={id} videoUrl={room.videoUrl} />
        </main>
      </div>
    </div>
  )
}
