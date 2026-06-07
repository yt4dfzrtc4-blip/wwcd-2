'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, X, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function ObligationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [asset, setAsset] = useState<any>(null)
  const [coupons, setCoupons] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [editCoupon, setEditCoupon] = useState<any>(null)
  const [mobile, setMobile] = useState(false)
  const [editNominal, setEditNominal] = useState(false)
  const [newNominal, setNewNominal] = useState('')
  const [editAvgPrice, setEditAvgPrice] = useState(false)
  const [newAvgPrice, setNewAvgPrice] = useState('')

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: ast }, { data: txs }, { data: accs }] = await Promise.all([
      supabase.from('assets').select('*').eq('id', id).single(),
      supabase.from('transactions').select('*, account:accounts(name)')
        .eq('asset_id', id).in('type', ['coupon', 'interets'])
        .order('date', { ascending: false }),
      supabase.from('accounts').select('*').order('name'),
    ])
    if (ast) {
      setAsset(ast)
      setNewNominal(ast.obligation_nominal?.toString() ?? '0')
      setNewAvgPrice(ast.obligation_avg_price?.toString() ?? '100')
    }
    setCoupons(txs ?? [])
    setAccounts(accs ?? [])
  }

  async function saveNominal() {
    await supabase.from('assets').update({ obligation_nominal: parseFloat(newNominal) || 0 }).eq('id', id)
    setEditNominal(false); loadData()
  }

  async function saveAvgPrice() {
    await supabase.from('assets').update({ obligation_avg_price: parseFloat(newAvgPrice) || 100 }).eq('id', id)
    setEditAvgPrice(false); loadData()
  }

  async function deleteCoupon(txId: string) {
    if (!confirm('Supprimer ce coupon ?')) return
    await supabase.from('transactions').delete().eq('id', txId)
    loadData()
  }

  if (!asset) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  const nominal = asset.obligation_nominal ?? 0
  const avgPricePct = asset.obligation_avg_price ?? 100
  const coupon = asset.obligation_coupon ?? 0
  const freq = asset.obligation_frequency ?? 'annuelle'
  const maturityStr = asset.obligation_maturity
  const maturity = maturityStr ? new Date(maturityStr) : null
  const today = new Date()

  const capitalInvesti = nominal * avgPricePct / 100
  const couponAnnuel = nominal * (coupon / 100)
  const freqDiv = freq === 'semestrielle' ? 2 : freq === 'trimestrielle' ? 4 : 1
  const couponPeriode = couponAnnuel / freqDiv
  const couponsPercus = coupons.reduce((s: number, t: any) => s + t.quantity * t.price, 0)
  const pvLatente = nominal - capitalInvesti
  const pvPct = capitalInvesti > 0 ? (pvLatente / capitalInvesti) * 100 : 0
  const joursRestants = maturity ? Math.max(0, differenceInDays(maturity, today)) : null
  const anneeRestantes = joursRestants ? joursRestants / 365 : 0
  const ytm = capitalInvesti > 0 && anneeRestantes > 0
    ? ((couponAnnuel + (nominal - capitalInvesti) / anneeRestantes) / ((nominal + capitalInvesti) / 2)) * 100
    : 0

  const fmt = (v: number, d = 2) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: d })
  const freqLabel: Record<string, string> = { annuelle: 'annuel', semestrielle: 'semestriel', trimestrielle: 'trimestriel' }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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

        {/* Position */}
        <div style={card}>
          <p style={{ ...lbl, marginBottom: 12 }}>Ma position</p>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>

            <div>
              <p style={lbl}>Nominal détenu (€)</p>
              {editNominal ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input type="number" step="1" value={newNominal} onChange={e => setNewNominal(e.target.value)}
                    style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <button onClick={saveNominal} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditNominal(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(nominal, 0)}</p>
                  <button onClick={() => setEditNominal(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>

            <div>
              <p style={lbl}>Prix d&apos;achat moy. (%)</p>
              {editAvgPrice ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input type="number" step="0.01" value={newAvgPrice} onChange={e => setNewAvgPrice(e.target.value)}
                    style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <span style={{ fontSize: 13 }}>%</span>
                  <button onClick={saveAvgPrice} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditAvgPrice(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500 }}>{avgPricePct.toFixed(2)} %</p>
                  <button onClick={() => setEditAvgPrice(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>

            <div>
              <p style={lbl}>Capital investi</p>
              <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, marginTop: 4, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(capitalInvesti, 0)}</p>
            </div>

            <div>
              <p style={lbl}>PV latente (vs pair)</p>
              <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, marginTop: 4, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(7px)' : 'none' }}>
                {pvLatente >= 0 ? '+' : ''}{fmt(pvLatente, 0)}
              </p>
              <p style={{ fontSize: 11, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>{pvPct >= 0 ? '+' : ''}{pvPct.toFixed(2)} %</p>
            </div>
          </div>
        </div>

        {/* Caractéristiques */}
        <div style={card}>
          <p style={{ ...lbl, marginBottom: 12 }}>Caractéristiques</p>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
            {[
              ['Taux coupon', coupon ? `${coupon} %` : '–'],
              [`Coupon ${freqLabel[freq] ?? 'annuel'}`, couponPeriode ? fmt(couponPeriode) : '–'],
              ['Fréquence', freq.charAt(0).toUpperCase() + freq.slice(1)],
              ['Coupon annuel total', couponAnnuel ? fmt(couponAnnuel) : '–'],
              ['Rendement actuariel (YTM)', ytm ? `${ytm.toFixed(2)} %` : '–'],
              ['Échéance', maturity ? format(maturity, 'd MMMM yyyy', { locale: fr }) : '–'],
              ['Jours restants', joursRestants !== null ? `${joursRestants} j` : '–'],
              ['Coupons perçus total', fmt(couponsPercus)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {maturity && nominal > 0 && (() => {
            const start = new Date(asset.created_at)
            const total = Math.max(1, differenceInDays(maturity, start))
            const elapsed = differenceInDays(today, start)
            const pct = Math.min(100, Math.max(0, (elapsed / total) * 100))
            return (
              <div style={{ marginTop: 14 }}>
                <div style={{ width: '100%', height: 5, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                  <span>{format(start, 'd MMM yyyy', { locale: fr })}</span>
                  <span>{format(maturity, 'd MMM yyyy', { locale: fr })}</span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Bouton coupon */}
        <button onClick={() => { setEditCoupon(null); setShowCouponModal(true) }} style={{
          padding: '11px', borderRadius: 8, border: '0.5px solid #EF9F27',
          background: 'transparent', color: '#EF9F27', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}>
          + Enregistrer un coupon reçu
        </button>

        {/* Coupons */}
        {coupons.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={lbl}>Coupons reçus — {fmt(couponsPercus, 0)} total</p>
            </div>
            {coupons.map((tx: any) => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500 }}>Coupon{tx.notes ? ` — ${tx.notes}` : ''}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.account?.name ?? '–'}</p>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                <p style={{ fontWeight: 500, color: '#EF9F27', filter: privacy ? 'blur(5px)' : 'none' }}>+{fmt(tx.quantity * tx.price)}</p>
                <button onClick={() => { setEditCoupon(tx); setShowCouponModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => deleteCoupon(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>
          💡 Modifiez le <strong>nominal détenu</strong> et le <strong>prix d&apos;achat moyen</strong> directement ici. Pour un coupon reçu, utilisez le bouton orange ci-dessus.
        </div>
      </main>

      {showCouponModal && (
        <CouponModal
          assetId={id}
          accounts={accounts}
          editTx={editCoupon}
          onClose={() => { setShowCouponModal(false); setEditCoupon(null) }}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function CouponModal({ assetId, accounts, editTx, onClose, onSuccess }: {
  assetId: string
  accounts: any[]
  editTx?: any
  onClose: () => void
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [amount, setAmount] = useState(editTx ? (editTx.quantity * editTx.price).toString() : '')
  const [date, setDate] = useState(editTx?.date ?? new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState(editTx?.notes ?? '')
  const [accountId, setAccountId] = useState(editTx?.account_id ?? accounts[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, asset_id: assetId, account_id: accountId,
      type: 'interets', quantity: 1, price: parseFloat(amount),
      date, notes: notes || null,
    }
    if (editTx?.id) {
      await supabase.from('transactions').update(payload).eq('id', editTx.id)
    } else {
      await supabase.from('transactions').insert(payload)
    }
    onSuccess(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 380, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#EF9F27' }}>{editTx ? 'Modifier le coupon' : 'Coupon reçu'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl2}>Compte</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} required style={inp}>
              <option value="">Sélectionner un compte</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl2}>Montant reçu (€)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" style={inp} autoFocus />
          </div>
          <div>
            <label style={lbl2}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          <div>
            <label style={lbl2}>Note (optionnel)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex : coupon S1 2025" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 10, borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: 10, borderRadius: 7, border: 'none', background: '#EF9F27', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
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
