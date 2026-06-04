'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import PriceChart from '@/components/charts/PriceChart'
import { ArrowLeft, X, Plus, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO, differenceInDays, addMonths, addYears, addQuarters } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Asset {
  id: string; name: string; isin?: string; ticker?: string
  obligation_coupon?: number; obligation_frequency?: string
  obligation_maturity?: string; obligation_nominal?: number
}

interface Transaction {
  id: string; type: string; quantity: number; price: number; date: string; notes?: string; account_id: string
}

export default function ObligationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'achat' | 'coupon' | 'remboursement'>('achat')
  const [editTx, setEditTx] = useState<Transaction | null>(null)
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
      supabase.from('transactions').select('*').eq('asset_id', id).order('date', { ascending: true }),
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

  // Données de l'obligation
  const nominal = asset.obligation_nominal ?? 1000
  const taux = asset.obligation_coupon ?? 0
  const freq = asset.obligation_frequency ?? 'annuelle'
  const maturityStr = asset.obligation_maturity
  const maturity = maturityStr ? new Date(maturityStr) : null
  const today = new Date()

  // Transactions
  // Achat : quantity = nominal acheté, price = taux d'achat (ex: 0.98 pour 98%)
  // Coupon : quantity = 1, price = montant du coupon
  // Remboursement : quantity = nominal remboursé, price = 1 (100%)
  const achats = transactions.filter(t => t.type === 'achat')
  const coupons = transactions.filter(t => t.type === 'interets' || t.type === 'coupon')
  const rembours = transactions.filter(t => t.type === 'vente' || t.type === 'remboursement')

  const nominalAcheté = achats.reduce((s, t) => s + t.quantity, 0)
  const nominalRemboursé = rembours.reduce((s, t) => s + t.quantity, 0)
  const nominalDetenu = Math.max(0, nominalAcheté - nominalRemboursé)

  // Coût réel = nominal × prix d'achat
  const capitalVersé = achats.reduce((s, t) => s + t.quantity * t.price, 0)
  const couponsPercus = coupons.reduce((s, t) => s + t.quantity * t.price, 0)
  const remboursementsReçus = rembours.reduce((s, t) => s + t.quantity * t.price, 0)

  // PV latente = nominal détenu - capital versé + remboursements reçus
  const pvLatente = nominalDetenu + remboursementsReçus - capitalVersé
  const pvPct = capitalVersé > 0 ? (pvLatente / capitalVersé) * 100 : 0

  // Coupon annuel estimé
  const couponAnnuel = nominalDetenu * (taux / 100)
  const freqDiv = freq === 'semestrielle' ? 2 : freq === 'trimestrielle' ? 4 : 1
  const couponPeriode = couponAnnuel / freqDiv
  const freqLabel: Record<string, string> = { annuelle: 'annuel', semestrielle: 'semestriel', trimestrielle: 'trimestriel' }

  // Jours restants
  const joursRestants = maturity ? Math.max(0, differenceInDays(maturity, today)) : null

  // Rendement actuariel approximatif (YTM simplifié)
  const anneeRestantes = joursRestants ? joursRestants / 365 : 0
  const ytm = capitalVersé > 0 && anneeRestantes > 0
    ? ((couponAnnuel + (nominalDetenu - capitalVersé) / anneeRestantes) / ((nominalDetenu + capitalVersé) / 2)) * 100
    : 0

  // Prochains coupons estimés
  const prochainsCoupons: { date: Date; montant: number }[] = []
  if (maturity && nominalDetenu > 0 && taux > 0) {
    let next = new Date(today)
    // Trouver la prochaine date de coupon approximative
    const monthsPerPeriod = freq === 'semestrielle' ? 6 : freq === 'trimestrielle' ? 3 : 12
    next.setDate(maturity.getDate())
    next.setMonth(maturity.getMonth())
    while (next <= today) next = addMonths(next, monthsPerPeriod)
    let count = 0
    while (next <= maturity && count < 10) {
      prochainsCoupons.push({ date: new Date(next), montant: couponPeriode })
      next = addMonths(next, monthsPerPeriod)
      count++
    }
  }

  const fmt = (v: number, d = 2) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: d })
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} %`

  const firstAccountId = transactions.find(t => t.account_id)?.account_id ?? null

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
          <div style={card}>
            <p style={lbl}>Nominal détenu</p>
            <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(nominalDetenu, 0)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>Capital versé</p>
            <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(capitalVersé, 0)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {capitalVersé > 0 ? `${((capitalVersé / nominalAcheté) * 100).toFixed(2)} % du nominal` : '–'}
            </p>
          </div>
          <div style={card}>
            <p style={lbl}>PV latente</p>
            <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(7px)' : 'none' }}>
              {pvLatente >= 0 ? '+' : ''}{fmt(pvLatente, 0)}
            </p>
            <p style={{ fontSize: 11, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>{fmtPct(pvPct)}</p>
          </div>
          <div style={card}>
            <p style={lbl}>Coupons perçus</p>
            <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(couponsPercus, 0)}</p>
          </div>
        </div>

        {/* Fiche */}
        <div style={card}>
          <p style={{ ...lbl, marginBottom: 12 }}>Caractéristiques</p>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
            {[
              ['Taux coupon', taux ? `${taux} %` : '–'],
              [`Coupon ${freqLabel[freq] ?? 'annuel'}`, couponAnnuel ? fmt(couponPeriode) : '–'],
              ['Fréquence', freq.charAt(0).toUpperCase() + freq.slice(1)],
              ['Coupon annuel total', couponAnnuel ? fmt(couponAnnuel) : '–'],
              ['Rendement actuariel (YTM)', ytm ? `${ytm.toFixed(2)} %` : '–'],
              ['Échéance', maturity ? format(maturity, 'd MMMM yyyy', { locale: fr }) : '–'],
              ['Jours restants', joursRestants !== null ? `${joursRestants} j` : '–'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Barre de progression */}
          {maturity && achats.length > 0 && (() => {
            const openDate = new Date(achats[0].date)
            const total = Math.max(1, differenceInDays(maturity, openDate))
            const elapsed = differenceInDays(today, openDate)
            const pct = Math.min(100, Math.max(0, (elapsed / total) * 100))
            return (
              <div style={{ marginTop: 14 }}>
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

        {/* Prochains coupons */}
        {prochainsCoupons.length > 0 && (
          <div style={card}>
            <p style={{ ...lbl, marginBottom: 12 }}>Prochains coupons estimés</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prochainsCoupons.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{format(c.date, 'd MMM yyyy', { locale: fr })}</span>
                  <span style={{ fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(5px)' : 'none' }}>{fmt(c.montant)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '0.5px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Total restant</span>
                <span style={{ fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(5px)' : 'none' }}>
                  {fmt(prochainsCoupons.reduce((s, c) => s + c.montant, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Graphique */}
        {asset.ticker && (
          <div style={card}>
            <p style={{ ...lbl, marginBottom: 12 }}>Évolution du cours</p>
            <PriceChart ticker={asset.ticker} hidden={privacy} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {([
            { key: 'achat' as const, label: '+ Achat', color: 'var(--brand)' },
            { key: 'coupon' as const, label: '+ Coupon reçu', color: '#EF9F27' },
            { key: 'remboursement' as const, label: '✓ Remboursement', color: 'var(--green)' },
          ]).map(t => (
            <button key={t.key} onClick={() => { setModalType(t.key); setShowModal(true) }} style={{
              padding: '10px 8px', borderRadius: 8, border: `0.5px solid ${t.color}`,
              background: 'transparent', color: t.color, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Coupons reçus */}
        {coupons.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={lbl}>Coupons reçus — {fmt(couponsPercus, 0)} total</p>
            </div>
            {[...coupons].reverse().map(tx => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />
                <p style={{ flex: 1, color: 'var(--muted)' }}>Coupon{tx.notes ? ` — ${tx.notes}` : ''}</p>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                <p style={{ fontWeight: 500, color: '#EF9F27', filter: privacy ? 'blur(5px)' : 'none' }}>+{fmt(tx.quantity * tx.price)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Historique achats / remboursements */}
        {[...achats, ...rembours].length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={lbl}>Achats & Remboursements</p>
            </div>
            {[...achats, ...rembours].sort((a, b) => b.date.localeCompare(a.date)).map(tx => {
              const isAchat = tx.type === 'achat'
              const montant = tx.quantity * tx.price
              return (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isAchat ? 'var(--brand)' : 'var(--green)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500 }}>{isAchat ? 'Achat' : 'Remboursement'}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {isAchat
                        ? `${fmt(tx.quantity, 0)} nominal × ${(tx.price * 100).toFixed(2)} %`
                        : `${fmt(tx.quantity, 0)} nominal remboursé`}
                    </p>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                  <p style={{ fontWeight: 500, color: isAchat ? 'var(--brand)' : 'var(--green)', filter: privacy ? 'blur(5px)' : 'none' }}>
                    {isAchat ? '-' : '+'}{fmt(montant, 0)}
                  </p>
                  <button onClick={() => { setEditTx(tx); setModalType(isAchat ? 'achat' : 'remboursement'); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={async () => { if (confirm('Supprimer cette transaction ?')) { await supabase.from('transactions').delete().eq('id', tx.id); loadData() } }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {achats.length === 0 && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#633806' }}>
            Commencez par enregistrer un <strong>achat</strong> pour initialiser cette obligation.
          </div>
        )}
      </main>

      {showModal && (
        <ObligationModal
          type={modalType}
          assetId={id}
          asset={asset}
          nominalDetenu={nominalDetenu}
          firstAccountId={firstAccountId}
          editTx={editTx}
          onClose={() => { setShowModal(false); setEditTx(null) }}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function ObligationModal({ type, assetId, asset, nominalDetenu, firstAccountId, editTx, onClose, onSuccess }: {
  type: 'achat' | 'coupon' | 'remboursement'
  assetId: string
  asset: Asset
  nominalDetenu: number
  firstAccountId: string | null
  editTx?: Transaction | null
  onClose: () => void
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [nominal, setNominal] = useState(
    editTx ? editTx.quantity.toString()
    : type === 'remboursement' ? nominalDetenu.toString()
    : ''
  )
  const [prixPct, setPrixPct] = useState(editTx ? (editTx.price * 100).toFixed(2) : '100')
  const [montantCoupon, setMontantCoupon] = useState(editTx ? (editTx.quantity * editTx.price).toString() : '')
  const [date, setDate] = useState(editTx?.date ?? new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState(editTx?.notes ?? '')
  const [accountId, setAccountId] = useState(editTx?.account_id ?? firstAccountId ?? '')
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState('EUR')
  const [fxRate, setFxRate] = useState(1)
  const [fxLoading, setFxLoading] = useState(false)

  useEffect(() => {
    if (currency === 'EUR') { setFxRate(1); return }
    setFxLoading(true)
    fetch(`/api/price-history?ticker=${currency}EUR%3DX&period=1j`)
      .then(r => r.json())
      .then(d => {
        const pts = d.points ?? []
        if (pts.length) setFxRate(pts[pts.length - 1].v)
      })
      .catch(() => {})
      .finally(() => setFxLoading(false))
  }, [currency])

  useEffect(() => {
    supabase.from('accounts').select('*').order('name').then(({ data }) => setAccounts(data ?? []))
  }, [])

  // Calcul automatique du coupon si on connaît le taux
  useEffect(() => {
    if (type === 'coupon' && asset.obligation_coupon && asset.obligation_nominal) {
      const freq = asset.obligation_frequency ?? 'annuelle'
      const div = freq === 'semestrielle' ? 2 : freq === 'trimestrielle' ? 4 : 1
      const coupon = (nominalDetenu || parseFloat(nominal)) * (asset.obligation_coupon / 100) / div
      if (coupon > 0) setMontantCoupon(coupon.toFixed(2))
    }
  }, [type, asset])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let payload: any
    if (type === 'achat') {
      const nominalEur = parseFloat(nominal) * fxRate  // converti en EUR
      const notesStr = currency !== 'EUR'
        ? `${nominal} ${currency} @ ${fxRate.toFixed(4)}${notes ? ' — ' + notes : ''}`
        : notes || null
      payload = {
        user_id: user.id, asset_id: assetId, account_id: accountId,
        type: 'achat',
        quantity: nominalEur,             // nominal en EUR
        price: parseFloat(prixPct) / 100, // prix en décimal (ex: 0.98)
        date, notes: notesStr,
      }
    } else if (type === 'coupon') {
      payload = {
        user_id: user.id, asset_id: assetId, account_id: accountId ?? firstAccountId,
        type: 'interets',
        quantity: 1,
        price: parseFloat(montantCoupon),
        date, notes: notes || null,
      }
    } else {
      // Remboursement
      payload = {
        user_id: user.id, asset_id: assetId, account_id: accountId ?? firstAccountId,
        type: 'vente',
        quantity: parseFloat(nominal),  // nominal remboursé
        price: 1.0,                     // 100%
        date, notes: notes || null,
      }
    }

    if (editTx?.id) {
      await supabase.from('transactions').update(payload).eq('id', editTx.id)
    } else {
      await supabase.from('transactions').insert(payload)
    }
    onSuccess(); onClose()
  }

  const config = {
    achat: { title: editTx ? 'Modifier l\'achat' : 'Achat d\'obligation', color: 'var(--brand)' },
    coupon: { title: editTx ? 'Modifier le coupon' : 'Coupon reçu', color: '#EF9F27' },
    remboursement: { title: editTx ? 'Modifier le remboursement' : 'Remboursement à l\'échéance', color: 'var(--green)' },
  }

  const montantTotal = type === 'achat'
    ? parseFloat(nominal || '0') * fxRate * (parseFloat(prixPct || '100') / 100)
    : type === 'remboursement'
    ? parseFloat(nominal || '0')
    : parseFloat(montantCoupon || '0')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: config[type].color }}>{config[type].title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {type === 'achat' && (
            <>
              <div>
                <label style={lbl2}>Compte</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} required style={inp}>
                  <option value="">Sélectionner un compte</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
                <div>
                  <label style={lbl2}>Nominal acheté ({currency})</label>
                  <input type="number" step="1" min="0" value={nominal} onChange={e => setNominal(e.target.value)} required placeholder="10000" style={inp} autoFocus />
                </div>
                <div>
                  <label style={lbl2}>Devise</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} style={inp}>
                    <option value="EUR">EUR €</option>
                    <option value="USD">USD $</option>
                    <option value="GBP">GBP £</option>
                    <option value="CHF">CHF</option>
                    <option value="JPY">JPY ¥</option>
                  </select>
                </div>
              </div>
              {currency !== 'EUR' && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6 }}>
                  {fxLoading ? 'Récupération du taux…' : `1 ${currency} = ${fxRate.toFixed(4)} EUR · Nominal EUR : ${(parseFloat(nominal || '0') * fxRate).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}`}
                </div>
              )}
              <div>
                <label style={lbl2}>Prix d&apos;achat (%)</label>
                <input type="number" step="0.01" min="0" max="200" value={prixPct} onChange={e => setPrixPct(e.target.value)} required placeholder="98" style={inp} />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Ex : 98 pour acheter à 98% du nominal</p>
              </div>
            </>
          )}

          {type === 'coupon' && (
            <div>
              <label style={lbl2}>Montant du coupon (€)</label>
              <input type="number" step="0.01" min="0" value={montantCoupon} onChange={e => setMontantCoupon(e.target.value)} required placeholder="0.00" style={inp} autoFocus />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Montant net reçu</p>
            </div>
          )}

          {type === 'remboursement' && (
            <div>
              <label style={lbl2}>Nominal remboursé (€)</label>
              <input type="number" step="1" min="0" value={nominal} onChange={e => setNominal(e.target.value)} required style={inp} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Remboursement à 100% du nominal</p>
            </div>
          )}

          <div>
            <label style={lbl2}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          <div>
            <label style={lbl2}>Note (optionnel)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={type === 'coupon' ? 'Ex : coupon S1 2025' : ''} style={inp} />
          </div>

          {/* Total */}
          {montantTotal > 0 && (
            <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '9px 12px', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{type === 'achat' ? 'Décaissement : ' : type === 'remboursement' ? 'Encaissement : ' : 'Montant : '}</span>
              <span style={{ fontWeight: 500 }}>{montantTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 10, borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: 10, borderRadius: 7, border: 'none', background: config[type].color, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
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
