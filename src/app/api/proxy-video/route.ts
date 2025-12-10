import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const targetUrl = searchParams.get('url')

  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    // Security check: Only allow proxying to local network or specific domains if needed
    // For this use case (tunneling), we want to allow localhost/private IPs
    // In production, you might want to restrict this.
    
    // Forward the Range header if present
    const range = request.headers.get('range')
    const headers: HeadersInit = {}
    if (range) {
      headers['range'] = range
    }

    const response = await fetch(targetUrl, {
      headers,
      // We don't want to follow redirects automatically if we want to pass them back, 
      // but for video files usually we just want the content.
    })

    if (!response.ok) {
      return new NextResponse(`Failed to fetch video: ${response.status} ${response.statusText}`, { 
        status: response.status 
      })
    }

    // Copy relevant headers
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'video/mp4')
    responseHeaders.set('Content-Length', response.headers.get('Content-Length') || '')
    responseHeaders.set('Accept-Ranges', 'bytes')
    
    if (response.headers.has('Content-Range')) {
      responseHeaders.set('Content-Range', response.headers.get('Content-Range')!)
    }

    // Return the stream
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    })

  } catch (error) {
    console.error('Proxy error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
