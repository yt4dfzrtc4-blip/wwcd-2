'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export default function AutoLogout() {
  const router = useRouter()
  const pathname = usePathname()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Ne pas activer sur la page login
    if (pathname === '/login') return

    const supabase = createClient()

    async function logout() {
      await supabase.auth.signOut()
      router.push('/login')
    }

    function reset() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(logout, TIMEOUT_MS)
    }

    const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [pathname])

  return null
}
