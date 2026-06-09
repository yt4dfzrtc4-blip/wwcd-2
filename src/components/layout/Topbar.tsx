'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, ArrowLeftRight, TrendingUp, Eye, EyeOff, RefreshCw, LogOut, Menu, X, Banknote, LineChart, BarChart2 } from 'lucide-react'

interface TopbarProps {
  privacy: boolean
  onTogglePrivacy: () => void
  onRefresh?: () => void
  refreshing?: boolean
  mobile?: boolean
}

export default function Topbar({ privacy, onTogglePrivacy, onRefresh, refreshing: refreshingProp, mobile: mobileProp }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch('/api/prices/refresh', { method: 'POST' })
      if (onRefresh) await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const isRefreshing = refreshingProp ?? refreshing

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Fermer le menu si on change de page
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const mobile = mobileProp ?? isMobile

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/assets',       icon: TrendingUp,      label: 'Actifs' },
    { href: '/revenus',      icon: Banknote,        label: 'Revenus' },
    { href: '/analyse',      icon: BarChart2,       label: 'Analyse' },
    { href: '/prediction',   icon: LineChart,       label: 'Prédiction' },
  ]

  return (
    <>
      <header style={{
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 200,
      }}>
        {/* Logo */}
        <span onClick={() => router.push('/dashboard')} style={{
          fontSize: 15, fontWeight: 500, color: 'var(--brand)',
          letterSpacing: '0.06em', marginRight: mobile ? 'auto' : 32, flexShrink: 0,
          cursor: 'pointer',
        }}>
          WWCD
        </span>

        {/* Nav desktop */}
        {!mobile && (
          <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href)
              return (
                <button key={href} onClick={() => router.push(href)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 7, border: 'none',
                  background: active ? 'var(--brand-light)' : 'transparent',
                  color: active ? 'var(--brand)' : 'var(--muted)',
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'background 0.15s',
                }}>
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              )
            })}
          </nav>
        )}

        {/* Actions desktop */}
        {!mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={handleRefresh} title="Actualiser les cours" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7,
              border: '0.5px solid var(--border)',
              background: 'transparent', color: 'var(--muted)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              <span>Actualiser</span>
            </button>
            <button onClick={onTogglePrivacy} title="Mode confidentialité" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 7, border: 'none', background: 'transparent',
              color: privacy ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer',
            }}>
              {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={handleLogout} title="Déconnexion" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 7, border: 'none', background: 'transparent',
              color: 'var(--muted)', cursor: 'pointer',
            }}>
              <LogOut size={15} />
            </button>
          </div>
        )}

        {/* Actions mobile */}
        {mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={handleRefresh} title="Actualiser les cours" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 7, border: 'none', background: 'transparent',
              color: 'var(--muted)', cursor: 'pointer',
            }}>
              <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button onClick={onTogglePrivacy} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 7, border: 'none', background: 'transparent',
              color: privacy ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer',
            }}>
              {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={() => setMenuOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 7, border: 'none', background: 'transparent',
              color: 'var(--text)', cursor: 'pointer',
            }}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </header>

      {/* Drawer mobile */}
      {mobile && menuOpen && (
        <>
          {/* Overlay */}
          <div onClick={() => setMenuOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
            zIndex: 150, top: 52,
          }} />
          {/* Menu */}
          <div style={{
            position: 'fixed', top: 52, left: 0, right: 0,
            background: 'var(--surface)', borderBottom: '0.5px solid var(--border)',
            zIndex: 160, padding: '8px 12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          }}>
            {/* Navigation */}
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href)
              return (
                <button key={href} onClick={() => { router.push(href); setMenuOpen(false) }} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '12px 12px', borderRadius: 10,
                  border: 'none', background: active ? 'var(--brand-light)' : 'transparent',
                  color: active ? 'var(--brand)' : 'var(--text)',
                  fontSize: 15, fontWeight: active ? 500 : 400,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  marginBottom: 2, textAlign: 'left',
                }}>
                  <Icon size={18} />
                  {label}
                </button>
              )
            })}

            <div style={{ borderTop: '0.5px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <button onClick={handleLogout} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 12px', borderRadius: 10,
                border: 'none', background: 'transparent',
                color: 'var(--red)', fontSize: 15, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', textAlign: 'left',
              }}>
                <LogOut size={18} />
                Déconnexion
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
