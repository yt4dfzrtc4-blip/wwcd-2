'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import PriceChart from '@/components/charts/PriceChart'
import { ArrowLeft, X, Plus } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

type TxType = 'achat' | 'vente' | 'remboursement' | 'coupon'

interface Asset {
  id: string; name: string; isin?: string; ticker?: string
  obligation_coupon?: number; obligation_frequency?: string
  obligation_maturity?: string; obligation_nominal?: number
}

interface Transaction {
  id: string; type: TxType; quantity: number; price: number; date: string; notes?: string
}

export default function ObligationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<TxType>('achat')
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: ast }, { data: txs }] = await Promise.all([
      supabase.from('assets').select('*').eq('id', id).single(),
      supabase.from('transactions').select('*').eq('asset_id', id).order('date', { ascending: false }),
    ])
    if (ast) setAsset(ast as Asset)
    setTransactions((txs ?? []) as Transaction[])
  }

  if (!asset) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  // Calculs
  const achats = transactions.filter(t => t.type === 'achat')
  const ventes = transactions.filter(t => t.type === 'vente')
  const rembours = transactions.filter(t => t.type === 'remboursement')
  const coupons = transactions.filter(t => t.type === 'coupon')

  const qtyAchetee = achats.reduce((s, t) => s + t.quantity, 0)
  const qtyVendue = ventes.reduce((s, t) => s + t.quantity, 0) + rembours.reduce((s, t) => s + t.quantity, 0)
  const qty = Math.max(0, qtyAchetee - qtyVendue)

  const capitalInvesti = achats.reduce((s, t) => s + t.quantity * t.price, 0)
    - ventes.reduce((s, t) => s + t.quantity * t.price, 0)

  const couponsPercus = coupons.reduce((s, t) => s + t.quantity * t.price, 0)

  const nominal = asset.obligation_nominal ?? 0
  const taux = asset.obligation_coupon ?? 0
  const freq = asset.obligation_frequency ?? 'annuelle'
  const maturityStr = asset.obligation_maturity
  const maturity = maturityStr ? new Date(maturityStr) : null
  const today = new Date()
  const joursRestants = maturity ? Math.max(0, differenceInDays(maturity, today)) : null

  const couponAnnuel = nominal * qty * (taux / 100)
  const freqDiv = freq === 'semestrielle' ? 2 : freq === 'trimestrielle' ? 4 : 1
  const couponPeriode = couponAnnuel / freqDiv
  const freqLabel: Record<string, string> = { annuelle: 'Annuelle', semestrielle: 'Semestrielle', trimestrielle: 'Trimestrielle' }

  // Valeur nominale totale restante
  const valeurNominale = nominal * qty

  const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
  const fmtK = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  const typeConfig: Record<TxType, { label: string; color: string }> = {
    achat:         { label: 'Achat', color: 'var(--brand)' },
    vente:         { label: 'Vente', color: '#E24B4A' },
    remboursement: { label: 'Remboursement', color: '#1D9E75' },
    coupon:        { label: 'Coupon reçu', color: '#EF9F27' },
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Titre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>{asset.name}</h1>
            {asset.isin && <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{asset.isin}</p>}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: '#FAECE7', color: '#712B13' }}>Obligation</span>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Capital investi', value: fmtK(capitalInvesti), blur: true },
            { label: 'Valeur nominale', value: fmtK(valeurNominale), blur: true },
            { label: 'Coupon annuel', value: fmt(couponAnnuel), blur: true },
            { label: 'Coupons perçus', value: fmt(couponsPercus), color: '#1D9E75', blur: true },
          ].map(k => (
            <div key={k.label} style={card}>
              <p style={lbl}>{k.label}</p>
              <p style={{ fontSize: mobile ? 16 : 18, fontWeight: 500, color: k.color ?? 'var(--text)', filter: privacy && k.blur ? 'blur(7px)' : 'none' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Fiche */}
        <div style={card}>
          <p style={{ ...lbl, marginBottom: 12 }}>Caractéristiques</p>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
            {[
              ['Nominal / titre', nominal ? fmt(nominal) : '–'],
              ['Quantité détenue', qty.toString()],
              ['Taux coupon', taux ? `${taux} %` : '–'],
              ['Fréquence', freqLabel[freq] ?? freq],
              [`Coupon / ${freq === 'semestrielle' ? 'semestre' : freq === 'trimestrielle' ? 'trimestre' : 'an'}`, couponAnnuel ? fmt(couponPeriode) : '–'],
              ['Échéance', maturity ? format(maturity, 'd MMMM yyyy', { locale: fr }) : '–'],
              ['Jours restants', joursRestants !== null ? `${joursRestants} j` : '–'],
              ['Taux de rendement', taux && capitalInvesti ? `${((couponAnnuel / capitalInvesti) * 100).toFixed(2)} %` : '–'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Barre échéance */}
          {maturity && achats.length > 0 && (() => {
            const openDate = new Date(achats[achats.length - 1].date)
            const total = differenceInDays(maturity, openDate)
            const elapsed = differenceInDays(today, openDate)
            const pct = Math.min(100, Math.max(0, (elapsed / total) * 100))
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ width: '100%', height: 5, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                  <span>{format(openDate, 'd MMM yyyy', { locale: fr })}</span>
                  <span>{format(maturity, 'd MMM yyyy', { locale: fr })}</span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Graphique */}
        {asset.ticker && (
          <div style={card}>
            <p style={{ ...lbl, marginBottom: 12 }}>Évolution du cours</p>
            <PriceChart ticker={asset.ticker} hidden={privacy} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(['achat', 'coupon', 'remboursement', 'vente'] as TxType[]).map(t => (
            <button key={t} onClick={() => { setModalType(t); setShowModal(true) }} style={{
              padding: '10px', borderRadius: 8, border: `0.5px solid ${typeConfig[t].color}`,
              background: 'transparent', color: typeConfig[t].color,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Plus size={14} /> {typeConfig[t].label}
            </button>
          ))}
        </div>

        {/* Coupons reçus */}
        {coupons.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={lbl}>Coupons reçus ({coupons.length})</p>
            </div>
            {coupons.map(tx => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500 }}>Coupon</p>
                  {tx.notes && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.notes}</p>}
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                <p style={{ fontWeight: 500, color: '#EF9F27', filter: privacy ? 'blur(5px)' : 'none' }}>+{fmt(tx.quantity * tx.price)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Historique transactions */}
        {transactions.filter(t => t.type !== 'coupon').length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={lbl}>Historique des transactions</p>
            </div>
            {transactions.filter(t => t.type !== 'coupon').map(tx => {
              const cfg = typeConfig[tx.type]
              return (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500 }}>{cfg.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.quantity} titre{tx.quantity > 1 ? 's' : ''} × {fmt(tx.price)}</p>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                  <p style={{ fontWeight: 500, color: cfg.color, filter: privacy ? 'blur(5px)' : 'none' }}>
                    {tx.type === 'vente' || tx.type === 'remboursement' ? '-' : '+'}{fmt(tx.quantity * tx.price)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showModal && (
        <ObligationModal
          type={modalType}
          assetId={id}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function ObligationModal({ type, assetId, onClose, onSuccess }: {
  type: TxType; assetId: string; onClose: () => void; onSuccess: () => void
}) {
  const supabase = createClient()
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const isCoupon = type === 'coupon'
  const typeConfig: Record<TxType, { label: string; color: string }> = {
    achat:         { label: 'Enregistrer un achat', color: 'var(--brand)' },
    vente:         { label: 'Enregistrer une vente', color: '#E24B4A' },
    remboursement: { label: 'Remboursement à l\'échéance', color: '#1D9E75' },
    coupon:        { label: 'Coupon reçu', color: '#EF9F27' },
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Trouver un account_id valide
    const { data: txs } = await supabase.from('transactions').select('account_id').eq('asset_id', assetId).limit(1)
    const accountId = txs?.[0]?.account_id
    if (!accountId) { alert('Ajoutez d\'abord un achat pour associer un compte.'); setLoading(false); return }

    await supabase.from('transactions').insert({
      user_id: user.id,
      asset_id: assetId,
      account_id: accountId,
      type,
      quantity: isCoupon ? 1 : parseFloat(qty),
      price: parseFloat(price),
      date,
      notes: notes || null,
    })
    onSuccess(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: typeConfig[type].color }}>{typeConfig[type].label}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isCoupon && (
            <div>
              <label style={lbl2}>Quantité (titres)</label>
              <input type="number" step="1" min="1" value={qty} onChange={e => setQty(e.target.value)} required style={inp} />
            </div>
          )}
          <div>
            <label style={lbl2}>{isCoupon ? 'Montant reçu (€)' : 'Prix par titre (€)'}</label>
            <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} required placeholder="0.00" style={inp} autoFocus />
          </div>
          <div>
            <label style={lbl2}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          <div>
            <label style={lbl2}>Note (optionnel)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex : coupon Q2 2025" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 10, borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: 10, borderRadius: 7, border: 'none', background: typeConfig[type].color, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const lbl2: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }
