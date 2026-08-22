'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, Trash2, X, Plus } from 'lucide-react'
import { format, parseISO, addMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

interface Asset {
  id: string
  name: string
  creance_initial: number
  creance_monthly: number
  creance_start_date: string
  creance_months: number
}

interface Payment {
  id: string
  date: string
  quantity: number
  price: number
  notes?: string
}

export default function CreancePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [showModal, setShowModal] = useState(false)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadData() {
    const { data: a } = await supabase.from('assets').select('*').eq('id', id).single()
    if (a) setAsset(a as Asset)
    const { data: txs } = await supabase.from('transactions')
      .select('*').eq('asset_id', id).eq('type', 'remboursement')
      .order('date', { ascending: false })
    setPayments((txs ?? []) as Payment[])
  }

  useEffect(() => { loadData() }, [id])

  if (!asset) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  const initial = asset.creance_initial ?? 0
  const monthly = asset.creance_monthly ?? 0
  const months = asset.creance_months ?? 0
  const startDate = asset.creance_start_date ? new Date(asset.creance_start_date) : null

  // Calculs automatiques
  const totalRepaid = payments.reduce((s, p) => s + p.quantity * p.price, 0)
  const remaining = Math.max(0, initial - totalRepaid)
  const repaidPct = initial > 0 ? Math.min(100, (totalRepaid / initial) * 100) : 0

  // Paiements restants théoriques
  const paymentsLeft = monthly > 0 ? Math.ceil(remaining / monthly) : 0
  const endDate = startDate ? addMonths(startDate, months) : null

  // Rendement
  const totalExpected = monthly * months
  const gain = totalExpected - initial
  const yieldPct = initial > 0 ? (gain / initial) * 100 : 0

  async function deletePay(txId: string) {
    if (!confirm('Supprimer ce paiement ?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', txId)
    if (error) { alert(`Échec de la suppression : ${error.message}`); return }
    loadData()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} />

      <main style={{ maxWidth: 700, margin: '0 auto', padding: mobile ? '16px 12px 40px' : '24px 24px 60px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>{asset.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Créance · {startDate ? format(startDate, 'MMM yyyy', { locale: fr }) : '–'} → {endDate ? format(endDate, 'MMM yyyy', { locale: fr }) : '–'} · {months} mois
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Capital restant', value: fmt(remaining), color: remaining > 0 ? 'var(--text)' : 'var(--green)' },
            { label: 'Remboursé', value: fmt(totalRepaid), color: 'var(--green)' },
            { label: 'Capital initial', value: fmt(initial), color: 'var(--muted)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</p>
              <p style={{ fontSize: mobile ? 15 : 18, fontWeight: 700, color, filter: privacy ? 'blur(7px)' : 'none' }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Barre de progression */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{repaidPct.toFixed(1)}% remboursé</span>
            <span style={{ color: 'var(--muted)' }}>
              {paymentsLeft > 0 ? `~${paymentsLeft} paiements restants` : '✓ Remboursé'}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${repaidPct}%`, background: 'var(--green)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
            <span>{startDate ? format(startDate, 'MMM yyyy', { locale: fr }) : '–'}</span>
            <span style={{ color: 'var(--green)', fontWeight: 500 }}>
              {monthly > 0 ? `${fmt(monthly)}/mois` : '–'}
            </span>
            <span>{endDate ? format(endDate, 'MMM yyyy', { locale: fr }) : '–'}</span>
          </div>
        </div>

        {/* Rendement */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total attendu</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', filter: privacy ? 'blur(5px)' : 'none' }}>{fmt(totalExpected)}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Gain total</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', filter: privacy ? 'blur(5px)' : 'none' }}>+{fmt(gain)}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Rendement</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>+{yieldPct.toFixed(1)}%</p>
          </div>
        </div>

        {/* Bouton ajouter paiement */}
        <button onClick={() => setShowModal(true)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '11px', borderRadius: 10, border: 'none',
          background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}>
          <Plus size={16} /> Enregistrer un paiement reçu
        </button>

        {/* Historique */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Paiements reçus ({payments.length})
            </p>
          </div>
          {payments.length === 0 ? (
            <p style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucun paiement enregistré
            </p>
          ) : payments.map(p => {
            const montant = p.quantity * p.price
            const isAnticipated = montant > monthly * 1.1
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 10 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isAnticipated ? 'var(--green)' : 'var(--brand)' }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {isAnticipated ? '⚡ Paiement anticipé' : 'Remboursement mensuel'}
                  </p>
                  {p.notes && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{p.notes}</p>}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>{format(parseISO(p.date), 'd MMM yyyy', { locale: fr })}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: isAnticipated ? 'var(--green)' : 'var(--brand)', filter: privacy ? 'blur(5px)' : 'none' }}>
                  +{fmt(montant)}
                </p>
                <button onClick={() => deletePay(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>

        {/* Projection paiements futurs */}
        {remaining > 0 && monthly > 0 && startDate && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Prochains paiements attendus
              </p>
            </div>
            {Array.from({ length: Math.min(6, paymentsLeft) }).map((_, i) => {
              // Trouver la prochaine date de paiement
              const nextDate = addMonths(new Date(), i + 1)
              nextDate.setDate(startDate.getDate())
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '0.5px solid var(--border)', opacity: 0.6 }}>
                  <p style={{ fontSize: 12, color: 'var(--text)' }}>{format(nextDate, 'MMMM yyyy', { locale: fr })}</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', filter: privacy ? 'blur(5px)' : 'none' }}>{fmt(monthly)}</p>
                </div>
              )
            })}
            {paymentsLeft > 6 && (
              <p style={{ padding: '8px 16px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                + {paymentsLeft - 6} paiements restants jusqu&apos;en {endDate ? format(endDate, 'MMM yyyy', { locale: fr }) : '–'}
              </p>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <PaymentModal
          assetId={id}
          suggestedAmount={monthly}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function PaymentModal({ assetId, suggestedAmount, onClose, onSuccess }: {
  assetId: string
  suggestedAmount: number
  onClose: () => void
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [amount, setAmount] = useState(suggestedAmount.toString())
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      asset_id: assetId,
      account_id: null,
      type: 'remboursement',
      quantity: 1,
      price: parseFloat(amount),
      date,
      notes: note || null,
    })
    setLoading(false)
    if (error) { alert(`Échec de l'enregistrement : ${error.message}`); return }
    onSuccess(); onClose()
  }

  const isAnticipated = parseFloat(amount) > suggestedAmount * 1.1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 380, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Paiement reçu</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        {isAnticipated && (
          <div style={{ background: '#f0fdf4', border: '0.5px solid var(--green)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--green)' }}>
            ⚡ Montant supérieur à la mensualité — sera marqué comme paiement anticipé
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Montant reçu (€)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus style={inp} />
            {suggestedAmount > 0 && (
              <button type="button" onClick={() => setAmount(suggestedAmount.toString())}
                style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                Mensualité normale : {suggestedAmount.toLocaleString('fr-FR')} €
              </button>
            )}
          </div>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          <div>
            <label style={lbl}>Note (optionnel)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: paiement anticipé mois de mars" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: '10px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }
