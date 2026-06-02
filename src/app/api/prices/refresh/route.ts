import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function fetchYahooPrice(ticker: string): Promise<{ price: number; change_pct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const price = result.meta?.regularMarketPrice
    const prevClose = result.meta?.chartPreviousClose
    const change_pct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0
    return { price, change_pct }
  } catch {
    return null
  }
}

async function fetchCoinGeckoPrice(coinId: string): Promise<{ price: number; change_pct: number } | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur&include_24hr_change=true`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const coin = data[coinId]
    if (!coin) return null
    return { price: coin.eur, change_pct: coin.eur_24h_change ?? 0 }
  } catch {
    return null
  }
}

// POST : appelé manuellement depuis l'app (session utilisateur)
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: assets } = await supabase
    .from('assets')
    .select('id, ticker, category')
    .eq('user_id', user.id)

  if (!assets?.length) return NextResponse.json({ updated: 0, errors: [] })

  let updated = 0
  const errors: string[] = []

  for (const asset of assets) {
    if (!asset.ticker) continue

    let priceData: { price: number; change_pct: number } | null = null

    if (asset.category === 'crypto') {
      priceData = await fetchCoinGeckoPrice(asset.ticker)
    } else if (['action', 'etf'].includes(asset.category)) {
      priceData = await fetchYahooPrice(asset.ticker)
    }

    if (!priceData) {
      errors.push(asset.ticker)
      continue
    }

    const { error } = await supabase
      .from('prices')
      .upsert({
        asset_id: asset.id,
        price: priceData.price,
        change_pct: priceData.change_pct,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'asset_id' })

    if (!error) updated++
    else errors.push(`${asset.ticker}: ${error.message}`)
  }

  return NextResponse.json({ updated, errors })
}

// GET : appelé par Vercel Cron
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  // Pour le cron, on appelle POST en interne
  return POST()
}
