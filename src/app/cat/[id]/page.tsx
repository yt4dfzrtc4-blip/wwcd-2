'use client'

import { usePrivacy } from '@/hooks/usePrivacy'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft, X, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function CatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [assetId, setAssetId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editTx, setEditTx] = useState<any>(null)
  const [mobile, setMobile] = useState(false)

  // Champs éditables inline
  const [editRate, setEditRate] = useState(false)
  const [newRate, setNewRate] = useState('')
  const [editMaturity, setEditMaturity] = useState(false)
  const [newMaturity, setNewMaturity] = useState('')
  const [editCapital, setEditCapital] = useState(false)
  const [newCapital, setNewCapital] = useState('')

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadData() {
    const { data: acc } = await supabase.from('accounts').select('*').eq('id', id).single()
    if (!acc) return
    setAccount(acc)
    setNewRate(acc.livret_rate?.toString() ?? '0')
    setNewMaturity(acc.cat_maturity_date ?? '')
    setNewCapital(acc.balance?.toString() ?? '')

    const { data: ast } = await supabase.from('assets').select('id')
      .eq('category', 'cat').eq('name', acc.name).single()
    if (ast) setAssetId(ast.id)

    const { data: txs } = await supabase.from('transactions')
      .select('*').eq('account_id', id).order('date', { ascending: true })
    setTransactions(txs ?? [])
  }

  useEffect(() => { loadData() }, [id])

  const capitalFromTx = transactions.reduce((sum: number, tx: any) => {
    const montant = tx.quantity * tx.price
    return tx.type === 'achat' ? sum + montant : sum - montant
  }, 0)
  const capital = capitalFromTx || (account?.balance ?? 0)

  const taux = account?.livret_rate ?? 0
  const today = new Date()
  const maturityDate = account?.cat_maturity_date ? new Date(account.cat_maturity_date) : null
  const openingDate = transactions.length > 0 ? new Date(transactions[0].date) : null

  const joursEcoules = openingDate ? differenceInDays(today, openingDate) : 0
  const joursRestants = maturityDate ? Math.max(0, differenceInDays(maturityDate, today)) : null
  const dureeTotal = openingDate && maturityDate ? differenceInDays(maturityDate, openingDate) : null
  const interetsCourus = capital * (taux / 100) * (joursEcoules / 365)
  const interetsEcheance = dureeTotal ? capital * (taux / 100) * (dureeTotal / 365) : null

  async function saveRate() {
    await supabase.from('accounts').update({ livret_rate: parseFloat(newRate) }).eq('id', id)
    setEditRate(false); loadData()
  }
  async function saveMaturity() {
    await supabase.from('accounts').update({ cat_maturity_date: newMaturity || null }).eq('id', id)
    setEditMaturity(false); loadData()
  }
  async function saveCapital() {
    await supabase.from('accounts').update({ balance: parseFloat(newCapital) || 0 }).eq('id', id)
    setEditCapital(false); loadData()
  }
  async function deleteTx(txId: string) {
    if (!confirm('Supprimer ce mouvement ?')) return
    await supabase.from('transactions').delete().eq('id', txId)
    loadData()
  }

  const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

  if (!account) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <main style={{ maxWidth: 750, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>{account.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Compte à Terme · CAT</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, minmax(0,1fr))', gap: 10 }}>

          <div style={card}>
            <p style={lbl}>Capital</p>
            {editCapital ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" step="0.01" value={newCapital} onChange={e => setNewCapital(e.target.value)}
                  style={{ width: 100, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                <button onClick={saveCapital} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                <button onClick={() => setEditCapital(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: mobile ? 17 : 22, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(capital)}</p>
                {!transactions.length && <button onClick={() => setEditCapital(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>définir</button>}
              </div>
            )}
          </div>

          <div style={card}>
            <p style={lbl}>Taux annuel</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editRate ? (
                <>
                  <input type="number" step="0.01" value={newRate} onChange={e => setNewRate(e.target.value)}
                    style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <span style={{ fontSize: 14 }}>%</span>
                  <button onClick={saveRate} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditRate(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: mobile ? 17 : 22, fontWeight: 500 }}>{taux} %</p>
                  <button onClick={() => setEditRate(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </>
              )}
            </div>
          </div>

          <div style={card}>
            <p style={lbl}>Intérêts à l&apos;échéance</p>
            <p style={{ fontSize: mobile ? 17 : 22, fontWeight: 500, color: '#1D9E75', filter: privacy ? 'blur(7px)' : 'none' }}>
              {interetsEcheance !== null ? fmt(interetsEcheance) : '–'}
            </p>
          </div>
        </div>

        {/* Échéance + progression */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <p style={lbl}>Date d&apos;échéance</p>
              {editMaturity ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input type="date" value={newMaturity} onChange={e => setNewMaturity(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <button onClick={saveMaturity} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditMaturity(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Annuler</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: 16, fontWeight: 500 }}>
                    {maturityDate ? format(maturityDate, 'd MMMM yyyy', { locale: fr }) : '–'}
                  </p>
                  <button onClick={() => setEditMaturity(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>
            {joursRestants !== null && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Temps restant</p>
                <p style={{ fontSize: 16, fontWeight: 500, color: joursRestants < 30 ? 'var(--red)' : 'var(--text)' }}>
                  {joursRestants === 0 ? 'Échu' : `${joursRestants} j`}
                </p>
              </div>
            )}
          </div>
          {dureeTotal && dureeTotal > 0 && (
            <div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (joursEcoules / dureeTotal) * 100)}%`, height: '100%', background: 'var(--brand)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
                <span>{joursEcoules} j écoulés</span>
                <span>{dureeTotal} j total</span>
              </div>
            </div>
          )}
        </div>

        {/* Intérêts courus */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={card}>
            <p style={lbl}>Intérêts courus</p>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#1D9E75', filter: privacy ? 'blur(6px)' : 'none' }}>{fmt(interetsCourus)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{joursEcoules} j depuis ouverture</p>
          </div>
          <div style={card}>
            <p style={lbl}>Capital + intérêts</p>
            <p style={{ fontSize: 16, fontWeight: 500, filter: privacy ? 'blur(6px)' : 'none' }}>{fmt(capital + interetsCourus)}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>valeur estimée aujourd&apos;hui</p>
          </div>
        </div>

        {/* Bouton dépôt */}
        {assetId && (
          <button onClick={() => { setEditTx(null); setShowModal(true) }} style={{
            padding: '10px', borderRadius: 8, border: 'none',
            background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>
            + Enregistrer le dépôt initial
          </button>
        )}

        {!assetId && (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#633806' }}>
            Créez un actif de catégorie &quot;CAT&quot; avec le nom <strong>{account.name}</strong> dans la page Actifs pour enregistrer un dépôt.
          </div>
        )}

        {/* Historique transactions */}
        {transactions.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Historique ({transactions.length})
              </p>
            </div>
            {transactions.map((tx: any) => {
              const montant = tx.quantity * tx.price
              const color = tx.type === 'achat' ? 'var(--brand)' : '#E24B4A'
              return (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500 }}>{tx.type === 'achat' ? 'Dépôt' : 'Retrait'}</p>
                    {tx.notes && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.notes}</p>}
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(parseISO(tx.date), 'd MMM yyyy', { locale: fr })}</p>
                  <p style={{ fontWeight: 500, minWidth: 80, textAlign: 'right', color, filter: privacy ? 'blur(5px)' : 'none' }}>
                    {tx.type === 'achat' ? '+' : '-'}{fmt(montant)}
                  </p>
                  {assetId && (
                    <button onClick={() => { setEditTx(tx); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                      <Pencil size={13} />
                    </button>
                  )}
                  <button onClick={() => deleteTx(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showModal && assetId && (
        <DepotModal
          accountId={id}
          assetId={assetId}
          editTx={editTx}
          onClose={() => { setShowModal(false); setEditTx(null) }}
          onSuccess={loadData}
        />
      )}
    </div>
  )
}

function DepotModal({ accountId, assetId, editTx, onClose, onSuccess }: {
  accountId: string; assetId: string; editTx?: any; onClose: () => void; onSuccess: () => void
}) {
  const supabase = createClient()
  const [amount, setAmount] = useState(editTx ? (editTx.quantity * editTx.price).toString() : '')
  const [date, setDate] = useState(editTx?.date ?? new Date().toISOString().split('T')[0])
  const [type, setType] = useState<'achat' | 'vente'>(editTx?.type ?? 'achat')
  const [notes, setNotes] = useState(editTx?.notes ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, account_id: accountId, asset_id: assetId,
      type, quantity: 1, price: parseFloat(amount), date, notes: notes || null,
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
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 380, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500 }}>{editTx ? 'Modifier le mouvement' : 'Nouveau mouvement'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['achat', 'vente'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)} style={{
                padding: '8px', borderRadius: 7, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500,
                border: type === t ? `1.5px solid ${t === 'achat' ? 'var(--brand)' : 'var(--red)'}` : '0.5px solid var(--border)',
                background: type === t ? `${t === 'achat' ? 'var(--brand)' : 'var(--red)'}18` : 'transparent',
                color: type === t ? (t === 'achat' ? 'var(--brand)' : 'var(--red)') : 'var(--muted)',
              }}>
                {t === 'achat' ? 'Dépôt' : 'Retrait'}
              </button>
            ))}
          </div>
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
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex : ouverture CAT" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: '10px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {loading ? '…' : editTx ? 'Modifier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '14px 16px' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }
