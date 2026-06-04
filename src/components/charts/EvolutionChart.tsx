'use client'

import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, subDays, subWeeks, subMonths, subYears } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Snapshot } from '@/types'
import { formatEur } from '@/lib/portfolio'

type Period = '1j' | '1s' | '1m' | '1a' | '3a' | '5a' | '10a'
const PERIODS: { key: Period; label: string; days?: number; weeks?: number; months?: number; years?: number }[] = [
  { key: '1j',  label: '1J',  days: 1 },
  { key: '1s',  label: '1S',  weeks: 1 },
  { key: '1m',  label: '1M',  months: 1 },
  { key: '1a',  label: '1A',  years: 1 },
  { key: '3a',  label: '3A',  years: 3 },
  { key: '5a',  label: '5A',  years: 5 },
  { key: '10a', label: '10A', years: 10 },
]

interface EvolutionChartProps {
  snapshots: Snapshot[]
  hidden?: boolean
}

export default function EvolutionChart({ snapshots, hidden }: EvolutionChartProps) {
  const [period, setPeriod] = useState<Period>('1m')

  const now = new Date()
  const p = PERIODS.find(p => p.key === period)!
  const cutoff = p.years ? subYears(now, p.years)
    : p.months ? subMonths(now, p.months)
    : p.weeks ? subWeeks(now, p.weeks)
    : p.days ? subDays(now, p.days)
    : null

  const filtered = cutoff
    ? snapshots.filter(s => new Date(s.date) >= cutoff)
    : snapshots

  const first = filtered[0]?.total_value ?? 0
  const last = filtered[filtered.length - 1]?.total_value ?? 0
  const isUp = last >= first
  const pct = first > 0 ? ((last - first) / first) * 100 : 0

  const data = filtered.map(s => ({
    date: s.date,
    value: s.total_value,
  }))

  const tickFormat = (d: string) => {
    if (['1j','1s'].includes(period)) return format(parseISO(d), 'd MMM', { locale: fr })
    if (['1m','1a'].includes(period)) return format(parseISO(d), 'd MMM', { locale: fr })
    return format(parseISO(d), 'MMM yy', { locale: fr })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <p style={{ color: 'var(--muted)', marginBottom: 4 }}>{format(parseISO(label), 'd MMM yyyy', { locale: fr })}</p>
        <p style={{ color: 'var(--brand)', fontWeight: 500 }}>{hidden ? '••••• €' : formatEur(payload[0].value, 0)}</p>
      </div>
    )
  }

  if (!snapshots.length) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
      Pas encore de données historiques
    </div>
  )

  return (
    <div>
      {/* Performance + sélecteur */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: isUp ? 'var(--green)' : 'var(--red)', fontWeight: 500, filter: hidden ? 'blur(5px)' : 'none' }}>
          {isUp ? '+' : ''}{pct.toFixed(2)} %
        </p>
        <div style={{ display: 'flex', gap: 1, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{
              padding: '3px 6px', borderRadius: 5, border: 'none',
              background: period === p.key ? 'var(--surface)' : 'transparent',
              color: period === p.key ? 'var(--brand)' : 'var(--muted)',
              fontSize: 10, fontWeight: period === p.key ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      <div style={{ height: 140, filter: hidden ? 'blur(6px)' : 'none', transition: 'filter 0.2s' }}>
        {!filtered.length ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Pas de données sur cette période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="brandGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#534AB7" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#534AB7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={tickFormat} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="#534AB7" strokeWidth={1.8} fill="url(#brandGrad2)" dot={false} activeDot={{ r: 3, fill: '#534AB7', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
