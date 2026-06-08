'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPositions, buildPortfolioSummary, formatEur, CATEGORY_LABELS } from '@/lib/portfolio'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'action' | 'etf' | 'crypto' | 'obligation' | 'livret' | 'cat' | 'per' | 'or' | 'autre' | 'immobilier'

interface CategoryRate {
  base: number
  pessimistic: number
  optimistic: number
}

interface CategoryContribution {
  monthly: number
}

// Taux annuels par défaut (%) basés sur historiques long terme
const DEFAULT_RATES: Record<Category, CategoryRate> = {
  action:      { base: 7,    pessimistic: 3,   optimistic: 12 },
  etf:         { base: 7,    pessimistic: 3,   optimistic: 11 },
  crypto:      { base: 10,   pessimistic: -20, optimistic: 40 },
  obligation:  { base: 3,    pessimistic: 1,   optimistic: 5  },
  livret:      { base: 2.5,  pessimistic: 1,   optimistic: 3  },
  cat:         { base: 3.5,  pessimistic: 2,   optimistic: 4  },
  per:         { base: 6,    pessimistic: 2,   optimistic: 10 },
  or:          { base: 5,    pessimistic: 0,   optimistic: 10 },
  autre:       { base: 3,    pessimistic: 0,   optimistic: 6  },
  immobilier:  { base: 4,    pessimistic: 1,   optimistic: 7  },
}

const SCENARIO_COLORS = {
  base:        '#534AB7',
  pessimistic: '#D85A30',
  optimistic:  '#1D9E75',
}

// ─── Calcul de projection ─────────────────────────────────────────────────────

interface ProjectionInput {
  valueByCategory: Record<string, number>
  totalRevenues: number           // revenus annuels estimés (réinvestis)
  rates: Record<string, CategoryRate>
  contributions: Record<string, CategoryContribution>
  globalContribution: number | null  // mode global (null = mode détaillé)
  horizonYears: number
}

interface YearPoint {
  year: number
  base: number
  pessimistic: number
  optimistic: number
}

function project(input: ProjectionInput): YearPoint[] {
  const { valueByCategory, totalRevenues, rates, contributions, globalContribution, horizonYears } = input

  const cats = Object.keys(valueByCategory) as Category[]
  const totalValue = cats.reduce((s, c) => s + (valueByCategory[c] ?? 0), 0)

  // Apport annuel
  const annualContribution = globalContribution !== null
    ? globalContribution * 12
    : cats.reduce((s, c) => s + (contributions[c]?.monthly ?? 0) * 12, 0)

  // Distribuer l'apport proportionnellement par catégorie (si mode global)
  const contribByCategory: Record<string, number> = {}
  if (globalContribution !== null) {
    for (const c of cats) {
      const share = totalValue > 0 ? (valueByCategory[c] ?? 0) / totalValue : 1 / cats.length
      contribByCategory[c] = globalContribution * 12 * share
    }
  } else {
    for (const c of cats) {
      contribByCategory[c] = (contributions[c]?.monthly ?? 0) * 12
    }
  }

  const points: YearPoint[] = [{ year: 0, base: totalValue, pessimistic: totalValue, optimistic: totalValue }]

  let base_vals = { ...valueByCategory }
  let pess_vals = { ...valueByCategory }
  let opti_vals = { ...valueByCategory }

  for (let y = 1; y <= horizonYears; y++) {
    for (const c of cats) {
      const r = rates[c] ?? DEFAULT_RATES['autre']
      const contrib = contribByCategory[c] ?? 0
      // Revenus réinvestis répartis au prorata de la valeur
      const revShare = totalValue > 0 ? (valueByCategory[c] ?? 0) / totalValue : 0
      const rev = totalRevenues * revShare

      base_vals[c] = (base_vals[c] + contrib + rev) * (1 + r.base / 100)
      pess_vals[c] = (pess_vals[c] + contrib) * (1 + r.pessimistic / 100)
      opti_vals[c] = (opti_vals[c] + contrib + rev) * (1 + r.optimistic / 100)
    }

    const sumBase = cats.reduce((s, c) => s + base_vals[c], 0)
    const sumPess = cats.reduce((s, c) => s + pess_vals[c], 0)
    const sumOpti = cats.reduce((s, c) => s + opti_vals[c], 0)

    points.push({ year: y, base: sumBase, pessimistic: sumPess, optimistic: sumOpti })
  }

  return points
}

