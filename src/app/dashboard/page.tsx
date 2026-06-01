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
  const [byBank, setByBank] = useState<{ name: string; value: number }[]>([])
  const [byAccount, setByAccount] = useState<{ name: string; bank: string; value: number }[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [{ data: transactions }, { data: assets }, { data: accounts }, { data: snaps }] = await Promise.all([
      supabase.from('transactions').select('*, asset:assets(*, prices(*)), account:accounts(*, bank:banks(*))'),
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*, bank:banks(*)'),
      supabase.from('snapshots').select('*').order('date', { ascending: true }).limit(365),
    ])

    if (transactions && assets && accounts) {
      const positions = buildPositions(transactions as any, assets as any, accounts as any)
      const s = buildPortfolioSummary(positions)
      setSummary(s)

      // Répartition par compte
      const accountMap: Record<string, { name: string; bank: string; value: number }> = {}
      for (const pos of positions) {
        const acc = pos.account as any
        const key = acc.id
        if (!accountMap[key]) {
          accountMap[key] = {
            name: acc.name,
            bank: acc.bank?.name ?? '–',
            value: 0,
          }
        }
        accountMap[key].value += pos.current_value
      }
      const accountList = Object.values(accountMap).sort((a, b) => b.value - a.value)
      setByAccount(accountList)

      // Répartition par banque
      const bankMap: Record<string, { name: string; value: number }> = {}
      for (const acc of accountList) {
        const key = acc.bank
        if (!bankMap[key]) bankMap[key] = { name: key, value: 0 }
        bankMap[key].value += acc.value
      }
      setByBank(Object.values(bankMap).sort((a, b) => b.value - a.value))
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

  const totalValue = summary?.total_value ?? 0

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px] mb-4">
          <KpiCard label="Patrimoine total" value={s ? formatEur(s.total_value, 0) : '–'} sub={s ? `Capital : ${formatEur(s.total_invested, 0)}` : undefined} hidden={privacy} />
          <KpiCard label="Plus-value latente" value={s ? formatEur(s.total_pnl, 0) : '–'} sub={s ? formatPct(s.total_pnl_pct) : undefined} subColor={s && s.total_pnl >= 0 ? 'gain' : 'loss'} hidden={privacy} />
          <KpiCard label="Performance globale" value={s ? formatPct(s.total_pnl_pct) : '–'} subColor={s && s.total_pnl_pct >= 0 ? 'gain' : 'loss'} hidden={privacy} />
          <KpiCard label="Variation du jour" value={s ? formatEur(s.day_change, 0) : '–'} sub={s ? formatPct(s.day_change_pct) : undefined} subColor={s && s.day_change >= 0 ? 'gain' : 'loss'} hidden={privacy} />
        </div>

        {/* Graphiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px] mb-4">
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={sectionLabel}>Évolution 12 mois</p>
            <EvolutionChart snapshots={snapshots} hidden={privacy} />
          </div>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={sectionLabel}>Répartition par catégorie</p>
            <DonutChart data={s?.by_category ?? {}} hidden={privacy} />
          </div>
        </div>

        {/* Répartition par banque */}
        {byBank.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px] mb-4">
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <p style={sectionLabel}>Par banque</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {byBank.map(b => (
                  <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>{b.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(b.value, 0)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'right' }}>
                      {totalValue > 0 ? `${((b.value / totalValue) * 100).toFixed(0)} %` : '–'}
                    </span>
                    <div style={{ width: 80, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${totalValue > 0 ? (b.value / totalValue) * 100 : 0}%`, height: '100%', background: 'var(--brand)', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <p style={sectionLabel}>Par compte</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {byAccount.map(a => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{a.bank}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(a.value, 0)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'right' }}>
                      {totalValue > 0 ? `${((a.value / totalValue) * 100).toFixed(0)} %` : '–'}
                    </span>
                    <div style={{ width: 80, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${totalValue > 0 ? (a.value / totalValue) * 100 : 0}%`, height: '100%', background: '#1D9E75', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Positions */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={sectionLabel}>Positions ouvertes ({s?.positions.length ?? 0})</p>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Triées par valorisation</span>
          </div>

          {/* En-tête */}
          <div className="grid grid-cols-[1fr_90px_100px_16px] sm:grid-cols-[1fr_100px_110px_70px_20px] gap-2 px-[10px] py-1 text-[11px]" style={{ color: 'var(--muted)' }}>
            <span>Actif</span>
            <span className="text-right">Valeur</span>
            <span className="text-right">+/- latent</span>
            <span className="hidden sm:block text-right">Catégorie</span>
            <span className="hidden sm:block" />
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

      <button onClick={() => setShowModal(true)} style={{ position: 'fixed', bottom: 24, right: 24, width: 48, height: 48, borderRadius: '50%', background: 'var(--brand)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Ajouter une transaction">
        <Plus size={22} />
      </button>

      {showModal && <TransactionModal onClose={() => setShowModal(false)} onSuccess={loadData} />}
    </div>
  )
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }

function PositionRow({ pos, hidden, onClick }: { pos: Position; hidden: boolean; onClick: () => void }) {
  const isGain = pos.pnl >= 0
  return (
    <div
      className="grid grid-cols-[1fr_90px_100px_16px] sm:grid-cols-[1fr_100px_110px_70px_20px] gap-2 px-[10px] py-[9px] rounded-[7px] cursor-pointer items-center text-[13px] hover:bg-[--bg] transition-colors"
      onClick={onClick}
    >
      <div>
        <p style={{ fontWeight: 500, fontSize: 13 }}>{pos.asset.name}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>{pos.account.name}</p>
      </div>
      <p className="text-right font-medium" style={{ filter: hidden ? 'blur(6px)' : 'none' }}>{formatEur(pos.current_value, 0)}</p>
      <div className="text-right" style={{ filter: hidden ? 'blur(6px)' : 'none' }}>
        <p style={{ color: isGain ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{isGain ? '+' : ''}{formatEur(pos.pnl, 0)}</p>
        <p style={{ fontSize: 11, color: isGain ? 'var(--green)' : 'var(--red)' }}>{formatPct(pos.pnl_pct)}</p>
      </div>
      <div className="hidden sm:block text-right">
        <span className={`badge badge-${pos.asset.category}`}>{CATEGORY_LABELS[pos.asset.category] ?? pos.asset.category}</span>
      </div>
      <ChevronRight size={14} color="var(--muted)" />
    </div>
  )
}
