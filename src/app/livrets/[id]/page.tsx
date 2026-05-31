'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react'
import { format, parseISO, startOfYear, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Movement {
  id: string
  type: 'depot' | 'retrait' | 'interets'
  amount: number
  date: string
  note?: string
  validated: boolean
}

interface Account {
  id: string
  name: string
  type: string
  livret_rate: number
  livret_ceiling: number
}

export default function LivretPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [account, setAccount] = useState<Account | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'depot' | 'retrait' | 'interets'>('depot')
  const [editRate, setEditRate] = useState(false)
  const [newRate, setNewRate] = useState('')

  async function loadData() {
    const [{ data: acc }, { data: mvts }] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).single(),
      supabase.from('livret_movements').select('*').eq('account_id', id).order('date', { ascending: false }),
    ])
    setAccount(acc as Account)
    setMovements((mvts ?? []) as Movement[])
    setNewRate(acc?.livret_rate?.toString() ?? '0')
  }

  useEffect(() => { loadData() }, [id])

  // Calcul du solde actuel
  const solde = movements.reduce((sum, m) => {
    if (m.type === 'depot' || m.type === 'interets') return sum + m.amount
    return sum - m.amount
  }, 0)

  // Calcul des intérêts courus depuis le 1er janvier
  const today = new Date()
  const debutAnnee = startOfYear(today)
  const joursEcoules = differenceInDays(today, debutAnnee)
  const joursRestants = 365 - joursEcoules
  const taux = account?.livret_rate ?? 0
  const interetsCourus = solde * (taux / 100) * (joursEcoules / 365)
  const interetsRestants = solde * (taux / 100) * (joursRestants / 365)
  const interetsAnnee = solde * (taux / 100)

  async function deleteMovement(mvtId: string) {
    if (!confirm('Supprimer ce mouvement ?')) return
    await supabase.from('livret_movements').delete().eq('id', mvtId)
    loadData()
  }

  async function saveRate() {
    await supabase.from('accounts').update({
      livret_rate: parseFloat(newRate),
      livret_rate_updated_at: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    setEditRate(false)
    loadData()
  }

  if (!account) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />

      <main style={{ maxWidth: 750, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Retour + titre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>{account.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Livret · {account.type.toUpperCase()}</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
          <div style={card}>
            <p style={label}>Solde actuel</p>
            <p style={{ fontSize: 22, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(solde)}</p>
          </div>
          <div style={card}>
            <p style={label}>Taux annuel</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editRate ? (
                <>
                  <input
                    type="number" step="0.01" value={newRate}
                    onChange={e => setNewRate(e.target.value)}
                    style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
                    autoFocus
                  />
                  <span style={{ fontSize: 14 }}>%</span>
                  <button onClick={saveRate} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 22, fontWeight: 500 }}>{taux} %</p>
                  <button onClick={() => setEditRate(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </>
              )}
            </div>
          </div>
          <div style={card}>
            <p style={label}>Intérêts estimés {today.getFullYear()}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: '#1D9E75', filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(interetsAnnee)}</p>
          </div>
        </div>

        {/* Projection intérêts */}
        <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={label}>Intérêts courus (depuis le 1er jan.)</p>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#1D9E75', filter: privacy ? 'blur(6px)' : 'none' }}>{fmt(interetsCourus)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{joursEcoules} jours écoulés</p>
          </div>
          <div>
            <p style={label}>Intérêts restants (jusqu&apos;au 31 déc.)</p>
            <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', filter: privacy ? 'blur(6px)' : 'none' }}>{fmt(interetsRestants)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{joursRestants} jours restants</p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['depot', 'retrait', 'interets'] as const).map(t => (
            <button key={t} onClick={() => { setModalType(t); setShowModal(true) }} style={{
              flex: 1, padding: '9px', borderRadius: 8, border: '0.5px solid var(--border)',
              background: t === 'depot' ? 'var(--brand)' : t === 'retrait' ? '#E24B4A' : '#1D9E75',
              color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              {t === 'depot' ? '+ Dépôt' : t === 'retrait' ? '- Retrait' : '★ Intérêts reçus'}
            </button>
          ))}
        </div>

        {/* Historique */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Historique ({movements.length} mouvements)
            </p>
          </div>
          {!movements.length ? (
            <p style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun mouvement — faites votre premier dépôt</p>
          ) : movements.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: m.type === 'depot' ? 'var(--brand)' : m.type === 'retrait' ? '#E24B4A' : '#1D9E75' }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 500 }}>{m.type === 'depot' ? 'Dépôt' : m.type === 'retrait' ? 'Retrait' : 'Intérêts reçus'}</p>
                {m.note && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{m.note}</p>}
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(m.date), 'd MMM yyyy', { locale: fr })}</p>
              <p style={{ fontWeight: 500, minWidth: 90, textAlign: 'right', filter: privacy ? 'blur(5px)' : 'none', color: m.type === 'retrait' ? '#E24B4A' : m.type === 'interets' ? '#1D9E75' : 'var(--text)' }}>
                {m.type === 'retrait' ? '-' : '+'}{fmt(m.amount)}
              </p>
              <button onClick={() => deleteMovement(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </main>

      {showModal && (
        <MovementModal
          type={modalType}
          accountId={id}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function MovementModal({ type, accountId, onClose, onSuccess }: { type: 'depot' | 'retrait' | 'interets'; accountId: string; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const titles = { depot: 'Nouveau dépôt', retrait: 'Nouveau retrait', interets: 'Intérêts reçus' }
  const colors = { depot: 'var(--brand)', retrait: '#E24B4A', interets: '#1D9E75' }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('livret_movements').insert({
      user_id: user.id,
      account_id: accountId,
      type,
      amount: parseFloat(amount),
      date,
      note: note || null,
      validated: true,
    })
    onSuccess(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 380, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: colors[type] }}>{titles[type]}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Montant (€)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus placeholder="0.00" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Note (optionnel)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : virement mensuel" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: '10px', borderRadius: 7, border: 'none', background: colors[type], color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '14px 16px' }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }
const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
