'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, Asset } from '@/types'
import { X } from 'lucide-react'

interface TransactionModalProps {
  onClose: () => void
  onSuccess: () => void
  editTransaction?: any
}

export default function TransactionModal({ onClose, onSuccess, editTransaction }: TransactionModalProps) {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const [form, setForm] = useState({
    account_id: editTransaction?.account_id ?? '',
    asset_id: editTransaction?.asset_id ?? '',
    type: editTransaction?.type ?? 'achat',
    quantity: editTransaction?.quantity?.toString() ?? '',
    price: editTransaction?.price?.toString() ?? '',
    date: editTransaction?.date ?? new Date().toISOString().split('T')[0],
    notes: editTransaction?.notes ?? '',
  })

  useEffect(() => {
    async function load() {
      const [{ data: acc }, { data: ast }] = await Promise.all([
        supabase.from('accounts').select('*').order('name'),
        supabase.from('assets').select('*').order('name'),
      ])
      setAccounts(acc ?? [])
      setAssets(ast ?? [])
    }
    load()
  }, [])

  // Pré-remplir la recherche si édition
  useEffect(() => {
    if (editTransaction?.asset_id && assets.length > 0) {
      const a = assets.find(a => a.id === editTransaction.asset_id)
      if (a) setAssetSearch(a.name)
    }
  }, [assets, editTransaction])

  const filteredAssets = assetSearch.trim()
    ? assets.filter(a =>
        a.name.toLowerCase().includes(assetSearch.toLowerCase()) ||
        (a.isin ?? '').toLowerCase().includes(assetSearch.toLowerCase()) ||
        (a.ticker ?? '').toLowerCase().includes(assetSearch.toLowerCase())
      )
    : assets

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      account_id: form.account_id,
      asset_id: form.asset_id,
      type: form.type,
      quantity: parseFloat(form.quantity),
      price: parseFloat(form.price),
      date: form.date,
      notes: form.notes || null,
    }

    let err
    if (editTransaction?.id) {
      ({ error: err } = await supabase.from('transactions').update(payload).eq('id', editTransaction.id))
    } else {
      ({ error: err } = await supabase.from('transactions').insert(payload))
    }

    if (err) {
      setError('Erreur lors de la sauvegarde.')
      setLoading(false)
    } else {
      onSuccess()
      onClose()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px',
    borderRadius: 7, border: '0.5px solid var(--border)',
    fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
    outline: 'none', fontFamily: 'var(--font-sans)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div className="fade-in" style={{
        background: 'var(--surface)', borderRadius: 14,
        padding: '24px', width: '100%', maxWidth: 440,
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>
            {editTransaction ? 'Modifier la transaction' : 'Nouvelle transaction'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {([
              { key: 'achat', label: 'Achat', color: 'var(--brand)' },
              { key: 'vente', label: 'Vente', color: 'var(--red)' },
              { key: 'dividende', label: 'Dividende', color: 'var(--green)' },
            ] as const).map(t => (
              <button
                key={t.key} type="button"
                onClick={() => setForm(f => ({ ...f, type: t.key }))}
                style={{
                  padding: '8px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontWeight: 500,
                  border: form.type === t.key ? `1.5px solid ${t.color}` : '0.5px solid var(--border)',
                  background: form.type === t.key ? `${t.color}18` : 'transparent',
                  color: form.type === t.key ? t.color : 'var(--muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Compte */}
          <div>
            <label style={labelStyle}>Compte</label>
            <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} required style={inputStyle}>
              <option value="">Sélectionner un compte</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Actif avec recherche */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Actif</label>
            <input
              value={assetSearch}
              onChange={e => { setAssetSearch(e.target.value); setShowDropdown(true); setForm(f => ({ ...f, asset_id: '' })) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Rechercher par nom, ISIN ou ticker…"
              required={!form.asset_id}
              style={{ ...inputStyle, borderColor: form.asset_id ? 'var(--brand)' : 'var(--border)' }}
              autoComplete="off"
            />
            {form.asset_id && (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', marginTop: 10 }} />
            )}
            {showDropdown && filteredAssets.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--surface)', border: '0.5px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                maxHeight: 200, overflowY: 'auto', marginTop: 4,
              }}>
                {filteredAssets.slice(0, 20).map(a => (
                  <div
                    key={a.id}
                    onMouseDown={() => { setForm(f => ({ ...f, asset_id: a.id })); setAssetSearch(a.name); setShowDropdown(false) }}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                      background: form.asset_id === a.id ? 'var(--brand-light)' : 'transparent',
                      borderBottom: '0.5px solid var(--border)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = form.asset_id === a.id ? 'var(--brand-light)' : 'transparent')}
                  >
                    <p style={{ fontWeight: 500 }}>{a.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {[a.isin, a.ticker, a.category].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Avertissement obligation */}
          {form.asset_id && assets.find(a => a.id === form.asset_id)?.category === 'obligation' && (
            <div style={{ background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#633806' }}>
              Les obligations ont une page dédiée avec les bons champs (nominal, prix %, coupons).{' '}
              <a href={`/obligations/${form.asset_id}`} style={{ color: '#633806', fontWeight: 600 }}>
                Ouvrir la page →
              </a>
            </div>
          )}

          {/* Quantité + Prix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Quantité</label>
              <input type="number" step="any" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required placeholder="0.00" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Prix unitaire (€)</label>
              <input type="number" step="any" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required placeholder="0.00" style={inputStyle} />
            </div>
          </div>

          {/* Date */}
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required style={inputStyle} />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes (optionnel)</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ex : DCA mensuel" style={inputStyle} />
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}

          {/* Total calculé */}
          {form.quantity && form.price && (
            <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '9px 12px', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>Total : </span>
              <span style={{ fontWeight: 500 }}>
                {(parseFloat(form.quantity) * parseFloat(form.price)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)',
              background: 'transparent', color: 'var(--muted)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              Annuler
            </button>
            <button type="submit" disabled={loading} style={{
              padding: '10px', borderRadius: 7, border: 'none',
              background: 'var(--brand)', color: '#fff', fontSize: 13,
              fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-sans)',
            }}>
              {loading ? 'Sauvegarde…' : editTransaction ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
