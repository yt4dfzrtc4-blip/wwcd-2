'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Snapshot } from '@/types'
import { formatEur } from '@/lib/portfolio'

interface EvolutionChartProps {
  snapshots: Snapshot[]
  hidden?: boolean
}

export default function EvolutionChart({ snapshots, hidden }: EvolutionChartProps) {
  if (!snapshots.length) return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
      Pas encore de données historiques
    </div>
  )

  const data = snapshots.map(s => ({
    date: s.date,
    value: s.total_value,
    invested: s.total_invested,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <p style={{ color: 'var(--muted)', marginBottom: 4 }}>
          {format(parseISO(label), 'd MMM yyyy', { locale: fr })}
        </p>
        <p style={{ color: 'var(--brand)', fontWeight: 500 }}>
          {hidden ? '••••• €' : formatEur(payload[0].value, 0)}
        </p>
      </div>
    )
  }

  return (
    <div style={{ height: 140, filter: hidden ? 'blur(6px)' : 'none', transition: 'filter 0.2s' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="brandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#534AB7" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#534AB7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={d => format(parseISO(d), 'MMM', { locale: fr })}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#534AB7"
            strokeWidth={1.8}
            fill="url(#brandGrad)"
            dot={false}
            activeDot={{ r: 3, fill: '#534AB7', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
