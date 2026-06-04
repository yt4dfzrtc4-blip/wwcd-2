'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatEur } from '@/lib/portfolio'

const PERIODS = ['1j', '1s', '1m', '1a', '3a', '5a', '10a'] as const
type Period = typeof PERIODS[number]

const PERIOD_LABELS: Record<Period, string> = {
  '1j': '1J', '1s': '1S', '1m': '1M', '1a': '1A', '3a': '3A', '5a': '5A', '10a': '10A',
}

function formatTick(ts: number, period: Period): string {
  const d = new Date(ts)
  if (period === '1j') return format(d, 'HH:mm')
  if (period === '1s') return format(d, 'EEE', { locale: fr })
  if (period === '1m') return format(d, 'd MMM', { locale: fr })
  if (period === '1a') return format(d, 'MMM', { locale: fr })
  return format(d, 'MMM yy', { locale: fr })
}

export default function PortfolioEvolutionChart({ hidden }: { hidden?: boolean }) {
  const [period, setPeriod] = useState<Period>('1m')
  const [data, setData] = useState<{ t: number; value: number }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/portfolio-history?period=${period}`)
      .then(r => r.json())
      .then(d => setData(d.points ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [period])

  const first = data[0]?.value ?? 0
  const last = data[data.length - 1]?.value ?? 0
  const isUp = last >= first
  const pct = first > 0 ? ((last - first) / first) * 100 : 0
  const color = isUp ? 'var(--green)' : 'var(--red)'

  const chartData = data.map(p => ({ ...p, label: formatTick(p.t, period) }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: isUp ? 'var(--green)' : 'var(--red)', fontWeight: 500, filter: hidden ? 'blur(5px)' : 'none' }}>
          {data.length > 1 ? `${isUp ? '+' : ''}${pct.toFixed(2)} %` : ''}
        </p>
        <div style={{ display: 'flex', gap: 1, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '3px 6px', borderRadius: 5, border: 'none',
              background: period === p ? 'var(--surface)' : 'transparent',
              color: period === p ? 'var(--brand)' : 'var(--muted)',
              fontSize: 10, fontWeight: period === p ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>{PERIOD_LABELS[p]}</button>
          ))}
        </div>
      </div>

      <div style={{ height: 140, filter: hidden ? 'blur(6px)' : 'none' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Chargement…
          </div>
        ) : !data.length ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Pas de données sur cette période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [hidden ? '••••• €' : formatEur(v, 0), 'Portefeuille']}
                labelFormatter={(l) => l}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.8} fill="url(#portfolioGrad)" dot={false} activeDot={{ r: 3, fill: color, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
