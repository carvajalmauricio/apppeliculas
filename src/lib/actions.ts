'use server'

import { prisma } from './prisma'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const createRoomSchema = z.object({
  videoUrl: z.string().url(),
})

const MAX_SIZE_BYTES = 700 * 1024 * 1024 
const MP4_REGEX = /\.mp4(\?.*)?$/i

async function validateVideoUrl(rawUrl: string) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten URLs http(s)')
  }

  if (!MP4_REGEX.test(url.pathname)) {
    throw new Error('Solo se permiten archivos MP4')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })

    const contentType = res.headers.get('content-type') || ''
    const lengthHeader = res.headers.get('content-length')
    const size = lengthHeader ? Number(lengthHeader) : null

    if (!contentType.toLowerCase().includes('video/mp4')) {
      throw new Error('El recurso no es video/mp4')
    }

    if (size && size > MAX_SIZE_BYTES) {
      throw new Error('El archivo supera el límite permitido (~700MB)')
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
      throw new Error('No se pudo verificar la URL (timeout). Intenta otra fuente o más tarde.')
    }
    // Si falla HEAD por CORS, seguimos permitiendo siempre que sea mp4 y protocolo válido
    if (err instanceof Error && err.message.startsWith('El recurso')) {
      throw err
    }
    // Silencioso: permitir si solo fue un fallo de red/CORS
  } finally {
    clearTimeout(timeout)
  }
}

export async function createRoom(formData: FormData) {
  const videoUrl = formData.get('videoUrl')
  
  const result = createRoomSchema.safeParse({ videoUrl })

  if (!result.success) {
    throw new Error('Invalid URL')
  }

  await validateVideoUrl(result.data.videoUrl)

  const room = await prisma.room.create({
    data: {
      videoUrl: result.data.videoUrl,
    },
  })

  redirect(`/room/${room.id}`)
}
