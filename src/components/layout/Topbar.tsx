'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, ArrowLeftRight, TrendingUp, Eye, EyeOff, RefreshCw, LogOut } from 'lucide-react'

interface TopbarProps {
  privacy: boolean
  onTogglePrivacy: () => void
  onRefresh: () => void
  refreshing?: boolean
}

export default function Topbar({ privacy, onTogglePrivacy, onRefresh, refreshing }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions',  icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/assets',        icon: TrendingUp,      label: 'Actifs' },
  ]

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '0.5px solid var(--border)',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      height: 52,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <span style={{
        fontSize: 15,
        fontWeight: 500,
        color: 'var(--brand)',
        letterSpacing: '0.06em',
        marginRight: 32,
        flexShrink: 0,
      }}>
        WWCD
      </span>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 7,
                border: 'none',
                background: active ? 'var(--brand-light)' : 'transparent',
                color: active ? 'var(--brand)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'background 0.15s',
              }}
            >
              <Icon size={15} />
              <span className="topbar-label">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onRefresh}
          title="Actualiser les cours"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            border: '0.5px solid var(--border)',
            background: 'transparent', color: 'var(--muted)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          <span className="topbar-label">Actualiser</span>
        </button>

        <button onClick={onTogglePrivacy} title="Mode confidentialité" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 7,
          border: 'none', background: 'transparent',
          color: privacy ? 'var(--brand)' : 'var(--muted)',
          cursor: 'pointer',
        }}>
          {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        <button onClick={handleLogout} title="Déconnexion" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 7,
          border: 'none', background: 'transparent',
          color: 'var(--muted)', cursor: 'pointer',
        }}>
          <LogOut size={15} />
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 639px) {
          .topbar-label { display: none !important; }
        }
      `}</style>
    </header>
  )
}
