import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  // 1. Test Yahoo Finance direct
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'MC.PA'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`
  let yahooResult: any = null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    yahooResult = { status: res.status, price }
  } catch (e: any) {
    yahooResult = { error: e.message }
  }

  // 2. Vérifier l'utilisateur connecté
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Charger les actifs de l'utilisateur
  let assets: any[] = []
  if (user) {
    const serviceClient = createServiceClient()
    const { data } = await serviceClient
      .from('assets')
      .select('id, name, ticker, category')
      .eq('user_id', user.id)
    assets = data ?? []
  }

  // 4. Vérifier les prix existants
  let prices: any[] = []
  if (user) {
    const serviceClient = createServiceClient()
    const { data } = await serviceClient
      .from('prices')
      .select('asset_id, price, updated_at')
    prices = data ?? []
  }

  return NextResponse.json({
    yahoo: yahooResult,
    user: user ? { id: user.id, email: user.email } : null,
    assets,
    prices,
  }, { status: 200 })
}
