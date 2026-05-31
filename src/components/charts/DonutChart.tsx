'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { CATEGORY_COLORS, CATEGORY_LABELS, formatEur } from '@/lib/portfolio'

interface DonutChartProps {
  data: Record<string, number>
  hidden?: boolean
}

export default function DonutChart({ data, hidden }: DonutChartProps) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const total = entries.reduce((sum, [, v]) => sum + v, 0)

  const chartData = entries.map(([key, value]) => ({
    name: CATEGORY_LABELS[key] ?? key,
    value,
    color: CATEGORY_COLORS[key] ?? '#B4B2A9',
    key,
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const { name, value } = payload[0]
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
    return (
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 12 }}>
        <p style={{ fontWeight: 500, marginBottom: 2 }}>{name}</p>
        <p style={{ color: 'var(--muted)' }}>{hidden ? '•••' : formatEur(value, 0)} · {pct} %</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, filter: hidden ? 'blur(5px)' : 'none', transition: 'filter 0.2s' }}>
      <div style={{ width: 110, height: 110, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%" cy="50%"
              innerRadius={32} outerRadius={50}
              dataKey="value"
              strokeWidth={0}
              paddingAngle={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {chartData.slice(0, 5).map(entry => (
          <div key={entry.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--muted)' }}>{entry.name}</span>
            </div>
            <span style={{ fontWeight: 500 }}>
              {total > 0 ? `${((entry.value / total) * 100).toFixed(0)} %` : '–'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
