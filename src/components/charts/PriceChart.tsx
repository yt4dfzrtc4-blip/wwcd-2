'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const PERIODS = ['1h','1j','1s','1m','1a','3a','5a','10a'] as const
type Period = typeof PERIODS[number]

const PERIOD_LABELS: Record<Period, string> = {
  '1h': '1h', '1j': '1j', '1s': '1S', '1m': '1M',
  '1a': '1A', '3a': '3A', '5a': '5A', '10a': '10A',
}

function formatDate(ts: number, period: Period): string {
  const d = new Date(ts)
  if (['1h','1j'].includes(period)) return format(d, 'HH:mm')
  if (period === '1s') return format(d, 'EEE', { locale: fr })
  if (period === '1m') return format(d, 'd MMM', { locale: fr })
  return format(d, 'MMM yy', { locale: fr })
}

interface Props {
  ticker: string
  hidden?: boolean
}

export default function PriceChart({ ticker, hidden }: Props) {
  const [period, setPeriod] = useState<Period>('1a')
  const [data, setData] = useState<{ t: number; v: number }[]>([])
  const [currency, setCurrency] = useState('EUR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(false)
    fetch(`/api/price-history?ticker=${encodeURIComponent(ticker)}&period=${period}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(true); return }
        setData(d.points ?? [])
        setCurrency(d.currency ?? 'EUR')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [ticker, period])

  const first = data[0]?.v ?? 0
  const last = data[data.length - 1]?.v ?? 0
  const isUp = last >= first
  const color = isUp ? 'var(--green)' : 'var(--red)'

  const chartData = data.map(p => ({ t: p.t, v: p.v, label: formatDate(p.t, period) }))

  const fmt = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pct = first > 0 ? ((last - first) / first) * 100 : 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 500, filter: hidden ? 'blur(7px)' : 'none' }}>
            {fmt(last)} {currency}
          </p>
          <p style={{ fontSize: 12, color: isUp ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
            {isUp ? '+' : ''}{fmt(last - first)} ({isUp ? '+' : ''}{pct.toFixed(2)} %)
          </p>
        </div>
        {/* Sélecteur de période */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '4px 8px', borderRadius: 6, border: 'none',
                background: period === p ? 'var(--surface)' : 'transparent',
                color: period === p ? 'var(--brand)' : 'var(--muted)',
                fontSize: 11, fontWeight: period === p ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Graphique */}
      {loading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Chargement…
        </div>
      ) : error ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Données non disponibles pour ce ticker
        </div>
      ) : (
        <div style={{ filter: hidden ? 'blur(6px)' : 'none' }}>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${fmt(v)} ${currency}`, 'Cours']}
                labelFormatter={(l) => l}
              />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
