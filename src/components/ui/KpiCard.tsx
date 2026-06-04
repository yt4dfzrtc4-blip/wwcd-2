interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subColor?: 'gain' | 'loss' | 'neutral'
  valueColor?: 'gain' | 'loss' | 'neutral'
  hidden?: boolean
  subHidden?: boolean
}

export default function KpiCard({ label, value, sub, subColor = 'neutral', valueColor, hidden, subHidden }: KpiCardProps) {
  const colors = { gain: 'var(--green)', loss: 'var(--red)', neutral: 'var(--muted)' }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '0.5px solid var(--border)',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>
        {label}
      </p>
      <p style={{
        fontSize: 22,
        fontWeight: 500,
        color: valueColor ? colors[valueColor] : 'var(--text)',
        filter: hidden ? 'blur(8px)' : 'none',
        userSelect: hidden ? 'none' : 'auto',
        transition: 'filter 0.2s',
        lineHeight: 1.1,
      }}>
        {value}
      </p>
      {sub && (
        <p style={{
          fontSize: 11, marginTop: 5,
          color: colors[subColor],
          filter: subHidden ? 'blur(5px)' : 'none',
          userSelect: subHidden ? 'none' : 'auto',
          transition: 'filter 0.2s',
        }}>
          {sub}
        </p>
      )}
    </div>
  )
}
