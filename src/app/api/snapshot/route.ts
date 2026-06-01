import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildPositions, buildPortfolioSummary } from '@/lib/portfolio'

async function takeSnapshot(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: transactions }, { data: assets }, { data: accounts }] = await Promise.all([
    supabase.from('transactions').select('*, asset:assets(*, prices(*))').eq('user_id', userId),
    supabase.from('assets').select('*, prices(*)').eq('user_id', userId),
    supabase.from('accounts').select('*').eq('user_id', userId),
  ])

  if (!transactions || !assets || !accounts) return null

  const positions = buildPositions(transactions as any, assets as any, accounts as any)
  const summary = buildPortfolioSummary(positions)

  await supabase.from('snapshots').upsert({
    user_id: userId,
    date: today,
    total_value: summary.total_value,
    total_invested: summary.total_invested,
  }, { onConflict: 'user_id,date' })

  return { date: today, total_value: summary.total_value }
}

// Appelé par Vercel Cron (GET avec Authorization: Bearer <CRON_SECRET>)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: users } = await supabase.from('profiles').select('id')

  if (!users?.length) return NextResponse.json({ snapshots: 0 })

  const results = await Promise.all(users.map(u => takeSnapshot(supabase, u.id)))
  return NextResponse.json({ snapshots: results.filter(Boolean).length })
}

// Appelé manuellement depuis l'app (POST avec session utilisateur)
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const serviceClient = createServiceClient()
  const result = await takeSnapshot(serviceClient, user.id)
  if (!result) return NextResponse.json({ error: 'Données manquantes' }, { status: 500 })

  return NextResponse.json({ success: true, ...result })
}
