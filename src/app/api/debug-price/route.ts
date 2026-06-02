import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'MC.PA'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    const status = res.status
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}

    const price = parsed?.chart?.result?.[0]?.meta?.regularMarketPrice
    const prevClose = parsed?.chart?.result?.[0]?.meta?.chartPreviousClose

    return NextResponse.json({ ticker, status, price, prevClose, error: parsed?.chart?.error ?? null })
  } catch (e: any) {
    return NextResponse.json({ ticker, error: e.message })
  }
}