// ─── Composants ───────────────────────────────────────────────────────────────

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 70 }}>{label}</span>
      <input
        type="number"
        value={value}
        step={0.5}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          width: 60, padding: '3px 6px', borderRadius: 6,
          border: '0.5px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)',
          textAlign: 'right',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PredictionPage() {
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  // Données brutes
  const [valueByCategory, setValueByCategory] = useState<Record<string, number>>({})
  const [totalRevenues, setTotalRevenues] = useState(0)
  const [autoLivretRates, setAutoLivretRates] = useState<Record<string, number>>({})

  // Paramètres de projection
  const [rates, setRates] = useState<Record<string, CategoryRate>>({ ...DEFAULT_RATES })
  const [horizonYears, setHorizonYears] = useState(20)
  const [contributionMode, setContributionMode] = useState<'global' | 'detail'>('global')
  const [globalContribution, setGlobalContribution] = useState(500)
  const [contributions, setContributions] = useState<Record<string, CategoryContribution>>(
    Object.fromEntries(Object.keys(DEFAULT_RATES).map(k => [k, { monthly: 0 }]))
  )

  // UI
  const [showRates, setShowRates] = useState(true)
  const [showContrib, setShowContrib] = useState(false)
  const [activeScenarios, setActiveScenarios] = useState({ base: true, pessimistic: true, optimistic: true })

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

    // Paginer les transactions
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
    const summary = buildPortfolioSummary(positions)

    // Valeur par catégorie
    const bycat: Record<string, number> = {}
    for (const pos of positions) {
      const c = pos.asset.category
      bycat[c] = (bycat[c] ?? 0) + pos.current_value
    }
    setValueByCategory(bycat)

    // Taux réels livrets / CAT depuis les assets
    const autoRates: Record<string, number> = {}
    for (const a of (assets ?? []) as any[]) {
      if (a.category === 'livret' && a.livret_rate) autoRates['livret'] = a.livret_rate
      if (a.category === 'cat' && a.livret_rate) autoRates['cat'] = a.livret_rate
    }
    setAutoLivretRates(autoRates)

    // Appliquer taux réels livrets/CAT automatiquement
    setRates(prev => {
      const next = { ...prev }
      if (autoRates['livret']) {
        next['livret'] = { ...next['livret'], base: autoRates['livret'] }
      }
      if (autoRates['cat']) {
        next['cat'] = { ...next['cat'], base: autoRates['cat'] }
      }
      return next
    })

    // Revenus annuels estimés (transactions dividendes/intérêts/coupons de l'année)
    const year = new Date().getFullYear()
    const revenuesTx = allTx.filter((t: any) =>
      ['dividende', 'interets', 'coupon'].includes(t.type) &&
      new Date(t.date).getFullYear() === year
    )
    const annualRevenues = revenuesTx.reduce((s: number, t: any) => s + t.quantity * t.price, 0)
    setTotalRevenues(annualRevenues)

    setLoading(false)
  }

  function updateRate(cat: string, scenario: keyof CategoryRate, value: number) {
    setRates(prev => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? DEFAULT_RATES['autre']), [scenario]: value },
    }))
  }

  const activeCats = Object.keys(valueByCategory).filter(c => (valueByCategory[c] ?? 0) > 0) as Category[]

  const projectionData = useMemo(() => {
    return project({
      valueByCategory,
      totalRevenues,
      rates,
      contributions,
      globalContribution: contributionMode === 'global' ? globalContribution : null,
      horizonYears,
    })
  }, [valueByCategory, totalRevenues, rates, contributions, globalContribution, contributionMode, horizonYears])

  const currentYear = new Date().getFullYear()
  const finalPoint = projectionData[projectionData.length - 1]

  const chartData = projectionData.map(p => ({
    name: currentYear + p.year,
    base: Math.round(p.base),
    pessimistic: Math.round(p.pessimistic),
    optimistic: Math.round(p.optimistic),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
        <p style={{ color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
            {p.name} : {privacy ? '••••• €' : formatEur(p.value, 0)}
          </p>
        ))}
      </div>
    )
  }

  const scenarioLabel: Record<string, string> = {
    base: 'Scénario de base',
    pessimistic: 'Pessimiste',
    optimistic: 'Optimiste',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} mobile={mobile} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: mobile ? '20px 12px' : '32px 24px' }}>

        {/* En-tête */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: mobile ? 20 : 24, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Prédiction
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Projection de votre patrimoine sur {horizonYears} ans selon diff&eacute;rents sc&eacute;narios.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>
        ) : (
          <>
            {/* KPIs scénarios */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
              {(['pessimistic', 'base', 'optimistic'] as const).map(s => {
                const val = finalPoint?.[s] ?? 0
                const start = projectionData[0]?.[s] ?? 0
                const gain = val - start
                const pct = start > 0 ? (gain / start) * 100 : 0
                const color = s === 'optimistic' ? 'var(--green)' : s === 'pessimistic' ? 'var(--red)' : 'var(--brand)'
                return (
                  <div key={s} style={{
                    background: 'var(--surface)', borderRadius: 10, padding: '14px 16px',
                    border: `0.5px solid ${s === 'base' ? 'var(--brand)' : 'var(--border)'}`,
                  }}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {scenarioLabel[s]}
                    </p>
                    <p style={{ fontSize: mobile ? 18 : 22, fontWeight: 700, color, filter: privacy ? 'blur(7px)' : 'none' }}>
                      {formatEur(val, 0)}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      dans {horizonYears} ans · <span style={{ color }}>{pct >= 0 ? '+' : ''}{pct.toFixed(0)}%</span>
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Slider horizon */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Horizon</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand)' }}>{horizonYears} ans</span>
              </div>
              <input
                type="range" min={1} max={50} value={horizonYears}
                onChange={e => setHorizonYears(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                <span>1 an</span><span>50 ans</span>
              </div>
            </div>

            {/* Graphe */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '0.5px solid var(--border)' }}>
              {/* Toggles scénarios */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['pessimistic', 'base', 'optimistic'] as const).map(s => (
                  <button key={s} onClick={() => setActiveScenarios(prev => ({ ...prev, [s]: !prev[s] }))} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${SCENARIO_COLORS[s]}`,
                    background: activeScenarios[s] ? SCENARIO_COLORS[s] + '20' : 'transparent',
                    color: activeScenarios[s] ? SCENARIO_COLORS[s] : 'var(--muted)',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeScenarios[s] ? SCENARIO_COLORS[s] : 'var(--muted)', display: 'inline-block' }} />
                    {scenarioLabel[s]}
                  </button>
                ))}
              </div>

              <div style={{ height: mobile ? 220 : 300, filter: privacy ? 'blur(8px)' : 'none', transition: 'filter 0.2s' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false}
                      interval={Math.floor(horizonYears / 5)} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    {activeScenarios.pessimistic && (
                      <Line type="monotone" dataKey="pessimistic" name="Pessimiste"
                        stroke={SCENARIO_COLORS.pessimistic} strokeWidth={1.5} dot={false}
                        strokeDasharray="4 3" activeDot={{ r: 3 }} />
                    )}
                    {activeScenarios.base && (
                      <Line type="monotone" dataKey="base" name="Base"
                        stroke={SCENARIO_COLORS.base} strokeWidth={2} dot={false}
                        activeDot={{ r: 3, fill: SCENARIO_COLORS.base }} />
                    )}
                    {activeScenarios.optimistic && (
                      <Line type="monotone" dataKey="optimistic" name="Optimiste"
                        stroke={SCENARIO_COLORS.optimistic} strokeWidth={1.5} dot={false}
                        strokeDasharray="4 3" activeDot={{ r: 3 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Apports */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)', marginBottom: 16, overflow: 'hidden' }}>
              <button onClick={() => setShowContrib(p => !p)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text)', fontFamily: 'var(--font-sans)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Apports mensuels</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Toggle mode */}
                  <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
                    {(['global', 'detail'] as const).map(m => (
                      <button key={m} onClick={e => { e.stopPropagation(); setContributionMode(m) }} style={{
                        padding: '2px 8px', borderRadius: 4, border: 'none',
                        background: contributionMode === m ? 'var(--surface)' : 'transparent',
                        color: contributionMode === m ? 'var(--brand)' : 'var(--muted)',
                        fontSize: 11, fontWeight: contributionMode === m ? 500 : 400,
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}>{m === 'global' ? 'Global' : 'Détaillé'}</button>
                    ))}
                  </div>
                  {showContrib ? <ChevronUp size={15} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)' }} />}
                </div>
              </button>

              {showContrib && (
                <div style={{ borderTop: '0.5px solid var(--border)', padding: '14px 20px' }}>
                  {contributionMode === 'global' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Apport mensuel total</span>
                      <input
                        type="number"
                        value={globalContribution}
                        step={50}
                        onChange={e => setGlobalContribution(parseFloat(e.target.value) || 0)}
                        style={{
                          width: 90, padding: '5px 8px', borderRadius: 7,
                          border: '0.5px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>€/mois</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {activeCats.map(cat => (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              value={contributions[cat]?.monthly ?? 0}
                              step={50}
                              onChange={e => setContributions(prev => ({
                                ...prev,
                                [cat]: { monthly: parseFloat(e.target.value) || 0 },
                              }))}
                              style={{
                                width: 80, padding: '4px 8px', borderRadius: 6,
                                border: '0.5px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)',
                                textAlign: 'right',
                              }}
                            />
                            <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>€/mois</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Taux de rendement */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)', marginBottom: 16, overflow: 'hidden' }}>
              <button onClick={() => setShowRates(p => !p)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text)', fontFamily: 'var(--font-sans)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Settings2 size={14} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Taux de rendement par catégorie</span>
                </div>
                {showRates ? <ChevronUp size={15} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)' }} />}
              </button>

              {showRates && (
                <div style={{ borderTop: '0.5px solid var(--border)', padding: '14px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '0.5px solid var(--border)' }}>
                    <span />
                    {(['pessimistic', 'base', 'optimistic'] as const).map(s => (
                      <span key={s} style={{ fontSize: 10, color: SCENARIO_COLORS[s], textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {s === 'pessimistic' ? 'Pessimiste' : s === 'base' ? 'Base' : 'Optimiste'}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {activeCats.map(cat => {
                      const r = rates[cat] ?? DEFAULT_RATES['autre']
                      const isAutoRate = (cat === 'livret' || cat === 'cat') && autoLivretRates[cat]
                      return (
                        <div key={cat} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: 12, color: 'var(--text)' }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                            {isAutoRate && (
                              <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 4 }}>auto</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <RateInput label="" value={r.pessimistic} onChange={v => updateRate(cat, 'pessimistic', v)} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <RateInput label="" value={r.base} onChange={v => updateRate(cat, 'base', v)} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <RateInput label="" value={r.optimistic} onChange={v => updateRate(cat, 'optimistic', v)} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {totalRevenues > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 12 }}>
                      Revenus estim&eacute;s r&eacute;investis : {formatEur(totalRevenues, 0)}/an (dividendes + int&eacute;r&ecirc;ts + coupons de l&apos;ann&eacute;e en cours)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tableau annuel léger */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Tableau de projection</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Année</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right', color: SCENARIO_COLORS.pessimistic, fontWeight: 500 }}>Pessimiste</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right', color: SCENARIO_COLORS.base, fontWeight: 500 }}>Base</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right', color: SCENARIO_COLORS.optimistic, fontWeight: 500 }}>Optimiste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionData
                      .filter((_, i) => i === 0 || i % Math.max(1, Math.floor(horizonYears / 10)) === 0 || i === projectionData.length - 1)
                      .map((p, idx) => (
                        <tr key={p.year} style={{ borderTop: '0.5px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                          <td style={{ padding: '8px 16px', color: 'var(--text)', fontWeight: p.year === 0 ? 500 : 400 }}>
                            {currentYear + p.year}{p.year === 0 ? ' (auj.)' : ''}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text)', filter: privacy ? 'blur(6px)' : 'none' }}>
                            {formatEur(p.pessimistic, 0)}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text)', fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>
                            {formatEur(p.base, 0)}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text)', filter: privacy ? 'blur(6px)' : 'none' }}>
                            {formatEur(p.optimistic, 0)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

          </>
        )}
      </main>
    </div>
  )
}
