'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import { usePrivacy } from '@/hooks/usePrivacy'
import { buildPositions, formatEur, formatPct, getPositionDetailPath } from '@/lib/portfolio'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, ChevronRight } from 'lucide-react'

export default function CreancesIndexPage() {
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
    const creancePositions = allPositions.filter((p: any) => p.asset.category === 'creance')
    setPositions(creancePositions)
    setTotalValue(creancePositions.reduce((s: number, p: any) => s + p.current_value, 0))
    setTotalInvested(creancePositions.reduce((s: number, p: any) => s + p.invested_value, 0))
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
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>Créances</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Prêts consentis</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          <div style={card}>
            <p style={lbl}>Capital restant</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{formatEur(totalValue, 0)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>Capital initial</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{formatEur(totalInvested, 0)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>Remboursé</p>
            <p style={{ fontSize: mobile ? 18 : 24, fontWeight: 500, color: pnl <= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(7px)' : 'none' }}>
              {formatEur(totalInvested - totalValue, 0)}
            </p>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
            <p style={lbl}>Créances ({positions.length})</p>
          </div>

          {positions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>Aucune créance</div>
          ) : (
            [...positions].sort((a, b) => b.current_value - a.current_value).map((pos: any) => {
              const repaidPct = pos.invested_value > 0 ? ((pos.invested_value - pos.current_value) / pos.invested_value) * 100 : 0
              return (
                <div key={pos.asset.id}
                  onClick={() => router.push(getPositionDetailPath(pos))}
                  style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 90px 40px' : '1fr 110px 110px 20px', gap: 8, padding: '10px 16px', borderTop: '0.5px solid var(--border)', cursor: 'pointer', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <p style={{ fontWeight: 500 }}>{pos.asset.name}</p>
                  <p style={{ textAlign: 'right', fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(pos.current_value, 0)}</p>
                  {!mobile && <p style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{repaidPct.toFixed(0)}% remboursé</p>}
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
