import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import { buildPositions, buildPortfolioSummary } from '@/lib/portfolio'
import type { Transaction, Asset, Account } from '@/types'

export const maxDuration = 60

async function fetchYahooHistory(ticker: string): Promise<{ date: string; close: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return []
    const timestamps: number[] = result.timestamp ?? []
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []
    return timestamps
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().split('T')[0], close: closes[i] }))
      .filter(p => p.close != null && !isNaN(p.close))
  } catch {
    return []
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const current = idx++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Recherche par dichotomie du dernier cours connu à date <= dateStr
function priceOnOrBefore(points: { date: string; close: number }[], dateStr: string): number | null {
  let lo = 0, hi = points.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= dateStr) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans >= 0 ? points[ans].close : null
}

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const [{ data: assets }, { data: accounts }] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', user.id),
    supabase.from('accounts').select('*').eq('user_id', user.id),
  ])
  if (!assets || !accounts) return NextResponse.json({ error: 'Données manquantes' }, { status: 500 })

  const allTransactions = await fetchAllPaginated<Transaction>((from, to) =>
    supabase.from('transactions').select('*').eq('user_id', user.id).range(from, to)
  )
  if (!allTransactions.length) return NextResponse.json({ error: 'Aucune transaction' }, { status: 400 })

  const tickers = Array.from(new Set(
    (assets as Asset[])
      .filter(a => ['action', 'etf', 'crypto'].includes(a.category) && a.ticker)
      .map(a => a.ticker as string)
  ))

  const histories = await mapWithConcurrency(tickers, 15, async ticker => ({
    ticker,
    points: await fetchYahooHistory(ticker),
  }))

  const priceMap = new Map<string, { date: string; close: number }[]>()
  let tickersFailed = 0
  for (const h of histories) {
    if (h.points.length) priceMap.set(h.ticker, h.points)
    else tickersFailed++
  }

  const sortedDates = allTransactions.map(t => t.date).sort()
  const earliest = sortedDates[0]
  const todayStr = new Date().toISOString().split('T')[0]

  const dates: string[] = []
  const cursor = new Date(`${earliest}T00:00:00Z`)
  const end = new Date(`${todayStr}T00:00:00Z`)
  while (cursor < end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const rows: { user_id: string; date: string; total_value: number; total_invested: number }[] = []

  for (const date of dates) {
    const txsUpToDate = allTransactions.filter(t => t.date <= date)
    if (!txsUpToDate.length) continue

    const assetsForDate = (assets as Asset[]).map(a => {
      const clone: any = { ...a }

      if (a.ticker && priceMap.has(a.ticker)) {
        const price = priceOnOrBefore(priceMap.get(a.ticker)!, date)
        clone.prices = price != null ? { id: '', asset_id: a.id, price, change_pct: 0, updated_at: date } : undefined
      } else {
        clone.prices = undefined
      }

      // Obligations et créances : positions basées sur des champs asset-level
      // (pas de transaction), donc on les exclut avant leur date de départ.
      if (a.category === 'obligation') {
        const createdDate = a.created_at ? a.created_at.split('T')[0] : null
        if (createdDate && createdDate > date) clone.obligation_nominal = 0
      }
      if (a.category === 'creance') {
        const startDate = (a as any).creance_start_date || (a.created_at ? a.created_at.split('T')[0] : null)
        if (startDate && startDate > date) clone.creance_initial = 0
      }
      if (a.category === 'mobilier') {
        const createdDate = a.created_at ? a.created_at.split('T')[0] : null
        if (createdDate && createdDate > date) { clone.mobilier_purchase_price = 0; clone.mobilier_current_value = 0 }
      }

      return clone
    })

    const positions = buildPositions(txsUpToDate as Transaction[], assetsForDate as Asset[], accounts as Account[])
    const summary = buildPortfolioSummary(positions)
    if (summary.total_value <= 0) continue

    rows.push({ user_id: user.id, date, total_value: summary.total_value, total_invested: summary.total_invested })
  }

  let inserted = 0
  let upsertError: string | null = null
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('snapshots').upsert(chunk, { onConflict: 'user_id,date' })
    if (error) upsertError = error.message
    else inserted += chunk.length
  }

  return NextResponse.json({
    inserted,
    days_processed: dates.length,
    tickers_ok: priceMap.size,
    tickers_failed: tickersFailed,
    ...(upsertError ? { error: upsertError } : {}),
  })
}
