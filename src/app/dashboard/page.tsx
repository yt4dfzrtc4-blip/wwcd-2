'use client'

import { usePrivacy } from '@/hooks/usePrivacy'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPositions, buildPortfolioSummary, formatEur, formatPct, CATEGORY_LABELS, getCategoryLabel, getCategoryBadgeClass } from '@/lib/portfolio'
import type { PortfolioSummary, Snapshot, Position } from '@/types'
import Topbar from '@/components/layout/Topbar'
import KpiCard from '@/components/ui/KpiCard'
import PortfolioEvolutionChart from '@/components/charts/PortfolioEvolutionChart'
import DonutChart from '@/components/charts/DonutChart'
import TransactionModal from '@/components/ui/TransactionModal'
import { Plus, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [byBank, setByBank] = useState<{ id: string; name: string; value: number }[]>([])
  const [byAccount, setByAccount] = useState<{ id: string; name: string; bank: string; bankId: string; value: number; pnl: number }[]>([])
  const { privacy, togglePrivacy } = usePrivacy()
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'value' | 'pnl' | 'pnl_pct' | 'day' | 'name' | 'category'>('value')
  const [totalDebt, setTotalDebt] = useState(0)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadData = useCallback(async () => {
    const [{ data: assets }, { data: accounts }, { data: snaps }, { data: prices }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*, bank:banks(*)'),
      supabase.from('snapshots').select('*').order('date', { ascending: true }),
      supabase.from('prices').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ])

    // Récupérer TOUTES les transactions par pages
    const allTransactions: any[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('transactions')
        .select('*, asset:assets(*, prices(*)), account:accounts(*, bank:banks(*))')
        .range(from, from + PAGE - 1)
      if (!page || page.length === 0) break
      allTransactions.push(...page)
      if (page.length < PAGE) break
      from += PAGE
    }
    const transactions = allTransactions

    if (transactions && assets && accounts) {
      const positions = buildPositions(transactions as any, assets as any, accounts as any)
      const s = buildPortfolioSummary(positions)
      setSummary(s)

      // Répartition par compte
      const accountMap: Record<string, { id: string; name: string; bank: string; bankId: string; value: number; pnl: number }> = {}
      for (const pos of positions) {
        const acc = pos.account as any
        const key = acc.id
        if (!accountMap[key]) {
          accountMap[key] = { id: acc.id, name: acc.name, bank: acc.bank?.name ?? '–', bankId: acc.bank?.id ?? '', value: 0, pnl: 0 }
        }
        accountMap[key].value += pos.current_value
        accountMap[key].pnl += pos.pnl
      }
      const accountList = Object.values(accountMap).sort((a, b) => b.value - a.value)
      setByAccount(accountList)

      // Répartition par banque
      const bankMap: Record<string, { id: string; name: string; value: number }> = {}
      for (const acc of accountList) {
        const key = acc.bankId || acc.bank
        if (!bankMap[key]) bankMap[key] = { id: acc.bankId, name: acc.bank, value: 0 }
        bankMap[key].value += acc.value
      }
      setByBank(Object.values(bankMap).sort((a, b) => b.value - a.value))
    }
    setSnapshots((snaps ?? []) as Snapshot[])

    // Dettes (table loans optionnelle)
    const { data: loans } = await supabase.from('loans').select('remaining_amount')
    if (loans) setTotalDebt(loans.reduce((s: number, l: any) => s + (l.remaining_amount ?? 0), 0))
    // Date de mise à jour : chercher dans les assets déjà chargés
    const allUpdatedAt = (assets ?? [])
      .map((a: any) => a.prices?.updated_at)
      .filter(Boolean)
      .sort()
      .reverse()
    if (allUpdatedAt.length > 0) {
      const d = new Date(allUpdatedAt[0])
      setLastUpdated(`${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
    } else if (prices?.[0]?.updated_at) {
      const d = new Date(prices[0].updated_at)
      setLastUpdated(`${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
    }
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
  const netWorth = totalValue - totalDebt

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={handleRefresh} refreshing={refreshing} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
        Chargement…
      </div>
    </div>
  )

  const s = summary

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={handleRefresh} refreshing={refreshing} mobile={mobile} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
          <KpiCard label="Patrimoine total" value={s ? formatEur(s.total_value, 0) : '–'} sub={s ? `Capital investi : ${formatEur(s.total_invested, 0)}` : undefined} hidden={privacy} subHidden={privacy} />
          <KpiCard label="Patrimoine net" value={s ? formatEur(netWorth, 0) : '–'} sub={totalDebt > 0 ? `Dettes : −${formatEur(totalDebt, 0)}` : 'Aucune dette enregistrée'} valueColor={netWorth >= 0 ? 'gain' : 'loss'} hidden={privacy} subHidden={privacy} />
          <KpiCard label="Plus-value latente" value={s ? formatEur(s.total_pnl, 0) : '–'} sub={s ? `${s.total_pnl_pct >= 0 ? '+' : ''}${s.total_pnl_pct.toFixed(2)} %` : undefined} subColor={s && s.total_pnl_pct >= 0 ? 'gain' : 'loss'} valueColor={s && s.total_pnl >= 0 ? 'gain' : 'loss'} hidden={privacy} subHidden={privacy} />
          <KpiCard label="Variation du jour" value={s ? formatEur(s.day_change, 0) : '–'} sub={s ? formatPct(s.day_change_pct) : undefined} subColor={s && s.day_change >= 0 ? 'gain' : 'loss'} hidden={privacy} />
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, marginTop: -8 }}>
          {lastUpdated ? `Cours mis à jour le ${lastUpdated}` : 'Cours non encore récupérés — cliquez sur Actualiser'}
        </p>

        {/* Graphiques */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={sectionLabel}>Évolution</p>
            <PortfolioEvolutionChart hidden={privacy} />
          </div>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={sectionLabel}>Répartition par catégorie</p>
            <DonutChart data={s?.by_category ?? {}} hidden={privacy} />
          </div>
        </div>

        {/* Répartition par banque */}
        {byBank.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <p style={sectionLabel}>Par banque</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {byBank.map(b => (
                  <div key={b.name}
                    onClick={() => b.id && router.push(`/banks/${b.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: b.id ? 'pointer' : 'default', borderRadius: 7, padding: '4px 0' }}
                    onMouseEnter={e => b.id && (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <span style={{ fontSize: 13, flex: 1, color: 'var(--text)', fontWeight: 500 }}>{b.name}</span>
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
                {byAccount.map(a => {
                  const invested = a.value - a.pnl
                  const pnlPct = invested > 0 ? (a.pnl / invested) * 100 : 0
                  const pnlColor = a.pnl >= 0 ? 'var(--green)' : 'var(--red)'
                  const sign = a.pnl >= 0 ? '+' : ''
                  return (
                    <div key={a.id}
                      onClick={() => router.push(`/accounts/${a.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 0', borderRadius: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.bank}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none', whiteSpace: 'nowrap' }}>{formatEur(a.value, 0)}</span>
                      <span style={{ fontSize: 11, color: pnlColor, filter: privacy ? 'blur(5px)' : 'none', whiteSpace: 'nowrap', minWidth: 110, textAlign: 'right' }}>
                        {sign}{formatEur(a.pnl, 0)} / {sign}{pnlPct.toFixed(1)} %
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Positions */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <p style={sectionLabel}>Positions ouvertes ({s?.positions.length ?? 0})</p>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{ fontSize: 11, color: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: 6, padding: '3px 6px', background: 'var(--bg)', cursor: 'pointer' }}
            >
              <option value="value">Valorisation</option>
              <option value="pnl">PV latente €</option>
              <option value="pnl_pct">PV latente %</option>
              <option value="day">Variation jour</option>
              <option value="name">Nom</option>
              <option value="category">Catégorie</option>
            </select>
          </div>

          {/* En-tête */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 80px 90px 40px' : '1fr 90px 110px 50px 70px 20px', gap: 8, padding: '4px 10px', fontSize: 11, color: 'var(--muted)' }}>
            <span>Actif</span>
            <span style={{ textAlign: 'right' }}>Valeur</span>
            <span style={{ textAlign: 'right' }}>+/- latent</span>
            <span style={{ textAlign: 'right' }}>Poids</span>
            {!mobile && <span style={{ textAlign: 'right' }}>Catégorie</span>}
            {!mobile && <span />}
          </div>

          {!s?.positions.length ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
              Aucune position — ajoutez votre première transaction
            </div>
          ) : (
            [...s.positions].sort((a, b) => {
              switch (sortBy) {
                case 'pnl': return b.pnl - a.pnl
                case 'pnl_pct': return b.pnl_pct - a.pnl_pct
                case 'day': return (b.day_change ?? 0) - (a.day_change ?? 0)
                case 'name': return a.asset.name.localeCompare(b.asset.name)
                case 'category': return a.asset.category.localeCompare(b.asset.category)
                default: return b.current_value - a.current_value
              }
            }).map(pos => (
              <PositionRow key={`${pos.asset.id}-${pos.account.id}`} pos={pos} hidden={privacy} mobile={mobile} totalValue={totalValue} onClick={() => router.push(`/assets/${pos.asset.id}`)} />
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

function PositionRow({ pos, hidden, mobile, totalValue, onClick }: { pos: Position; hidden: boolean; mobile: boolean; totalValue: number; onClick: () => void }) {
  const isGain = pos.pnl >= 0
  const weight = totalValue > 0 ? (pos.current_value / totalValue) * 100 : 0
  return (
    <div
      onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 80px 90px 40px' : '1fr 90px 110px 50px 70px 20px', gap: 8, padding: '9px 10px', borderRadius: 7, cursor: 'pointer', alignItems: 'center', fontSize: 13 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div>
        <p style={{ fontWeight: 500, fontSize: 13 }}>{pos.asset.name}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>{pos.account.name}</p>
      </div>
      <p style={{ textAlign: 'right', fontWeight: 500, filter: hidden ? 'blur(6px)' : 'none' }}>{formatEur(pos.current_value, 0)}</p>
      <div style={{ textAlign: 'right', filter: hidden ? 'blur(6px)' : 'none' }}>
        <p style={{ color: isGain ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{isGain ? '+' : ''}{formatEur(pos.pnl, 0)}</p>
        <p style={{ fontSize: 11, color: isGain ? 'var(--green)' : 'var(--red)' }}>{formatPct(pos.pnl_pct)}</p>
      </div>
      <p style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{weight.toFixed(1)}%</p>
      {!mobile && <div style={{ textAlign: 'right' }}>
        <span className={`badge ${getCategoryBadgeClass(pos.asset.category)}`}>{getCategoryLabel(pos.asset.category)}</span>
      </div>}
      {!mobile && <ChevronRight size={14} color="var(--muted)" />}
    </div>
  )
}
