import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const accessToken = request.cookies.get('sb-access-token')?.value
    ?? request.cookies.get(`sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`)?.value

  const isLoggedIn = !!accessToken

  if (isLoggedIn && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isLoggedIn && (path === '/' || path.startsWith('/dashboard') || path.startsWith('/assets') || path.startsWith('/transactions') || path.startsWith('/revenus'))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/assets/:path*', '/transactions/:path*'],
}
