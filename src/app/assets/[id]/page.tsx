'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculatePosition, formatEur, formatPct } from '@/lib/portfolio'
import type { Asset, Transaction, Account } from '@/types'
import Topbar from '@/components/layout/Topbar'
import TransactionModal from '@/components/ui/TransactionModal'
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [privacy, setPrivacy] = useState(false)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editTx, setEditTx] = useState<any>(null)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadData() {
    const [{ data: ast }, { data: txs }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)').eq('id', id).single(),
      supabase.from('transactions').select('*, account:accounts(*)').eq('asset_id', id).order('date', { ascending: false }),
    ])
    setAsset(ast as any)
    setTransactions((txs ?? []) as Transaction[])
    if (txs?.[0]) setAccount((txs[0] as any).account)
  }

  useEffect(() => { loadData() }, [id])

  async function deleteTx(txId: string) {
    if (!confirm('Supprimer cette transaction ?')) return
    await supabase.from('transactions').delete().eq('id', txId)
    loadData()
  }

  if (!asset) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>
        Chargement…
      </div>
    </div>
  )

  const { quantity, averagePrice, investedValue } = calculatePosition(transactions)
  const currentPrice = (asset as any).prices?.price ?? averagePrice
  const currentValue = quantity * currentPrice
  const pnl = currentValue - investedValue
  const pnlPct = investedValue > 0 ? (pnl / investedValue) * 100 : 0
  const dayChangePct = (asset as any).prices?.change_pct ?? 0
  const dayChange = currentValue * (dayChangePct / 100)

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>

        {/* Retour + titre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>{asset.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {asset.isin && <span style={{ fontFamily: 'var(--font-mono)' }}>{asset.isin} · </span>}
              {account?.name}
            </p>
          </div>
          <span className={`badge badge-${asset.category}`} style={{ fontSize: 11, padding: '3px 10px' }}>
            {asset.category.toUpperCase()}
          </span>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Valeur actuelle', value: formatEur(currentValue), sub: `${quantity.toFixed(4)} parts · ${formatEur(currentPrice)}/u` },
            { label: 'Plus-value latente', value: formatEur(pnl), sub: formatPct(pnlPct), color: pnl >= 0 },
            { label: 'Variation du jour', value: formatEur(dayChange), sub: formatPct(dayChangePct), color: dayChange >= 0 },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>{label}</p>
              <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{value}</p>
              {sub && <p style={{ fontSize: 11, marginTop: 4, color: color === undefined ? 'var(--muted)' : color ? 'var(--green)' : 'var(--red)' }}>{sub}</p>}
            </div>
          ))}
        </div>

        {/* Simulation obligation */}
        {asset.category === 'obligation' && (() => {
          const coupon = (asset as any).obligation_coupon ?? 0
          const nominal = (asset as any).obligation_nominal ?? 0
          const frequency = (asset as any).obligation_frequency ?? 'annuelle'
          const maturityStr = (asset as any).obligation_maturity
          const maturity = maturityStr ? new Date(maturityStr) : null
          const today = new Date()
          const joursRestants = maturity ? Math.max(0, Math.floor((maturity.getTime() - today.getTime()) / 86400000)) : null
          const couponAnnuel = nominal * (coupon / 100)
          const freqMap: Record<string, string> = { annuelle: 'an', semestrielle: '6 mois', trimestrielle: '3 mois' }
          const couponPeriode = frequency === 'semestrielle' ? couponAnnuel / 2 : frequency === 'trimestrielle' ? couponAnnuel / 4 : couponAnnuel

          return (
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Simulation obligation
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
                {[
                  ['Nominal', nominal ? formatEur(nominal) : '–'],
                  ['Taux coupon', coupon ? `${coupon} %` : '–'],
                  [`Coupon / ${freqMap[frequency] ?? 'an'}`, couponPeriode ? formatEur(couponPeriode) : '–'],
                  ['Fréquence', frequency.charAt(0).toUpperCase() + frequency.slice(1)],
                  ['Échéance', maturityStr ? new Date(maturityStr).toLocaleDateString('fr-FR') : '–'],
                  ['Jours restants', joursRestants !== null ? `${joursRestants} j` : '–'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Fiche */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Fiche position
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            {[
              ['PRU moyen', formatEur(averagePrice)],
              ['Capital investi', formatEur(investedValue)],
              ['Quantité', quantity.toFixed(6)],
              ['Cours actuel', formatEur(currentPrice)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500, filter: privacy && k !== 'PRU moyen' && k !== 'Cours actuel' && k !== 'Quantité' ? 'blur(5px)' : 'none' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Historique ({transactions.length})
            </p>
            <button
              onClick={() => { setEditTx(null); setShowModal(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>

          {transactions.map(tx => (
            <div key={tx.id} style={{
              display: 'grid', gridTemplateColumns: '90px 60px 1fr 1fr 60px',
              gap: 8, padding: '8px 10px', borderRadius: 7, fontSize: 12, alignItems: 'center',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--muted)' }}>{format(parseISO(tx.date), 'd MMM yy', { locale: fr })}</span>
              <span style={{ color: tx.type === 'achat' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                {tx.type === 'achat' ? 'Achat' : 'Vente'}
              </span>
              <span style={{ filter: privacy ? 'blur(5px)' : 'none' }}>{tx.quantity.toFixed(4)} u.</span>
              <span style={{ filter: privacy ? 'blur(5px)' : 'none' }}>{formatEur(tx.price)} /u.</span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditTx(tx); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => deleteTx(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showModal && (
        <TransactionModal
          onClose={() => { setShowModal(false); setEditTx(null) }}
          onSuccess={loadData}
          editTransaction={editTx}
        />
      )}
    </div>
  )
}
