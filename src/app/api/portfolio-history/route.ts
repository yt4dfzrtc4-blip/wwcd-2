import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PERIOD_CONFIG: Record<string, { yahooInterval: string; yahooRange: string }> = {
  '1j':  { yahooInterval: '5m',  yahooRange: '1d'  },
  '1s':  { yahooInterval: '1d',  yahooRange: '5d'  },
  '1m':  { yahooInterval: '1d',  yahooRange: '1mo' },
  '1a':  { yahooInterval: '1wk', yahooRange: '1y'  },
  '3a':  { yahooInterval: '1mo', yahooRange: '3y'  },
  '5a':  { yahooInterval: '1mo', yahooRange: '5y'  },
  '10a': { yahooInterval: '3mo', yahooRange: '10y' },
}

async function fetchYahooHistory(ticker: string, interval: string, range: string): Promise<{ t: number; v: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return []
    const timestamps: number[] = result.timestamp ?? []
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []
    return timestamps.map((t, i) => ({ t: t * 1000, v: closes[i] })).filter(p => p.v != null && !isNaN(p.v))
  } catch {
    return []
  }
}

function getPriceAtTime(history: { t: number; v: number }[], ts: number): number | null {
  const before = history.filter(p => p.t <= ts)
  if (!before.length) return null
  return before[before.length - 1].v
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '1m'
  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1m']

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const [{ data: transactions }, { data: assets }, { data: accounts }] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user.id).order('date'),
    supabase.from('assets').select('*').eq('user_id', user.id),
    supabase.from('accounts').select('*').eq('user_id', user.id),
  ])

  const tickerAssets = (assets ?? []).filter(a => a.ticker && ['action', 'etf', 'crypto'].includes(a.category))
  const faceAssets = (assets ?? []).filter(a => !a.ticker || !['action', 'etf', 'crypto'].includes(a.category))

  // Fetch price histories for all ticker assets in parallel
  const priceHistories: Record<string, { t: number; v: number }[]> = {}
  await Promise.all(
    tickerAssets.map(async (asset) => {
      priceHistories[asset.id] = await fetchYahooHistory(asset.ticker!, config.yahooInterval, config.yahooRange)
    })
  )

  // Use timestamps from first available ticker as reference timeline
  let refTimestamps: number[] = []
  for (const asset of tickerAssets) {
    if (priceHistories[asset.id]?.length) {
      refTimestamps = priceHistories[asset.id].map(p => p.t)
      break
    }
  }

  // If no tickers, generate a daily timeline based on the period
  if (!refTimestamps.length) {
    const now = Date.now()
    const ranges: Record<string, number> = {
      '1j': 86400000, '1s': 7 * 86400000, '1m': 30 * 86400000,
      '1a': 365 * 86400000, '3a': 3 * 365 * 86400000,
      '5a': 5 * 365 * 86400000, '10a': 10 * 365 * 86400000,
    }
    const steps: Record<string, number> = {
      '1j': 3600000, '1s': 86400000, '1m': 86400000,
      '1a': 7 * 86400000, '3a': 30 * 86400000,
      '5a': 30 * 86400000, '10a': 90 * 86400000,
    }
    const rangeMs = ranges[period] ?? ranges['1m']
    const stepMs = steps[period] ?? steps['1m']
    const start = now - rangeMs
    for (let t = start; t <= now; t += stepMs) refTimestamps.push(t)
  }

  // For each timestamp, compute total portfolio value
  const points = refTimestamps.map(ts => {
    const dateStr = new Date(ts).toISOString().split('T')[0]
    let value = 0

    // Ticker assets: quantity at date × historical price
    for (const asset of tickerAssets) {
      const history = priceHistories[asset.id] ?? []
      const price = getPriceAtTime(history, ts)
      if (price == null) continue

      const txs = (transactions ?? []).filter(t => t.asset_id === asset.id && t.date <= dateStr)
      const qty = txs.reduce((s: number, t: any) => {
        if (t.type === 'achat') return s + t.quantity
        if (t.type === 'vente') return s - t.quantity
        return s
      }, 0)
      value += Math.max(0, qty) * price
    }

    // Face-value assets: book value from transactions at date
    for (const asset of faceAssets) {
      const txs = (transactions ?? []).filter(t => t.asset_id === asset.id && t.date <= dateStr)
      const fv = txs.reduce((s: number, t: any) => {
        const amt = t.quantity * t.price
        if (t.type === 'achat' || t.type === 'interets') return s + amt
        if (t.type === 'vente' || t.type === 'remboursement') return s - amt
        return s
      }, 0)
      value += Math.max(0, fv)
    }

    // Livret accounts with balance mode
    for (const acc of (accounts ?? [])) {
      if (acc.type !== 'livret') continue
      const livretAsset = (assets ?? []).find(a => a.category === 'livret')
      if (livretAsset?.livret_mode === 'balance' && (livretAsset as any).livret_balance) {
        // Already handled via face assets if asset exists
      }
    }

    return { t: ts, value: Math.round(value * 100) / 100 }
  }).filter(p => p.value > 0)

  return NextResponse.json({ points })
}
