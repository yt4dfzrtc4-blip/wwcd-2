'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPositions, buildPortfolioSummary, formatEur, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/portfolio'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2, Pencil, X, Check, AlertTriangle, TrendingUp, Landmark, BarChart2, PieChart as PieIcon } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Loan {
  id: string
  name: string
  type: 'immobilier' | 'auto' | 'conso' | 'autre'
  lender?: string
  remaining_amount: number
  monthly_payment: number
  interest_rate: number
  start_date?: string
  end_date?: string
}

interface LoanForm {
  name: string
  type: Loan['type']
  lender: string
  remaining_amount: string
  monthly_payment: string
  interest_rate: string
  start_date: string
  end_date: string
}

const LOAN_TYPE_LABELS: Record<Loan['type'], string> = {
  immobilier: '🏠 Immobilier',
  auto: '🚗 Auto',
  conso: '💳 Conso',
  autre: '📋 Autre',
}

const EMPTY_FORM: LoanForm = {
  name: '', type: 'immobilier', lender: '',
  remaining_amount: '', monthly_payment: '', interest_rate: '', start_date: '', end_date: '',
}

// ─── XIRR (MWRR) ───────────────────────────────────────────────────────────────

function xirr(cashflows: { date: Date; amount: number }[]): number | null {
  if (cashflows.length < 2) return null
  const dates = cashflows.map(c => c.date.getTime() / (1000 * 60 * 60 * 24))
  const d0 = dates[0]
  const amounts = cashflows.map(c => c.amount)

  function npv(rate: number): number {
    return amounts.reduce((s, a, i) => s + a / Math.pow(1 + rate, (dates[i] - d0) / 365), 0)
  }
  function dnpv(rate: number): number {
    return amounts.reduce((s, a, i) => {
      const t = (dates[i] - d0) / 365
      return s - t * a / Math.pow(1 + rate, t + 1)
    }, 0)
  }

  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const f = npv(rate)
    const df = dnpv(rate)
    if (Math.abs(df) < 1e-10) break
    const next = rate - f / df
    if (Math.abs(next - rate) < 1e-8) { rate = next; break }
    rate = next
    if (rate < -0.999) rate = -0.999
  }
  return isFinite(rate) ? rate : null
}

// ─── Composants utilitaires ────────────────────────────────────────────────────

