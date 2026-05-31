'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, Account } from '@/types'
import Topbar from '@/components/layout/Topbar'
import { CATEGORY_LABELS } from '@/lib/portfolio'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

export default function AssetsPage() {
  const supabase = createClient()
  const [assets, setAssets] = useState<Asset[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)

  async function loadData() {
    const [{ data: ast }, { data: acc }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)').order('name'),
      supabase.from('accounts').select('*').order('name'),
    ])
    setAssets((ast ?? []) as Asset[])
    setAccounts((acc ?? []) as Account[])
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

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Actifs */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>Actifs</h1>
            <button onClick={() => { setEditAsset(null); setShowAssetModal(true) }} style={btnStyle}>
              <Plus size={14} /> Nouvel actif
            </button>
          </div>

          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 120px 50px', gap: 8, padding: '9px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              <span>Nom</span><span>Catégorie</span><span>ISIN / Ticker</span><span style={{ textAlign: 'right' }}>Cours actuel</span><span />
            </div>
            {!assets.length ? (
              <p style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun actif</p>
            ) : assets.map(a => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 120px 50px', gap: 8, padding: '10px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13, alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                <span className={`badge badge-${a.category}`}>{CATEGORY_LABELS[a.category]}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{a.isin ?? a.ticker ?? '–'}</span>
                <span style={{ textAlign: 'right', color: 'var(--muted)' }}>
                  {(a as any).prices?.price ? `${(a as any).prices.price.toFixed(2)} €` : '–'}
                </span>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditAsset(a); setShowAssetModal(true) }} style={iconBtn}><Pencil size={13} /></button>
                  <button onClick={() => deleteAsset(a.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Comptes */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500 }}>Comptes / Enveloppes</h2>
            <button onClick={() => setShowAccountModal(true)} style={btnStyle}>
              <Plus size={14} /> Nouveau compte
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {accounts.map(acc => (
              <div key={acc.id} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{acc.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{acc.type.toUpperCase()}</p>
                </div>
                <button onClick={() => deleteAccount(acc.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showAssetModal && <AssetModal asset={editAsset} onClose={() => { setShowAssetModal(false); setEditAsset(null) }} onSuccess={loadData} />}
      {showAccountModal && <AccountModal onClose={() => setShowAccountModal(false)} onSuccess={loadData} />}
    </div>
  )
}

// Modal Actif
function AssetModal({ asset, onClose, onSuccess }: { asset: Asset | null; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState({ name: asset?.name ?? '', category: asset?.category ?? 'etf', isin: asset?.isin ?? '', ticker: asset?.ticker ?? '', currency: asset?.currency ?? 'EUR' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { ...form, user_id: user.id, isin: form.isin || null, ticker: form.ticker || null }
    if (asset?.id) {
      await supabase.from('assets').update(payload).eq('id', asset.id)
    } else {
      await supabase.from('assets').insert(payload)
    }
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title={asset ? 'Modifier l\'actif' : 'Nouvel actif'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex: MSCI World" style={inp} /></Field>
        <Field label="Catégorie">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))} style={inp}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="ISIN (optionnel)"><input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="FR0011869353" style={inp} /></Field>
          <Field label="Ticker (optionnel)"><input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="CW8.PA" style={inp} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : asset ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

// Modal Compte
function AccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', type: 'pea' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('accounts').insert({ ...form, user_id: user.id })
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title="Nouveau compte" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom du compte"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex: Bourse #1 — PEA" style={inp} /></Field>
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

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="fade-in" style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 420, border: '0.5px solid var(--border)' }}>
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
