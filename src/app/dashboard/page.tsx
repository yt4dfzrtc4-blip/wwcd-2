'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPositions, buildPortfolioSummary, formatEur, formatPct, CATEGORY_LABELS } from '@/lib/portfolio'
import type { PortfolioSummary, Snapshot, Position } from '@/types'
import Topbar from '@/components/layout/Topbar'
import KpiCard from '@/components/ui/KpiCard'
import EvolutionChart from '@/components/charts/EvolutionChart'
import DonutChart from '@/components/charts/DonutChart'
import TransactionModal from '@/components/ui/TransactionModal'
import { Plus, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [{ data: transactions }, { data: assets }, { data: accounts }, { data: snaps }] = await Promise.all([
      supabase.from('transactions').select('*, asset:assets(*, prices(*)), account:accounts(*)'),
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*'),
      supabase.from('snapshots').select('*').order('date', { ascending: true }).limit(365),
    ])

    if (transactions && assets && accounts) {
      const positions = buildPositions(transactions as any, assets as any, accounts as any)
      setSummary(buildPortfolioSummary(positions))
    }
    setSnapshots((snaps ?? []) as Snapshot[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleRefresh() {
    setRefreshing(true)
    await fetch('/api/prices/refresh', { method: 'POST' })
    await loadData()
    setRefreshing(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={handleRefresh} refreshing={refreshing} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
        Chargement…
      </div>
    </div>
  )

  const s = summary

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={handleRefresh} refreshing={refreshing} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
          <KpiCard
            label="Patrimoine total"
            value={s ? formatEur(s.total_value, 0) : '–'}
            sub={s ? `Capital : ${formatEur(s.total_invested, 0)}` : undefined}
            hidden={privacy}
          />
          <KpiCard
            label="Plus-value latente"
            value={s ? formatEur(s.total_pnl, 0) : '–'}
            sub={s ? formatPct(s.total_pnl_pct) : undefined}
            subColor={s && s.total_pnl >= 0 ? 'gain' : 'loss'}
            hidden={privacy}
          />
          <KpiCard
            label="Performance globale"
            value={s ? formatPct(s.total_pnl_pct) : '–'}
            subColor={s && s.total_pnl_pct >= 0 ? 'gain' : 'loss'}
            hidden={privacy}
          />
          <KpiCard
            label="Variation du jour"
            value={s ? formatEur(s.day_change, 0) : '–'}
            sub={s ? formatPct(s.day_change_pct) : undefined}
            subColor={s && s.day_change >= 0 ? 'gain' : 'loss'}
            hidden={privacy}
          />
        </div>

        {/* Graphiques */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Évolution 12 mois
            </p>
            <EvolutionChart snapshots={snapshots} hidden={privacy} />
          </div>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Répartition par catégorie
            </p>
            <DonutChart data={s?.by_category ?? {}} hidden={privacy} />
          </div>
        </div>

        {/* Positions */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Positions ouvertes ({s?.positions.length ?? 0})
            </p>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Triées par valorisation</span>
          </div>

          {/* En-tête */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 100px 110px 70px 20px',
            gap: 8, padding: '4px 10px', fontSize: 11, color: 'var(--muted)',
          }}>
            <span>Actif</span>
            <span style={{ textAlign: 'right' }}>Valeur</span>
            <span style={{ textAlign: 'right' }}>+/- latent</span>
            <span style={{ textAlign: 'right' }}>Catégorie</span>
            <span />
          </div>

          {!s?.positions.length ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
              Aucune position — ajoutez votre première transaction
            </div>
          ) : (
            s.positions.map(pos => (
              <PositionRow key={`${pos.asset.id}-${pos.account.id}`} pos={pos} hidden={privacy} onClick={() => router.push(`/assets/${pos.asset.id}`)} />
            ))
          )}
        </div>
      </main>

      {/* Bouton + */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--brand)', border: 'none',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Ajouter une transaction"
      >
        <Plus size={22} />
      </button>

      {showModal && (
        <TransactionModal onClose={() => setShowModal(false)} onSuccess={loadData} />
      )}
    </div>
  )
}

function PositionRow({ pos, hidden, onClick }: { pos: Position; hidden: boolean; onClick: () => void }) {
  const isGain = pos.pnl >= 0
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 100px 110px 70px 20px',
        gap: 8, padding: '9px 10px', borderRadius: 7,
        cursor: 'pointer', alignItems: 'center', fontSize: 13,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div>
        <p style={{ fontWeight: 500, fontSize: 13 }}>{pos.asset.name}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>{pos.account.name}</p>
      </div>
      <p style={{ textAlign: 'right', fontWeight: 500, filter: hidden ? 'blur(6px)' : 'none' }}>
        {formatEur(pos.current_value, 0)}
      </p>
      <div style={{ textAlign: 'right', filter: hidden ? 'blur(6px)' : 'none' }}>
        <p style={{ color: isGain ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
          {isGain ? '+' : ''}{formatEur(pos.pnl, 0)}
        </p>
        <p style={{ fontSize: 11, color: isGain ? 'var(--green)' : 'var(--red)' }}>
          {formatPct(pos.pnl_pct)}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={`badge badge-${pos.asset.category}`}>
          {CATEGORY_LABELS[pos.asset.category] ?? pos.asset.category}
        </span>
      </div>
      <ChevronRight size={14} color="var(--muted)" />
    </div>
  )
}
