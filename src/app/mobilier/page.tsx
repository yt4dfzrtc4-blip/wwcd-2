'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import { usePrivacy } from '@/hooks/usePrivacy'
import { buildPositions, formatEur, formatPct, getPositionDetailPath } from '@/lib/portfolio'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, ChevronRight } from 'lucide-react'

export default function MobilierIndexPage() {
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [positions, setPositions] = useState<any[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [totalInvested, setTotalInvested] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadData = useCallback(async () => {
    const [{ data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*, bank:banks(*)'),
    ])

    const allTx = await fetchAllPaginated<any>((from, to) =>
      supabase
        .from('transactions')
        .select('*, asset:assets(*, prices(*)), account:accounts(*, bank:banks(*))')
        .range(from, to)
    )

    const allPositions = buildPositions(allTx, assets ?? [], accounts ?? [])
    const mobilierPositions = allPositions.filter((p: any) => p.asset.category === 'mobilier')
    setPositions(mobilierPositions)
    setTotalValue(mobilierPositions.reduce((s: number, p: any) => s + p.current_value, 0))
    setTotalInvested(mobilierPositions.reduce((s: number, p: any) => s + p.invested_value, 0))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const pnl = totalValue - totalInvested
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={loadData} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={loadData} />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>Mobilier</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Montres, art, bijoux…</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          <div style={card}>
            <p style={lbl}>Valeur totale</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{formatEur(totalValue, 0)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>Capital investi</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{formatEur(totalInvested, 0)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>+/- latent</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, color: pnl >= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(7px)' : 'none' }}>
              {pnl >= 0 ? '+' : ''}{formatEur(pnl, 0)}
            </p>
            <p style={{ fontSize: 12, color: pnl >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>{formatPct(pnlPct)}</p>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
            <p style={lbl}>Biens ({positions.length})</p>
          </div>

          {positions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>Aucun bien mobilier</div>
          ) : (
            [...positions].sort((a, b) => b.current_value - a.current_value).map((pos: any) => {
              const isGain = pos.pnl >= 0
              const weight = totalValue > 0 ? (pos.current_value / totalValue) * 100 : 0
              return (
                <div key={pos.asset.id}
                  onClick={() => router.push(getPositionDetailPath(pos))}
                  style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 90px 40px' : '1fr 110px 110px 60px 20px', gap: 8, padding: '10px 16px', borderTop: '0.5px solid var(--border)', cursor: 'pointer', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <p style={{ fontWeight: 500 }}>{pos.asset.name}</p>
                  <p style={{ textAlign: 'right', fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(pos.current_value, 0)}</p>
                  {!mobile && (
                    <div style={{ textAlign: 'right', filter: privacy ? 'blur(6px)' : 'none' }}>
                      <p style={{ color: isGain ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{isGain ? '+' : ''}{formatEur(pos.pnl, 0)}</p>
                      <p style={{ fontSize: 11, color: isGain ? 'var(--green)' : 'var(--red)' }}>{formatPct(pos.pnl_pct)}</p>
                    </div>
                  )}
                  <p style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{weight.toFixed(1)}%</p>
                  {!mobile && <ChevronRight size={14} color="var(--muted)" />}
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
