import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPositions, buildPortfolioSummary } from '@/lib/portfolio'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  // Récupérer transactions, actifs, comptes
  const [{ data: transactions }, { data: assets }, { data: accounts }] = await Promise.all([
    supabase.from('transactions').select('*, asset:assets(*, prices(*))').eq('user_id', user.id),
    supabase.from('assets').select('*, prices(*)').eq('user_id', user.id),
    supabase.from('accounts').select('*').eq('user_id', user.id),
  ])

  if (!transactions || !assets || !accounts) {
    return NextResponse.json({ error: 'Données manquantes' }, { status: 500 })
  }

  const positions = buildPositions(transactions as any, assets as any, accounts as any)
  const summary = buildPortfolioSummary(positions)

  await supabase.from('snapshots').upsert({
    user_id: user.id,
    date: today,
    total_value: summary.total_value,
    total_invested: summary.total_invested,
  }, { onConflict: 'user_id,date' })

  return NextResponse.json({ success: true, date: today, total_value: summary.total_value })
}
