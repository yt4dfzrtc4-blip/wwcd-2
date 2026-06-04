import { NextRequest, NextResponse } from 'next/server'

const PERIODS: Record<string, { interval: string; range: string }> = {
  '1h':  { interval: '2m',  range: '1d'  },
  '1j':  { interval: '5m',  range: '1d'  },
  '1s':  { interval: '1h',  range: '5d'  },
  '1m':  { interval: '1d',  range: '1mo' },
  '1a':  { interval: '1wk', range: '1y'  },
  '3a':  { interval: '1mo', range: '3y'  },
  '5a':  { interval: '1mo', range: '5y'  },
  '10a': { interval: '3mo', range: '10y' },
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  const period = req.nextUrl.searchParams.get('period') ?? '1a'

  if (!ticker) return NextResponse.json({ error: 'ticker manquant' }, { status: 400 })

  const { interval, range } = PERIODS[period] ?? PERIODS['1a']
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: 'Yahoo Finance error' }, { status: 502 })

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return NextResponse.json({ error: 'Pas de données' }, { status: 404 })

    const timestamps: number[] = result.timestamp ?? []
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

    const points = timestamps
      .map((t, i) => ({ t: t * 1000, v: closes[i] }))
      .filter(p => p.v != null && !isNaN(p.v))

    const currency = result.meta?.currency ?? 'USD'

    return NextResponse.json({ points, currency })
  } catch {
    return NextResponse.json({ error: 'Erreur réseau' }, { status: 500 })
  }
}