function Tab({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, border: 'none',
      background: active ? 'var(--brand)' : 'transparent',
      color: active ? '#fff' : 'var(--muted)',
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer', fontFamily: 'var(--font-sans)',
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14,
      border: '0.5px solid var(--border)', padding: '20px 24px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function AnalysePage() {
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [tab, setTab] = useState<'allocation' | 'concentration' | 'performance' | 'passif'>('allocation')

  // Données portfolio
  const [positions, setPositions] = useState<any[]>([])
  const [allTx, setAllTx] = useState<any[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [byCategory, setByCategory] = useState<Record<string, number>>({})
  const [snapshots, setSnapshots] = useState<any[]>([])

  // Allocation cible (localStorage)
  const [targetAlloc, setTargetAlloc] = useState<Record<string, number>>({})

  // Prêts
  const [loans, setLoans] = useState<Loan[]>([])
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [loanForm, setLoanForm] = useState<LoanForm>(EMPTY_FORM)
  const [savingLoan, setSavingLoan] = useState(false)
  const [loansError, setLoansError] = useState<string | null>(null)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Charger allocation cible depuis localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wwcd_target_alloc')
      if (stored) setTargetAlloc(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: assets }, { data: accounts }, { data: snaps }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*'),
      supabase.from('snapshots').select('*').order('date', { ascending: true }),
    ])

    const txList: any[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('transactions')
        .select('*, asset:assets(*, prices(*)), account:accounts(*)')
        .range(from, from + 999)
      if (!page || page.length === 0) break
      txList.push(...page)
      if (page.length < 1000) break
      from += 1000
    }
    setAllTx(txList)

    const pos = buildPositions(txList, assets ?? [], accounts ?? [])
    const summary = buildPortfolioSummary(pos)
    setPositions(pos)
    setTotalValue(summary.total_value)
    setByCategory(summary.by_category as Record<string, number>)
    setSnapshots(snaps ?? [])

    // Charger les prêts
    await loadLoans()
    setLoading(false)
  }

  async function loadLoans() {
    const { data, error } = await supabase.from('loans').select('*').order('created_at', { ascending: false })
    if (error) {
      setLoansError('Table "loans" introuvable — voir instructions ci-dessous.')
    } else {
      setLoans(data ?? [])
      setLoansError(null)
    }
  }

  // ── Allocation ───────────────────────────────────────────────────────────────

  const activeCats = Object.keys(byCategory).filter(c => (byCategory[c] ?? 0) > 0)

  function saveTargetAlloc(next: Record<string, number>) {
    setTargetAlloc(next)
    localStorage.setItem('wwcd_target_alloc', JSON.stringify(next))
  }

  const allocData = activeCats.map(c => ({
    name: CATEGORY_LABELS[c] ?? c,
    cat: c,
    actual: totalValue > 0 ? (byCategory[c] / totalValue) * 100 : 0,
    target: targetAlloc[c] ?? 0,
    value: byCategory[c],
    color: CATEGORY_COLORS[c] ?? '#B4B2A9',
  }))

  const targetSum = Object.values(targetAlloc).reduce((a, b) => a + b, 0)

  // ── Concentration ────────────────────────────────────────────────────────────

  const top10 = [...positions]
    .sort((a, b) => b.current_value - a.current_value)
    .slice(0, 10)

  const top1Pct = totalValue > 0 ? (top10[0]?.current_value ?? 0) / totalValue * 100 : 0
  const top3Pct = totalValue > 0 ? top10.slice(0, 3).reduce((s, p) => s + p.current_value, 0) / totalValue * 100 : 0
  const top5Pct = totalValue > 0 ? top10.slice(0, 5).reduce((s, p) => s + p.current_value, 0) / totalValue * 100 : 0

  // Herfindahl index (0 = diversifié, 1 = concentré)
  const hhi = positions.reduce((s, p) => {
    const w = totalValue > 0 ? p.current_value / totalValue : 0
    return s + w * w
  }, 0)
  const diversificationScore = Math.max(0, Math.min(100, Math.round((1 - hhi) * 100)))

  // ── Performance (XIRR) ───────────────────────────────────────────────────────

  const xirrResult = useMemo(() => {
    const achats = allTx.filter((t: any) => t.type === 'achat')
    const ventes = allTx.filter((t: any) => t.type === 'vente' || t.type === 'remboursement')
    if (achats.length === 0) return null

    const cfs: { date: Date; amount: number }[] = []

    for (const t of achats) {
      cfs.push({ date: new Date(t.date), amount: -(t.quantity * t.price) })
    }
    for (const t of ventes) {
      cfs.push({ date: new Date(t.date), amount: t.quantity * t.price })
    }
    // Valeur actuelle = entrée positive finale
    cfs.push({ date: new Date(), amount: totalValue })
    cfs.sort((a, b) => a.date.getTime() - b.date.getTime())

    return xirr(cfs)
  }, [allTx, totalValue])

  // Performance simple
  const totalInvested = positions.reduce((s, p) => s + p.invested_value, 0)
  const totalPnl = totalValue - totalInvested
  const simplePnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Performance par catégorie
  const perfByCategory = activeCats.map(c => {
    const catPos = positions.filter((p: any) => p.asset.category === c)
    const inv = catPos.reduce((s: number, p: any) => s + p.invested_value, 0)
    const val = catPos.reduce((s: number, p: any) => s + p.current_value, 0)
    const pnl = val - inv
    const pct = inv > 0 ? pnl / inv * 100 : 0
    return { cat: c, label: CATEGORY_LABELS[c] ?? c, pnl, pct, value: val, color: CATEGORY_COLORS[c] ?? '#B4B2A9' }
  }).sort((a, b) => b.pct - a.pct)

  // ── Prêts ────────────────────────────────────────────────────────────────────

  const totalDebt = loans.reduce((s, l) => s + l.remaining_amount, 0)
  const netWorth = totalValue - totalDebt
  const totalMonthly = loans.reduce((s, l) => s + l.monthly_payment, 0)

  function openNewLoan() {
    setEditingLoan(null)
    setLoanForm(EMPTY_FORM)
    setShowLoanForm(true)
  }

  function openEditLoan(loan: Loan) {
    setEditingLoan(loan)
    setLoanForm({
      name: loan.name,
      type: loan.type,
      lender: loan.lender ?? '',
      remaining_amount: String(loan.remaining_amount),
      monthly_payment: String(loan.monthly_payment),
      interest_rate: String(loan.interest_rate),
      start_date: loan.start_date ?? '',
      end_date: loan.end_date ?? '',
    })
    setShowLoanForm(true)
  }

  async function saveLoan() {
    setSavingLoan(true)
    const payload = {
      name: loanForm.name,
      type: loanForm.type,
      lender: loanForm.lender || null,
      remaining_amount: parseFloat(loanForm.remaining_amount) || 0,
      monthly_payment: parseFloat(loanForm.monthly_payment) || 0,
      interest_rate: parseFloat(loanForm.interest_rate) || 0,
      start_date: loanForm.start_date || null,
      end_date: loanForm.end_date || null,
    }
    if (editingLoan) {
      await supabase.from('loans').update(payload).eq('id', editingLoan.id)
    } else {
      await supabase.from('loans').insert(payload)
    }
    await loadLoans()
    setShowLoanForm(false)
    setSavingLoan(false)
  }

  async function deleteLoan(id: string) {
    if (!confirm('Supprimer ce prêt ?')) return
    await supabase.from('loans').delete().eq('id', id)
    await loadLoans()
  }

  // Mois restants sur un prêt
  function monthsLeft(loan: Loan): number | null {
    if (!loan.end_date) return null
    const now = new Date()
    const end = new Date(loan.end_date)
    const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    return Math.max(0, diff)
  }

  // Durée totale du prêt (start → end) en mois
  function totalMonths(loan: Loan): number | null {
    if (!loan.start_date || !loan.end_date) return null
    const start = new Date(loan.start_date)
    const end = new Date(loan.end_date)
    const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    return Math.max(1, diff)
  }

  // % remboursé (basé sur les dates)
  function repaidPct(loan: Loan): number {
    if (!loan.start_date || !loan.end_date) return 0
    const start = new Date(loan.start_date).getTime()
    const end = new Date(loan.end_date).getTime()
    const now = Date.now()
    const pct = (now - start) / (end - start)
    return Math.min(100, Math.max(0, pct * 100))
  }

  // Intérêts restants calculés via formule amortissement (si taux > 0)
  function interestsLeft(loan: Loan): number | null {
    const months = monthsLeft(loan)
    if (months === null || months === 0) return 0
    if (loan.interest_rate <= 0) return 0
    const r = loan.interest_rate / 100 / 12
    // Intérêts restants = total paiements restants - capital restant
    const totalPayments = loan.monthly_payment * months
    return Math.max(0, totalPayments - loan.remaining_amount)
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} mobile={mobile} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: mobile ? '20px 12px 40px' : '32px 24px 60px' }}>

        {/* En-tête */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: mobile ? 20 : 24, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Analyse</h1>
          {!loading && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Actifs : <strong style={{ color: 'var(--text)', filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(totalValue, 0)}</strong>
              </p>
              {totalDebt > 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Dettes : <strong style={{ color: 'var(--red)', filter: privacy ? 'blur(6px)' : 'none' }}>−{formatEur(totalDebt, 0)}</strong>
                </p>
              )}
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Patrimoine net : <strong style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(netWorth, 0)}</strong>
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--brand)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{
              display: 'flex', gap: 4, background: 'var(--surface)',
              borderRadius: 10, padding: 4, marginBottom: 20,
              border: '0.5px solid var(--border)', overflowX: 'auto',
            }}>
              <Tab label="Allocation" active={tab === 'allocation'} onClick={() => setTab('allocation')} icon={<PieIcon size={14} />} />
              <Tab label="Concentration" active={tab === 'concentration'} onClick={() => setTab('concentration')} icon={<BarChart2 size={14} />} />
              <Tab label="Performance" active={tab === 'performance'} onClick={() => setTab('performance')} icon={<TrendingUp size={14} />} />
              <Tab label={`Passif${loans.length ? ` (${loans.length})` : ''}`} active={tab === 'passif'} onClick={() => setTab('passif')} icon={<Landmark size={14} />} />
            </div>

            {/* ── TAB : ALLOCATION ──────────────────────────────────────────── */}
            {tab === 'allocation' && (
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14 }}>

                {/* Donut actuel */}
                <SectionCard>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Répartition actuelle</p>
                  <div style={{ height: 180, filter: privacy ? 'blur(8px)' : 'none' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocData} dataKey="actual" nameKey="name" cx="50%" cy="50%"
                          innerRadius={50} outerRadius={80} paddingAngle={2}>
                          {allocData.map(d => <Cell key={d.cat} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)} %`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
                    {allocData.map(d => (
                      <div key={d.cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{d.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', filter: privacy ? 'blur(5px)' : 'none' }}>
                          {d.actual.toFixed(1)} %
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Cible + écarts */}
                <SectionCard>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Allocation cible</p>
                    <span style={{ fontSize: 11, color: targetSum === 100 ? 'var(--green)' : targetSum > 0 ? 'var(--red)' : 'var(--muted)' }}>
                      {targetSum > 0 ? `Total : ${targetSum.toFixed(0)}%` : 'Définissez vos cibles'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {allocData.map(d => {
                      const target = targetAlloc[d.cat] ?? 0
                      const gap = d.actual - target
                      const absGap = Math.abs(gap)
                      const gapColor = absGap < 2 ? 'var(--green)' : absGap < 5 ? 'var(--muted)' : 'var(--red)'
                      const rebalAmount = target > 0 ? ((target - d.actual) / 100) * totalValue : 0

                      return (
                        <div key={d.cat}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{d.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'right' }}>
                              {d.actual.toFixed(1)} %
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
                            <input
                              type="number" value={target || ''} min={0} max={100} step={1}
                              placeholder="0"
                              onChange={e => saveTargetAlloc({ ...targetAlloc, [d.cat]: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: 44, padding: '2px 4px', borderRadius: 5,
                                border: '0.5px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontSize: 12, textAlign: 'right',
                                fontFamily: 'var(--font-sans)',
                              }}
                            />
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
                          </div>
                          {target > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 16 }}>
                              {/* Barre de progression */}
                              <div style={{ flex: 1, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: d.color, borderRadius: 2, width: `${Math.min(100, (d.actual / Math.max(target, d.actual)) * 100)}%`, opacity: 0.7 }} />
                                {d.actual < target && (
                                  <div style={{ position: 'absolute', left: `${(d.actual / Math.max(target, d.actual)) * 100}%`, top: 0, height: '100%', background: d.color, opacity: 0.25, borderRadius: 2, right: 0 }} />
                                )}
                              </div>
                              <span style={{ fontSize: 10, color: gapColor, whiteSpace: 'nowrap', minWidth: 40, textAlign: 'right' }}>
                                {gap > 0 ? '+' : ''}{gap.toFixed(1)} %
                              </span>
                              {!privacy && absGap > 1 && (
                                <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                  {rebalAmount > 0 ? `+${formatEur(rebalAmount, 0)}` : formatEur(rebalAmount, 0)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {targetSum > 0 && targetSum !== 100 && (
                    <div style={{ marginTop: 14, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <AlertTriangle size={13} style={{ color: 'var(--red)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Le total des cibles est de {targetSum.toFixed(0)}%, pas 100%.
                      </span>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {/* ── TAB : CONCENTRATION ───────────────────────────────────────── */}
            {tab === 'concentration' && (
              <div style={{ display: 'grid', gap: 14 }}>

                {/* Score de diversification */}
                <SectionCard style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
                  {[
                    { label: 'Score de diversification', value: `${diversificationScore} / 100`, sub: diversificationScore > 75 ? 'Bien diversifié' : diversificationScore > 50 ? 'Diversification modérée' : 'Concentration élevée', color: diversificationScore > 75 ? 'var(--green)' : diversificationScore > 50 ? 'var(--muted)' : 'var(--red)' },
                    { label: 'Top 3 positions', value: `${top3Pct.toFixed(0)} %`, sub: 'du portefeuille', color: top3Pct > 60 ? 'var(--red)' : top3Pct > 40 ? 'var(--muted)' : 'var(--green)' },
                    { label: 'Top 5 positions', value: `${top5Pct.toFixed(0)} %`, sub: 'du portefeuille', color: top5Pct > 75 ? 'var(--red)' : top5Pct > 55 ? 'var(--muted)' : 'var(--green)' },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} style={{ textAlign: mobile ? 'left' : 'center' }}>
                      <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
                      <p style={{ fontSize: 26, fontWeight: 700, color }}>{value}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</p>
                    </div>
                  ))}
                </SectionCard>

                {/* Top 10 positions */}
                <SectionCard>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Top 10 positions</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {top10.map((pos, i) => {
                      const pct = totalValue > 0 ? pos.current_value / totalValue * 100 : 0
                      const riskColor = pct > 15 ? 'var(--red)' : pct > 8 ? 'var(--muted)' : 'var(--green)'
                      return (
                        <div key={pos.asset.id + pos.account.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 16, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                {pos.asset.name}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: riskColor }}>{pct.toFixed(1)} %</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: CATEGORY_COLORS[pos.asset.category] ?? 'var(--brand)', borderRadius: 2 }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textAlign: 'right', filter: privacy ? 'blur(5px)' : 'none' }}>
                            {formatEur(pos.current_value, 0)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </SectionCard>

                {/* Répartition par catégorie */}
                <SectionCard>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Exposition par catégorie</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {allocData.sort((a, b) => b.actual - a.actual).map(d => (
                      <div key={d.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{d.name}</span>
                        <div style={{ width: mobile ? 80 : 140, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${d.actual}%`, height: '100%', background: d.color, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{d.actual.toFixed(1)} %</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textAlign: 'right', filter: privacy ? 'blur(5px)' : 'none' }}>
                          {formatEur(d.value, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── TAB : PERFORMANCE ─────────────────────────────────────────── */}
            {tab === 'performance' && (
              <div style={{ display: 'grid', gap: 14 }}>

                {/* KPIs performance */}
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
                  <SectionCard style={{ padding: '16px 18px' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Performance simple</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: simplePnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {simplePnlPct >= 0 ? '+' : ''}{simplePnlPct.toFixed(2)} %
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, filter: privacy ? 'blur(5px)' : 'none' }}>
                      {totalPnl >= 0 ? '+' : ''}{formatEur(totalPnl, 0)}
                    </p>
                  </SectionCard>

                  <SectionCard style={{ padding: '16px 18px' }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Taux de retour (MWRR)
                      <span style={{ display: 'block', fontSize: 9, marginTop: 1, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>pondéré par les flux</span>
                    </p>
                    {xirrResult !== null ? (
                      <>
                        <p style={{ fontSize: 26, fontWeight: 700, color: xirrResult >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {xirrResult >= 0 ? '+' : ''}{(xirrResult * 100).toFixed(2)} %
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>par an</p>
                      </>
                    ) : (
                      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8 }}>Données insuffisantes</p>
                    )}
                  </SectionCard>

                  <SectionCard style={{ padding: '16px 18px', gridColumn: mobile ? 'span 2' : undefined }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Capital investi</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', filter: privacy ? 'blur(8px)' : 'none' }}>
                      {formatEur(totalInvested, 0)}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, filter: privacy ? 'blur(5px)' : 'none' }}>
                      Valeur actuelle : {formatEur(totalValue, 0)}
                    </p>
                  </SectionCard>
                </div>

                {/* Performance par catégorie */}
                <SectionCard>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Performance par catégorie</p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {perfByCategory.map(p => (
                      <div key={p.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{p.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', filter: privacy ? 'blur(5px)' : 'none', minWidth: 80, textAlign: 'right' }}>
                          {p.pnl >= 0 ? '+' : ''}{formatEur(p.pnl, 0)}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: 'right',
                          color: p.pct >= 0 ? 'var(--green)' : 'var(--red)',
                        }}>
                          {p.pct >= 0 ? '+' : ''}{p.pct.toFixed(2)} %
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Top performers individuels */}
                <SectionCard>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Meilleures &amp; pires positions</p>
                  <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    {['Top 10', 'Flop 10'].map((title, idx) => {
                      const sorted = [...positions].sort((a, b) => idx === 0 ? b.pnl_pct - a.pnl_pct : a.pnl_pct - b.pnl_pct)
                      return (
                        <div key={title}>
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {sorted.slice(0, 10).map(p => (
                              <div key={p.asset.id + p.account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {p.asset.name}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: p.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                                  {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(1)} %
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── TAB : PASSIF ──────────────────────────────────────────────── */}
            {tab === 'passif' && (
              <div style={{ display: 'grid', gap: 14 }}>

                {loansError ? (
                  <SectionCard>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                      <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Table &quot;loans&quot; manquante</p>
                        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                          Créez la table dans Supabase (SQL Editor) avec le code ci-dessous, puis rechargez la page.
                        </p>
                        <pre style={{
                          background: 'var(--bg)', borderRadius: 8, padding: '12px 14px',
                          fontSize: 11, color: 'var(--text)', overflowX: 'auto',
                          border: '0.5px solid var(--border)', lineHeight: 1.6,
                        }}>{`create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  type text not null default 'autre',
  lender text,
  remaining_amount numeric not null default 0,
  monthly_payment numeric not null default 0,
  interest_rate numeric not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz default now()
);
alter table loans enable row level security;
create policy "loans_own" on loans
  for all using (auth.uid() = user_id);`}</pre>
                      </div>
                    </div>
                  </SectionCard>
                ) : (
                  <>
                    {/* KPIs passif */}
                    {loans.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Dettes totales', value: formatEur(totalDebt, 0), color: 'var(--red)' },
                          { label: 'Mensualités totales', value: `${formatEur(totalMonthly, 0)}/mois`, color: 'var(--text)' },
                          { label: 'Patrimoine net', value: formatEur(netWorth, 0), color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' },
                        ].map(({ label, value, color }) => (
                          <SectionCard key={label} style={{ padding: '14px 16px' }}>
                            <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
                            <p style={{ fontSize: 20, fontWeight: 700, color, filter: privacy ? 'blur(8px)' : 'none' }}>{value}</p>
                          </SectionCard>
                        ))}
                      </div>
                    )}

                    {/* Bouton ajouter */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={openNewLoan} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 8,
                        border: '0.5px solid var(--brand)', background: 'var(--brand)',
                        color: '#fff', fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}>
                        <Plus size={14} /> Ajouter un prêt
                      </button>
                    </div>

                    {/* Formulaire */}
                    {showLoanForm && (
                      <SectionCard style={{ border: '1px solid var(--brand)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {editingLoan ? 'Modifier le prêt' : 'Nouveau prêt'}
                          </p>
                          <button onClick={() => setShowLoanForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                            <X size={16} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                          {[
                            { key: 'name', label: 'Nom du prêt', placeholder: 'Ex: Prêt immobilier résidence' },
                            { key: 'lender', label: 'Établissement', placeholder: 'Ex: BNP Paribas' },
                          ].map(({ key, label, placeholder }) => (
                            <div key={key}>
                              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                              <input value={(loanForm as any)[key]} onChange={e => setLoanForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder={placeholder}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
                            </div>
                          ))}
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Type</label>
                            <select value={loanForm.type} onChange={e => setLoanForm(f => ({ ...f, type: e.target.value as Loan['type'] }))}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}>
                              {Object.entries(LOAN_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date de début</label>
                            <input type="date" value={loanForm.start_date} onChange={e => setLoanForm(f => ({ ...f, start_date: e.target.value }))}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date de fin</label>
                            <input type="date" value={loanForm.end_date} onChange={e => setLoanForm(f => ({ ...f, end_date: e.target.value }))}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
                          </div>
                          {[
                            { key: 'remaining_amount', label: 'Capital restant dû (€)', placeholder: '150000' },
                            { key: 'monthly_payment', label: 'Mensualité (€)', placeholder: '800' },
                            { key: 'interest_rate', label: 'Taux annuel (%)', placeholder: '3.5' },
                          ].map(({ key, label, placeholder }) => (
                            <div key={key}>
                              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                              <input type="number" value={(loanForm as any)[key]} onChange={e => setLoanForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder={placeholder}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                          <button onClick={() => setShowLoanForm(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                            Annuler
                          </button>
                          <button onClick={saveLoan} disabled={!loanForm.name || savingLoan} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7,
                            border: 'none', background: 'var(--brand)', color: '#fff',
                            fontSize: 13, fontWeight: 500, cursor: loanForm.name ? 'pointer' : 'not-allowed',
                            opacity: loanForm.name ? 1 : 0.5, fontFamily: 'var(--font-sans)',
                          }}>
                            <Check size={13} /> {savingLoan ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </SectionCard>
                    )}

                    {/* Liste des prêts */}
                    {loans.length === 0 && !showLoanForm ? (
                      <SectionCard>
                        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
                          <Landmark size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
                          <p style={{ fontSize: 14, marginBottom: 4 }}>Aucun prêt enregistré</p>
                          <p style={{ fontSize: 12 }}>Ajoutez vos crédits pour voir votre patrimoine net.</p>
                        </div>
                      </SectionCard>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {loans.map(loan => {
                          const months = monthsLeft(loan)
                          const pct = repaidPct(loan)
                          const interests = interestsLeft(loan)
                          const startFmt = loan.start_date ? new Date(loan.start_date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : null
                          const endFmt = loan.end_date ? new Date(loan.end_date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : null
                          return (
                            <SectionCard key={loan.id} style={{ padding: '16px 20px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{loan.name}</span>
                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg)', color: 'var(--muted)', border: '0.5px solid var(--border)' }}>
                                      {LOAN_TYPE_LABELS[loan.type]}
                                    </span>
                                  </div>
                                  {loan.lender && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{loan.lender}</p>}
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => openEditLoan(loan)} style={{ padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => deleteLoan(loan.id)} style={{ padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                                {[
                                  { label: 'Capital restant', value: formatEur(loan.remaining_amount, 0), color: 'var(--red)', blur: true },
                                  { label: 'Mensualité', value: `${formatEur(loan.monthly_payment, 0)}/mois`, color: 'var(--text)', blur: false },
                                  { label: 'Taux annuel', value: `${loan.interest_rate} %`, color: 'var(--text)', blur: false },
                                  { label: 'Durée', value: startFmt && endFmt ? `${startFmt} → ${endFmt}` : endFmt ? `→ ${endFmt}` : '–', color: 'var(--muted)', blur: false },
                                ].map(({ label, value, color, blur }) => (
                                  <div key={label}>
                                    <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{label}</p>
                                    <p style={{ fontSize: 13, fontWeight: 600, color, filter: blur && privacy ? 'blur(5px)' : 'none' }}>{value}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Barre de progression remboursement */}
                              <div style={{ marginTop: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                                  <span>{pct > 0 ? `${pct.toFixed(0)}% remboursé` : months !== null ? `${months} mois restants` : ''}</span>
                                  {interests !== null && interests > 0 && !privacy && (
                                    <span>{formatEur(interests, 0)} d&apos;intérêts restants</span>
                                  )}
                                </div>
                                <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', background: 'var(--green)', borderRadius: 3, width: `${pct}%`, opacity: 0.7, transition: 'width 0.3s' }} />
                                </div>
                                {startFmt && endFmt && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
                                    <span>{startFmt}</span><span>{endFmt}</span>
                                  </div>
                                )}
                              </div>
                            </SectionCard>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
