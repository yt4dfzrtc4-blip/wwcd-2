'use client'

import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, subMonths, subYears } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Snapshot } from '@/types'
import { formatEur } from '@/lib/portfolio'

type Period = '1m' | '3m' | '6m' | '1a' | '3a' | '5a' | 'max'
const PERIODS: { key: Period; label: string; months?: number; years?: number }[] = [
  { key: '1m',  label: '1M',  months: 1 },
  { key: '3m',  label: '3M',  months: 3 },
  { key: '6m',  label: '6M',  months: 6 },
  { key: '1a',  label: '1A',  years: 1 },
  { key: '3a',  label: '3A',  years: 3 },
  { key: '5a',  label: '5A',  years: 5 },
  { key: 'max', label: 'Max' },
]

interface EvolutionChartProps {
  snapshots: Snapshot[]
  hidden?: boolean
}

export default function EvolutionChart({ snapshots, hidden }: EvolutionChartProps) {
  const [period, setPeriod] = useState<Period>('1a')

  const now = new Date()
  const cutoff = period === 'max' ? null
    : PERIODS.find(p => p.key === period)?.years
      ? subYears(now, PERIODS.find(p => p.key === period)!.years!)
      : subMonths(now, PERIODS.find(p => p.key === period)!.months!)

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
    if (['1m','3m'].includes(period)) return format(parseISO(d), 'd MMM', { locale: fr })
    if (['6m','1a'].includes(period)) return format(parseISO(d), 'MMM', { locale: fr })
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
