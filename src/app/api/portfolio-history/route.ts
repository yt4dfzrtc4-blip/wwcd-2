import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPositions, buildPortfolioSummary } from '@/lib/portfolio'

const PERIOD_DAYS: Record<string, number> = {
  '1j': 1, '1s': 7, '1m': 30, '1a': 365, '3a': 1095, '5a': 1825, '10a': 3650,
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '1m'
  const days = PERIOD_DAYS[period] ?? 30

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  // Récupérer les snapshots sur la période
  const { data: snapshots } = await supabase
    .from('snapshots')
    .select('date, total_value')
    .eq('user_id', user.id)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  // Si on a des snapshots, les utiliser directement
  if (snapshots && snapshots.length >= 2) {
    const points = snapshots.map((s: any) => ({
      t: new Date(s.date).getTime(),
      value: s.total_value,
    }))

    // Ajouter la valeur actuelle (live) comme dernier point
    const liveValue = await getLiveValue(supabase, user.id)
    if (liveValue > 0) {
      const now = Date.now()
      // Remplacer le dernier point si c'est aujourd'hui, sinon ajouter
      const lastSnap = points[points.length - 1]
      const todayStr = new Date().toISOString().split('T')[0]
      const lastSnapDate = new Date(lastSnap.t).toISOString().split('T')[0]
      if (lastSnapDate === todayStr) {
        points[points.length - 1] = { t: now, value: liveValue }
      } else {
        points.push({ t: now, value: liveValue })
      }
    }

    return NextResponse.json({ points, source: 'snapshots' })
  }

  // Fallback : valeur actuelle seulement (pas assez de snapshots)
  const liveValue = await getLiveValue(supabase, user.id)
  if (liveValue > 0) {
    return NextResponse.json({
      points: [{ t: Date.now(), value: liveValue }],
      source: 'live',
      message: 'Pas encore assez de données historiques. Le graphique se remplira avec le temps.',
    })
  }

  return NextResponse.json({ points: [] })
}

async function getLiveValue(supabase: any, userId: string): Promise<number> {
  try {
    const [{ data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)').eq('user_id', userId),
      supabase.from('accounts').select('*, bank:banks(*)').eq('user_id', userId),
    ])

    // Transactions paginées
    const allTx: any[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('transactions').select('*').eq('user_id', userId)
        .range(from, from + 999)
      if (!page || page.length === 0) break
      allTx.push(...page)
      if (page.length < 1000) break
      from += 1000
    }

    const positions = buildPositions(allTx, assets ?? [], accounts ?? [])
    const summary = buildPortfolioSummary(positions)
    return summary.total_value
  } catch {
    return 0
  }
}
