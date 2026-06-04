import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker manquant' }, { status: 400 })

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y&events=dividends`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Yahoo Finance error' }, { status: 502 })

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return NextResponse.json({ error: 'Pas de données' }, { status: 404 })

    const currentPrice: number = result.meta?.regularMarketPrice
    const dividends: Record<string, { amount: number; date: number }> = result.events?.dividends ?? {}

    if (!currentPrice || Object.keys(dividends).length === 0) {
      return NextResponse.json({ dividendYield: null, frequency: null, month: null })
    }

    const divList = Object.values(dividends).sort((a, b) => a.date - b.date)
    const totalAnnual = divList.reduce((s, d) => s + d.amount, 0)
    const dividendYield = Math.round((totalAnnual / currentPrice) * 10000) / 100

    // Determine frequency from number of payments in past year
    const count = divList.length
    const frequency = count >= 10 ? 'mensuelle' : count >= 3 ? 'trimestrielle' : count >= 2 ? 'semestrielle' : 'annuelle'

    // First payment month (1-12)
    const firstDate = new Date(divList[0].date * 1000)
    const month = firstDate.getMonth() + 1

    return NextResponse.json({ dividendYield, frequency, month })
  } catch {
    return NextResponse.json({ error: 'Erreur réseau' }, { status: 500 })
  }
}
