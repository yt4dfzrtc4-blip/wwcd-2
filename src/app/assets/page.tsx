'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, Account, Bank } from '@/types'
import Topbar from '@/components/layout/Topbar'
import { CATEGORY_LABELS } from '@/lib/portfolio'
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

export default function AssetsPage() {
  const supabase = createClient()
  const [assets, setAssets] = useState<Asset[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({})

  async function loadData() {
    const [{ data: ast }, { data: acc }, { data: bnk }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)').order('name'),
      supabase.from('accounts').select('*, bank:banks(*)').order('name'),
      supabase.from('banks').select('*').order('name'),
    ])
    setAssets((ast ?? []) as Asset[])
    setAccounts((acc ?? []) as Account[])
    setBanks((bnk ?? []) as Bank[])
    const expanded: Record<string, boolean> = {}
    ;(bnk ?? []).forEach((b: Bank) => { expanded[b.id] = true })
    expanded['none'] = true
    setExpandedBanks(expanded)
  }

  useEffect(() => { loadData() }, [])

  async function deleteAsset(id: string) {
    if (!confirm('Supprimer cet actif et toutes ses transactions ?')) return
    await supabase.from('assets').delete().eq('id', id)
    loadData()
  }

  async function deleteAccount(id: string) {
    if (!confirm('Supprimer ce compte ?')) return
    await supabase.from('accounts').delete().eq('id', id)
    loadData()
  }

  async function deleteBank(id: string) {
    if (!confirm('Supprimer cette banque et dissocier ses comptes ?')) return
    await supabase.from('banks').delete().eq('id', id)
    loadData()
  }

  const accountsByBank = (bankId: string | null) =>
    accounts.filter(a => bankId ? (a as any).bank_id === bankId : !(a as any).bank_id)

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* BANQUES & COMPTES */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>Banques & Comptes</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowBankModal(true)} style={{ ...btnStyle, background: 'var(--surface)', color: 'var(--text)', border: '0.5px solid var(--border)' }}>
                <Plus size={14} /> Nouvelle banque
              </button>
              <button onClick={() => setShowAccountModal(true)} style={btnStyle}>
                <Plus size={14} /> Nouveau compte
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Comptes sans banque */}
            {accountsByBank(null).length > 0 && (
              <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                  Sans banque
                </div>
                {accountsByBank(null).map(acc => (
                  <AccountRow key={acc.id} acc={acc} onDelete={deleteAccount} />
                ))}
              </div>
            )}

            {/* Comptes par banque */}
            {banks.map(bank => (
              <div key={bank.id} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: expandedBanks[bank.id] ? '0.5px solid var(--border)' : 'none', background: 'var(--bg)' }}
                  onClick={() => setExpandedBanks(e => ({ ...e, [bank.id]: !e[bank.id] }))}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {expandedBanks[bank.id] ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{bank.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{accountsByBank(bank.id).length} compte{accountsByBank(bank.id).length > 1 ? 's' : ''}</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteBank(bank.id) }} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                </div>
                {expandedBanks[bank.id] && accountsByBank(bank.id).map(acc => (
                  <AccountRow key={acc.id} acc={acc} onDelete={deleteAccount} />
                ))}
                {expandedBanks[bank.id] && accountsByBank(bank.id).length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Aucun compte — ajoutez-en un</div>
                )}
              </div>
            ))}

            {banks.length === 0 && accounts.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '24px 0' }}>
                Commencez par créer une banque, puis un compte
              </p>
            )}
          </div>
        </section>

        {/* ACTIFS */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>Actifs</h2>
            <button onClick={() => { setEditAsset(null); setShowAssetModal(true) }} style={btnStyle}>
              <Plus size={14} /> Nouvel actif
            </button>
          </div>

          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px 50px', gap: 8, padding: '9px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              <span>Nom</span><span>Catégorie</span><span>ISIN / Ticker</span><span style={{ textAlign: 'right' }}>Valeur / Solde</span><span />
            </div>
            {!assets.length ? (
              <p style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun actif</p>
            ) : assets.map(a => (
              <div key={a.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px 50px', gap: 8, padding: '10px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13, alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{a.name}</span>
                  {a.livret_mode === 'balance' && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>solde simple</span>}
                  {a.livret_mode === 'transactions' && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>avec transactions</span>}
                </div>
                <span className={`badge badge-${a.category}`}>{CATEGORY_LABELS[a.category]}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{a.isin ?? a.ticker ?? '–'}</span>
                <span style={{ textAlign: 'right', color: 'var(--muted)', filter: privacy ? 'blur(5px)' : 'none' }}>
                  {a.livret_mode === 'balance'
                    ? `${(a.livret_balance ?? 0).toLocaleString('fr-FR')} €`
                    : (a as any).prices?.price ? `${(a as any).prices.price.toFixed(2)} €` : '–'
                  }
                </span>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditAsset(a); setShowAssetModal(true) }} style={iconBtn}><Pencil size={13} /></button>
                  <button onClick={() => deleteAsset(a.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showAssetModal && <AssetModal asset={editAsset} onClose={() => { setShowAssetModal(false); setEditAsset(null) }} onSuccess={loadData} />}
      {showAccountModal && <AccountModal banks={banks} onClose={() => setShowAccountModal(false)} onSuccess={loadData} />}
      {showBankModal && <BankModal onClose={() => setShowBankModal(false)} onSuccess={loadData} />}
    </div>
  )
}

function AccountRow({ acc, onDelete }: { acc: Account; onDelete: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ paddingLeft: 22 }}>
        <p style={{ fontWeight: 500 }}>{acc.name}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{acc.type.toUpperCase()}</p>
      </div>
      <button onClick={() => onDelete(acc.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
    </div>
  )
}

function BankModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('banks').insert({ name, user_id: user.id })
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title="Nouvelle banque" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom de la banque">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex : Boursorama, CIC, Coinbase…" style={inp} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function AccountModal({ banks, onClose, onSuccess }: { banks: Bank[]; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', type: 'pea', bank_id: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('accounts').insert({
      name: form.name,
      type: form.type,
      user_id: user.id,
      bank_id: form.bank_id || null,
    })
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title="Nouveau compte" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Banque (optionnel)">
          <select value={form.bank_id} onChange={e => setForm(f => ({ ...f, bank_id: e.target.value }))} style={inp}>
            <option value="">Sans banque</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Nom du compte">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex : PEA, Livret A, Crypto…" style={inp} />
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
            {[['pea','PEA'],['cto','Compte-titres'],['crypto','Crypto'],['livret','Livret'],['per','PER'],['or','Or'],['obligations','Obligations'],['autre','Autre']].map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function AssetModal({ asset, onClose, onSuccess }: { asset: Asset | null; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const isLivret = ['livret', 'cat', 'per'].includes(asset?.category ?? '')
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    category: asset?.category ?? 'etf',
    isin: asset?.isin ?? '',
    ticker: asset?.ticker ?? '',
    currency: asset?.currency ?? 'EUR',
    livret_mode: asset?.livret_mode ?? 'auto',
    livret_balance: asset?.livret_balance?.toString() ?? '0',
    livret_rate: asset?.livret_rate?.toString() ?? '0',
  })
  const [loading, setLoading] = useState(false)

  const showLivretOptions = ['livret', 'cat', 'per', 'or'].includes(form.category)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      name: form.name,
      category: form.category,
      isin: form.isin || null,
      ticker: form.ticker || null,
      currency: form.currency,
      user_id: user.id,
      livret_mode: showLivretOptions ? form.livret_mode : 'auto',
      livret_balance: showLivretOptions && form.livret_mode === 'balance' ? parseFloat(form.livret_balance) : null,
      livret_rate: showLivretOptions ? parseFloat(form.livret_rate) : null,
    }
    if (asset?.id) {
      await supabase.from('assets').update(payload).eq('id', asset.id)
    } else {
      await supabase.from('assets').insert(payload)
    }
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title={asset ? "Modifier l'actif" : 'Nouvel actif'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex: MSCI World, Livret A…" style={inp} />
        </Field>
        <Field label="Catégorie">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as AssetCategory }))} style={inp}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>

        {showLivretOptions && (
          <Field label="Mode de gestion">
            <select value={form.livret_mode} onChange={e => setForm(f => ({ ...f, livret_mode: e.target.value }))} style={inp}>
              <option value="balance">Solde simple (sans transactions)</option>
              <option value="transactions">Avec historique de transactions</option>
              <option value="auto">Cours automatique (ETF/actions)</option>
            </select>
          </Field>
        )}

        {showLivretOptions && form.livret_mode === 'balance' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Solde actuel (€)">
              <input type="number" step="0.01" value={form.livret_balance} onChange={e => setForm(f => ({ ...f, livret_balance: e.target.value }))} style={inp} />
            </Field>
            <Field label="Taux (%)">
              <input type="number" step="0.01" value={form.livret_rate} onChange={e => setForm(f => ({ ...f, livret_rate: e.target.value }))} style={inp} />
            </Field>
          </div>
        )}

        {!showLivretOptions && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="ISIN (optionnel)"><input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="FR0011869353" style={inp} /></Field>
            <Field label="Ticker (optionnel)"><input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="CW8.PA" style={inp} /></Field>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : asset ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="fade-in" style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 440, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }
const btnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 7, background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }
const cancelBtn: React.CSSProperties = { padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const submitBtn: React.CSSProperties = { padding: '10px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
 
