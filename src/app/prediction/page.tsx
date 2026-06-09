'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPositions, buildPortfolioSummary, formatEur, CATEGORY_LABELS } from '@/lib/portfolio'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import { Settings2, ChevronDown, ChevronUp, Target, TrendingUp, Zap, Coffee } from 'lucide-react'

// ─── Constantes ────────────────────────────────────────────────────────────────

type Category = string

interface CategoryRate { base: number; pessimistic: number; optimistic: number }

const DEFAULT_RATES: Record<string, CategoryRate> = {
  action:     { base: 7,   pessimistic: 3,   optimistic: 12 },
  etf:        { base: 7,   pessimistic: 3,   optimistic: 11 },
  crypto:     { base: 10,  pessimistic: -20, optimistic: 40 },
  obligation: { base: 3,   pessimistic: 1,   optimistic: 5  },
  livret:     { base: 2.5, pessimistic: 1,   optimistic: 3  },
  cat:        { base: 3.5, pessimistic: 2,   optimistic: 4  },
  per:        { base: 6,   pessimistic: 2,   optimistic: 10 },
  or:         { base: 5,   pessimistic: 0,   optimistic: 10 },
  autre:      { base: 3,   pessimistic: 0,   optimistic: 6  },
  immobilier: { base: 4,   pessimistic: 1,   optimistic: 7  },
}

const MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000]
const MILESTONE_LABELS: Record<number, string> = {
  100_000:   '100k',
  250_000:   '250k',
  500_000:   '500k',
  1_000_000: '1M',
  2_000_000: '2M',
  5_000_000: '5M',
}

const SCENARIO_COLORS = {
  base:        '#534AB7',
  pessimistic: '#D85A30',
  optimistic:  '#1D9E75',
}

// Règle des 4% (taux de retrait annuel durable)
const SAFE_WITHDRAWAL_RATE = 0.04

// ─── Moteur de projection ──────────────────────────────────────────────────────

interface YearPoint {
  year: number
  calYear: number
  base: number
  pessimistic: number
  optimistic: number
  contributed: number  // apports cumulés
  gainsBase: number    // gains nets scénario de base
}

function project(
  valueByCategory: Record<string, number>,
  totalRevenues: number,
  rates: Record<string, CategoryRate>,
  monthlyContrib: number,
  horizonYears: number,
): YearPoint[] {
  const cats = Object.keys(valueByCategory)
  const totalValue = cats.reduce((s, c) => s + (valueByCategory[c] ?? 0), 0)
  const annualContrib = monthlyContrib * 12

  // Répartition apport proportionnelle
  const contribByCategory: Record<string, number> = {}
  for (const c of cats) {
    const share = totalValue > 0 ? (valueByCategory[c] ?? 0) / totalValue : 1 / cats.length
    contribByCategory[c] = annualContrib * share
  }

  const currentYear = new Date().getFullYear()
  const points: YearPoint[] = []

  let base_v = { ...valueByCategory }
  let pess_v = { ...valueByCategory }
  let opti_v = { ...valueByCategory }
  let totalContributed = totalValue

  points.push({
    year: 0, calYear: currentYear,
    base: totalValue, pessimistic: totalValue, optimistic: totalValue,
    contributed: totalValue, gainsBase: 0,
  })

  for (let y = 1; y <= horizonYears; y++) {
    for (const c of cats) {
      const r = rates[c] ?? DEFAULT_RATES['autre']
      const contrib = contribByCategory[c] ?? 0
      const revShare = totalValue > 0 ? (valueByCategory[c] ?? 0) / totalValue : 0
      const rev = totalRevenues * revShare

      base_v[c] = (base_v[c] + contrib + rev) * (1 + r.base / 100)
      pess_v[c] = (pess_v[c] + contrib) * (1 + r.pessimistic / 100)
      opti_v[c] = (opti_v[c] + contrib + rev) * (1 + r.optimistic / 100)
    }

    totalContributed += annualContrib

    const sumBase = cats.reduce((s, c) => s + base_v[c], 0)
    const sumPess = cats.reduce((s, c) => s + pess_v[c], 0)
    const sumOpti = cats.reduce((s, c) => s + opti_v[c], 0)

    points.push({
      year: y, calYear: currentYear + y,
      base: sumBase, pessimistic: sumPess, optimistic: sumOpti,
      contributed: totalContributed,
      gainsBase: Math.max(0, sumBase - totalContributed),
    })
  }

  return points
}

// Trouver l'année où un scénario dépasse l'objectif
function findGoalYear(points: YearPoint[], scenario: keyof YearPoint, goal: number): number | null {
  for (const p of points) {
    if ((p[scenario] as number) >= goal) return p.calYear
  }
  return null
}

// Trouver l'année cible d'un scénario pour les revenus passifs
function yearsToPassiveIncome(points: YearPoint[], monthlyTarget: number): { base: number | null; pessimistic: number | null; optimistic: number | null } {
  const annualTarget = monthlyTarget * 12
  const goal = annualTarget / SAFE_WITHDRAWAL_RATE
  return {
    base: findGoalYear(points, 'base', goal),
    pessimistic: findGoalYear(points, 'pessimistic', goal),
    optimistic: findGoalYear(points, 'optimistic', goal),
  }
}

// ─── Sous-composants ───────────────────────────────────────────────────────────

function ImpactBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: 'var(--surface)', borderRadius: 10, padding: '12px 14px',
      border: '0.5px solid var(--border)', flex: 1, minWidth: 0,
    }}>
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PredictionPage() {
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  // Données
  const [valueByCategory, setValueByCategory] = useState<Record<string, number>>({})
  const [totalRevenues, setTotalRevenues] = useState(0)
  const [autoLivretRates, setAutoLivretRates] = useState<Record<string, number>>({})

  // Paramètres
  const [rates, setRates] = useState<Record<string, CategoryRate>>({ ...DEFAULT_RATES })
  const [horizonYears, setHorizonYears] = useState(25)
  const [monthlyContrib, setMonthlyContrib] = useState(500)

  // Objectif
  type GoalMode = 'amount' | 'income'
  const [goalMode, setGoalMode] = useState<GoalMode>('amount')
  const [goalAmount, setGoalAmount] = useState(1_000_000)
  const [goalMonthlyIncome, setGoalMonthlyIncome] = useState(3_000)

  // Simul "et si +X€/mois"
  const [extraContrib, setExtraContrib] = useState(200)

  // UI
  const [showRates, setShowRates] = useState(false)
  const [showContrib, setShowContrib] = useState(true)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*'),
    ])

    const allTx: any[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('transactions')
        .select('*, asset:assets(*, prices(*)), account:accounts(*)')
        .range(from, from + 999)
      if (!page || page.length === 0) break
      allTx.push(...page)
      if (page.length < 1000) break
      from += 1000
    }

    const positions = buildPositions(allTx, assets ?? [], accounts ?? [])
    const bycat: Record<string, number> = {}
    for (const pos of positions) {
      const c = pos.asset.category
      bycat[c] = (bycat[c] ?? 0) + pos.current_value
    }
    setValueByCategory(bycat)

    // Taux réels livrets/CAT
    const autoRates: Record<string, number> = {}
    for (const a of (assets ?? []) as any[]) {
      if (a.category === 'livret' && a.livret_rate) autoRates['livret'] = a.livret_rate
      if (a.category === 'cat' && a.livret_rate) autoRates['cat'] = a.livret_rate
    }
    setAutoLivretRates(autoRates)
    setRates(prev => {
      const next = { ...prev }
      if (autoRates['livret']) next['livret'] = { ...next['livret'], base: autoRates['livret'] }
      if (autoRates['cat']) next['cat'] = { ...next['cat'], base: autoRates['cat'] }
      return next
    })

    // Revenus annuels estimés
    const year = new Date().getFullYear()
    const revTx = allTx.filter((t: any) =>
      ['dividende', 'interets', 'coupon'].includes(t.type) &&
      new Date(t.date).getFullYear() === year
    )
    setTotalRevenues(revTx.reduce((s: number, t: any) => s + t.quantity * t.price, 0))

    setLoading(false)
  }

  // ── Calculs ──────────────────────────────────────────────────────────────────

  const projection = useMemo(() =>
    project(valueByCategory, totalRevenues, rates, monthlyContrib, horizonYears),
    [valueByCategory, totalRevenues, rates, monthlyContrib, horizonYears]
  )

  const projectionExtra = useMemo(() =>
    project(valueByCategory, totalRevenues, rates, monthlyContrib + extraContrib, horizonYears),
    [valueByCategory, totalRevenues, rates, monthlyContrib, extraContrib, horizonYears]
  )

  // Objectif en €
  const goalEur = goalMode === 'amount'
    ? goalAmount
    : (goalMonthlyIncome * 12) / SAFE_WITHDRAWAL_RATE

  // Années pour atteindre l'objectif
  const goalYearBase = findGoalYear(projection, 'base', goalEur)
  const goalYearPess = findGoalYear(projection, 'pessimistic', goalEur)
  const goalYearOpti = findGoalYear(projection, 'optimistic', goalEur)
  const goalYearExtra = findGoalYear(projectionExtra, 'base', goalEur)

  const currentYear = new Date().getFullYear()
  const totalValue = Object.values(valueByCategory).reduce((a, b) => a + b, 0)
  const finalBase = projection[projection.length - 1]?.base ?? 0
  const finalPess = projection[projection.length - 1]?.pessimistic ?? 0
  const finalOpti = projection[projection.length - 1]?.optimistic ?? 0

  // Revenus passifs mensuels à horizon
  const passiveBase = finalBase * SAFE_WITHDRAWAL_RATE / 12
  const passPess   = finalPess * SAFE_WITHDRAWAL_RATE / 12
  const passOpti   = finalOpti * SAFE_WITHDRAWAL_RATE / 12

  // Milestones franchis dans la projection (scénario de base)
  const milestonePoints = MILESTONES.flatMap(m => {
    if (m <= totalValue) return []
    const pt = projection.find(p => p.base >= m)
    if (!pt) return []
    return [{ milestone: m, year: pt.calYear, value: pt.base }]
  })

  // Données graphe
  const chartData = projection.map(p => ({
    name: p.calYear,
    contributed: Math.round(p.contributed),
    gainsBase: Math.round(p.gainsBase),
    base: Math.round(p.base),
    pessimistic: Math.round(p.pessimistic),
    optimistic: Math.round(p.optimistic),
  }))

  const activeCats = Object.keys(valueByCategory).filter(c => (valueByCategory[c] ?? 0) > 0)

  // ── Tooltip graphe ──────────────────────────────────────────────────────────

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const base = payload.find((p: any) => p.dataKey === 'base')?.value ?? 0
    const pess = payload.find((p: any) => p.dataKey === 'pessimistic')?.value ?? 0
    const opti = payload.find((p: any) => p.dataKey === 'optimistic')?.value ?? 0
    const contrib = payload.find((p: any) => p.dataKey === 'contributed')?.value ?? 0
    const gains = payload.find((p: any) => p.dataKey === 'gainsBase')?.value ?? 0
    return (
      <div style={{
        background: 'var(--surface)', border: '0.5px solid var(--border)',
        borderRadius: 10, padding: '12px 14px', fontSize: 12, minWidth: 180,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        <p style={{ color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>{label}</p>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: SCENARIO_COLORS.optimistic }}>Optimiste</span>
            <span style={{ fontWeight: 500 }}>{privacy ? '•••••' : formatEur(opti, 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: SCENARIO_COLORS.base }}>Base</span>
            <span style={{ fontWeight: 600 }}>{privacy ? '•••••' : formatEur(base, 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: SCENARIO_COLORS.pessimistic }}>Pessimiste</span>
            <span style={{ fontWeight: 500 }}>{privacy ? '•••••' : formatEur(pess, 0)}</span>
          </div>
          {contrib > 0 && (
            <div style={{ borderTop: '0.5px solid var(--border)', marginTop: 4, paddingTop: 4, display: 'grid', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: 'var(--muted)' }}>Apports</span>
                <span>{privacy ? '•••••' : formatEur(contrib, 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: 'var(--muted)' }}>Gains</span>
                <span style={{ color: 'var(--green)' }}>{privacy ? '•••••' : formatEur(gains, 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} mobile={mobile} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: mobile ? '20px 12px 40px' : '32px 24px 60px' }}>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid var(--brand)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Calcul des projections…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>

            {/* ── Titre ──────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: mobile ? 20 : 24, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Prédiction
              </h1>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Patrimoine actuel : <strong style={{ color: 'var(--text)', filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(totalValue, 0)}</strong>
              </p>
            </div>

            {/* ── Objectif ───────────────────────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: mobile ? '16px' : '20px 24px',
              border: '0.5px solid var(--brand)', marginBottom: 16,
            }}>
              {/* Toggle mode */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3, marginBottom: 16, width: 'fit-content' }}>
                {([['amount', '🎯 Montant cible'], ['income', '☕ Revenus passifs']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setGoalMode(m)} style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none',
                    background: goalMode === m ? 'var(--brand)' : 'transparent',
                    color: goalMode === m ? '#fff' : 'var(--muted)',
                    fontSize: 12, fontWeight: goalMode === m ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>

              {goalMode === 'amount' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>Je veux atteindre</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number" value={goalAmount} step={50000}
                      onChange={e => setGoalAmount(parseFloat(e.target.value) || 0)}
                      style={{
                        width: 110, padding: '6px 10px', borderRadius: 8,
                        border: '1.5px solid var(--brand)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 16, fontWeight: 700,
                        fontFamily: 'var(--font-sans)', textAlign: 'right',
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>€</span>
                  </div>
                  <span style={{ fontSize: 15, color: 'var(--muted)' }}>de patrimoine</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>Je veux</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number" value={goalMonthlyIncome} step={500}
                      onChange={e => setGoalMonthlyIncome(parseFloat(e.target.value) || 0)}
                      style={{
                        width: 90, padding: '6px 10px', borderRadius: 8,
                        border: '1.5px solid var(--brand)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 16, fontWeight: 700,
                        fontFamily: 'var(--font-sans)', textAlign: 'right',
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>€/mois</span>
                  </div>
                  <span style={{ fontSize: 15, color: 'var(--muted)' }}>de revenus passifs</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                    = {formatEur(goalEur, 0)} (règle des 4%)
                  </span>
                </div>
              )}

              {/* Résultat objectif */}
              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Pessimiste', year: goalYearPess, color: SCENARIO_COLORS.pessimistic },
                  { label: 'Base',       year: goalYearBase, color: SCENARIO_COLORS.base },
                  { label: 'Optimiste',  year: goalYearOpti, color: SCENARIO_COLORS.optimistic },
                ].map(({ label, year: y, color }) => (
                  <div key={label} style={{
                    background: 'var(--bg)', borderRadius: 8, padding: '8px 12px',
                    border: `0.5px solid ${color}30`, flex: 1, minWidth: 80, textAlign: 'center',
                  }}>
                    <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                    {y ? (
                      <>
                        <p style={{ fontSize: 16, fontWeight: 700, color }}>{y}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)' }}>dans {y - currentYear} ans</p>
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>hors horizon</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Horizon slider ─────────────────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)', borderRadius: 12, padding: '14px 20px',
              border: '0.5px solid var(--border)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: mobile ? 'wrap' : 'nowrap',
            }}>
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Horizon</span>
              <input
                type="range" min={5} max={50} value={horizonYears}
                onChange={e => setHorizonYears(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--brand)', cursor: 'pointer', minWidth: 120 }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap', minWidth: 60 }}>
                {currentYear + horizonYears} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>({horizonYears} ans)</span>
              </span>
            </div>

            {/* ── Graphe ─────────────────────────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: mobile ? '16px 12px' : '20px 24px',
              border: '0.5px solid var(--border)', marginBottom: 16,
            }}>
              <div style={{ height: mobile ? 260 : 340, filter: privacy ? 'blur(8px)' : 'none', transition: 'filter 0.2s' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradContrib" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#534AB7" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#534AB7" stopOpacity={0.08} />
                      </linearGradient>
                      <linearGradient id="gradGains" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#1D9E75" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>

                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false}
                      interval={Math.floor(horizonYears / 5)} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Aire apports */}
                    <Area type="monotone" dataKey="contributed" name="Apports"
                      stroke="none" fill="url(#gradContrib)" stackId="1" dot={false} activeDot={false} />
                    {/* Aire gains */}
                    <Area type="monotone" dataKey="gainsBase" name="Gains"
                      stroke="none" fill="url(#gradGains)" stackId="1" dot={false} activeDot={false} />

                    {/* Ligne objectif */}
                    {goalEur > 0 && goalEur < (finalOpti * 1.2) && (
                      <ReferenceLine y={goalEur} stroke="var(--brand)" strokeDasharray="6 3"
                        strokeWidth={1.5} strokeOpacity={0.6}
                        label={{ value: goalMode === 'income' ? `Objectif revenu` : `Objectif`, position: 'insideTopRight', fontSize: 10, fill: 'var(--brand)', fontWeight: 600 }}
                      />
                    )}

                    {/* Milestones */}
                    {milestonePoints.map(m => (
                      <ReferenceDot key={m.milestone} x={m.year} y={m.value}
                        r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2}
                        label={{ value: MILESTONE_LABELS[m.milestone], position: 'top', fontSize: 9, fill: 'var(--brand)', fontWeight: 700 }}
                      />
                    ))}

                    {/* 3 courbes */}
                    <Line type="monotone" dataKey="pessimistic" name="Pessimiste"
                      stroke={SCENARIO_COLORS.pessimistic} strokeWidth={1.5} dot={false}
                      strokeDasharray="5 3" activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="base" name="Base"
                      stroke={SCENARIO_COLORS.base} strokeWidth={2.5} dot={false}
                      activeDot={{ r: 4, fill: SCENARIO_COLORS.base, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="optimistic" name="Optimiste"
                      stroke={SCENARIO_COLORS.optimistic} strokeWidth={1.5} dot={false}
                      strokeDasharray="5 3" activeDot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Légende */}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  { color: SCENARIO_COLORS.pessimistic, label: 'Pessimiste', dash: true },
                  { color: SCENARIO_COLORS.base, label: 'Base', dash: false },
                  { color: SCENARIO_COLORS.optimistic, label: 'Optimiste', dash: true },
                  { color: '#1D9E75', label: 'Gains', area: true },
                  { color: '#534AB7', label: 'Apports', area: true },
                ].map(({ color, label, dash, area }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {area ? (
                      <span style={{ width: 12, height: 10, borderRadius: 2, background: color, opacity: 0.5, display: 'inline-block' }} />
                    ) : (
                      <svg width={20} height={10}>
                        <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={dash ? 1.5 : 2.5}
                          strokeDasharray={dash ? '4 2' : undefined} />
                      </svg>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Badges impact ──────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>

              <ImpactBadge
                icon={<Coffee size={16} />}
                label={`Revenus passifs en ${currentYear + horizonYears} (scén. base)`}
                value={privacy ? '•••••' : `${formatEur(passiveBase, 0)}/mois`}
                color="var(--brand)"
              />

              <ImpactBadge
                icon={<Zap size={15} />}
                label={`+${extraContrib}€/mois → objectif atteint`}
                value={
                  goalYearExtra && goalYearBase
                    ? goalYearExtra < goalYearBase
                      ? `${goalYearBase - goalYearExtra} ans plus tôt (${goalYearExtra})`
                      : goalYearExtra === goalYearBase
                        ? `Même date (${goalYearBase})`
                        : `${goalYearExtra - goalYearBase} ans plus tard`
                    : goalYearExtra
                      ? `Objectif en ${goalYearExtra}`
                      : `Hors horizon`
                }
                color="var(--green)"
              />

              {!mobile && (
                <>
                  <ImpactBadge
                    icon={<TrendingUp size={15} />}
                    label="Patrimoine en scénario optimiste"
                    value={privacy ? '•••••' : formatEur(finalOpti, 0)}
                    color={SCENARIO_COLORS.optimistic}
                  />
                  <ImpactBadge
                    icon={<Target size={15} />}
                    label="Revenus passifs optimistes"
                    value={privacy ? '•••••' : `${formatEur(passOpti, 0)}/mois`}
                    color={SCENARIO_COLORS.optimistic}
                  />
                </>
              )}
            </div>

            {/* ── Slider +X€/mois ────────────────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)', borderRadius: 12, padding: '14px 20px',
              border: '0.5px solid var(--border)', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  Et si j&apos;ajoutais <strong style={{ color: 'var(--green)' }}>+{extraContrib}€/mois</strong> ?
                </span>
                <input
                  type="number" value={extraContrib} step={50} min={0}
                  onChange={e => setExtraContrib(parseFloat(e.target.value) || 0)}
                  style={{
                    width: 70, padding: '4px 8px', borderRadius: 6,
                    border: '0.5px solid var(--green)', background: 'var(--bg)',
                    color: 'var(--green)', fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--font-sans)', textAlign: 'right',
                  }}
                />
              </div>
              <input
                type="range" min={0} max={2000} step={50} value={extraContrib}
                onChange={e => setExtraContrib(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--green)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                <span>0€</span><span>2 000€</span>
              </div>
            </div>

            {/* ── Paramètres apports ─────────────────────────────────────────── */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)', marginBottom: 10, overflow: 'hidden' }}>
              <button onClick={() => setShowContrib(p => !p)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text)', fontFamily: 'var(--font-sans)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Apport mensuel de base</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{monthlyContrib}€/mois</span>
                  {showContrib ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                </div>
              </button>
              {showContrib && (
                <div style={{ borderTop: '0.5px solid var(--border)', padding: '14px 20px' }}>
                  <input
                    type="range" min={0} max={5000} step={50} value={monthlyContrib}
                    onChange={e => setMonthlyContrib(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--brand)', cursor: 'pointer', marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>0€</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number" value={monthlyContrib} step={50} min={0}
                        onChange={e => setMonthlyContrib(parseFloat(e.target.value) || 0)}
                        style={{
                          width: 80, padding: '4px 8px', borderRadius: 6,
                          border: '0.5px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>€/mois</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>5 000€</span>
                  </div>
                  {totalRevenues > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 8 }}>
                      + {formatEur(totalRevenues, 0)}/an de revenus r&eacute;investis automatiquement
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Taux par catégorie ─────────────────────────────────────────── */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <button onClick={() => setShowRates(p => !p)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text)', fontFamily: 'var(--font-sans)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Settings2 size={14} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Taux de rendement</span>
                </div>
                {showRates ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
              </button>

              {showRates && (
                <div style={{ borderTop: '0.5px solid var(--border)', padding: '14px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <span />
                    {(['pessimistic', 'base', 'optimistic'] as const).map(s => (
                      <span key={s} style={{ fontSize: 10, color: SCENARIO_COLORS[s], textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {s === 'pessimistic' ? 'Pess.' : s === 'base' ? 'Base' : 'Opti.'}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {activeCats.map(cat => {
                      const r = rates[cat] ?? DEFAULT_RATES['autre']
                      const isAuto = (cat === 'livret' || cat === 'cat') && autoLivretRates[cat]
                      return (
                        <div key={cat} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: 12, color: 'var(--text)' }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                            {isAuto && <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 4 }}>auto</span>}
                          </div>
                          {(['pessimistic', 'base', 'optimistic'] as const).map(s => (
                            <div key={s} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                              <input
                                type="number" value={r[s]} step={0.5}
                                onChange={e => setRates(prev => ({ ...prev, [cat]: { ...prev[cat], [s]: parseFloat(e.target.value) || 0 } }))}
                                style={{
                                  width: 52, padding: '3px 5px', borderRadius: 5,
                                  border: `0.5px solid ${SCENARIO_COLORS[s]}40`, background: 'var(--bg)',
                                  color: SCENARIO_COLORS[s], fontSize: 12, fontFamily: 'var(--font-sans)',
                                  textAlign: 'right', fontWeight: 500,
                                }}
                              />
                              <span style={{ fontSize: 10, color: 'var(--muted)' }}>%</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

          </>
        )}
      </main>
    </div>
  )
}
