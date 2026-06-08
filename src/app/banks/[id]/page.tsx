'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import { buildPositions, formatEur } from '@/lib/portfolio'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, ChevronRight } from 'lucide-react'

export default function BankPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [bank, setBank] = useState<any>(null)
  const [accountData, setAccountData] = useState<{ id: string; name: string; type: string; value: number }[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadData = useCallback(async () => {
    const [{ data: bk }, { data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('banks').select('*').eq('id', id).single(),
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*, bank:banks(*)'),
    ])
    if (!bk) return
    setBank(bk)

    // Toutes transactions en pagination
    const allTx: any[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('transactions')
        .select('*, asset:assets(*, prices(*)), account:accounts(*, bank:banks(*))')
        .range(from, from + 999)
      if (!page || page.length === 0) break
      allTx.push(...page)
      if (page.length < 1000) break
      from += 1000
    }

    const allPositions = buildPositions(allTx, assets ?? [], accounts ?? [])

    // Grouper par compte pour cette banque
    const bankAccounts = (accounts ?? []).filter((a: any) => a.bank_id === id)
    const accountMap: Record<string, { id: string; name: string; type: string; value: number }> = {}
    for (const acc of bankAccounts) {
      accountMap[acc.id] = { id: acc.id, name: acc.name, type: acc.type, value: 0 }
    }
    for (const pos of allPositions) {
      const accId = pos.account.id
      if (accountMap[accId]) accountMap[accId].value += pos.current_value
    }

    const list = Object.values(accountMap).sort((a, b) => b.value - a.value)
    setAccountData(list)
    setTotalValue(list.reduce((s, a) => s + a.value, 0))
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={loadData} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={loadData} />
      <main style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>{bank?.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>{accountData.length} compte{accountData.length > 1 ? 's' : ''}</p>
          </div>
          <p style={{ fontSize: 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{formatEur(totalValue, 0)}</p>
        </div>

        {/* Liste des comptes */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
            <p style={lbl}>Comptes</p>
          </div>
          {accountData.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun compte pour cette banque</div>
          ) : accountData.map(acc => {
            const weight = totalValue > 0 ? (acc.value / totalValue) * 100 : 0
            return (
              <div key={acc.id}
                onClick={() => router.push(`/accounts/${acc.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: '0.5px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500 }}>{acc.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{acc.type.toUpperCase()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{formatEur(acc.value, 0)}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{weight.toFixed(1)} %</p>
                </div>
                <div style={{ width: 80, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${weight}%`, height: '100%', background: 'var(--brand)', borderRadius: 2 }} />
                </div>
                <ChevronRight size={14} color="var(--muted)" />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }
