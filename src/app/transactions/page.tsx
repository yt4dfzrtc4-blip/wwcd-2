'use client'

import { usePrivacy } from '@/hooks/usePrivacy'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatEur, getCategoryLabel, getCategoryBadgeClass } from '@/lib/portfolio'
import type { Transaction } from '@/types'
import Topbar from '@/components/layout/Topbar'
import TransactionModal from '@/components/ui/TransactionModal'
import { Plus, Pencil, Trash2, Download, Upload } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const { privacy, togglePrivacy } = usePrivacy()
  const [showModal, setShowModal] = useState(false)
  const [editTx, setEditTx] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errors: string[] } | null>(null)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadData() {
    const { data } = await supabase
      .from('transactions')
      .select('*, asset:assets(*), account:accounts(*)')
      .order('date', { ascending: false })
    setTransactions((data ?? []) as Transaction[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function deleteTx(id: string) {
    if (!confirm('Supprimer cette transaction ?')) return
    await supabase.from('transactions').delete().eq('id', id)
    loadData()
  }

  async function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Ignorer l'en-tête
    const dataLines = lines.slice(1)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Charger actifs et comptes pour matcher par nom
    const [{ data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('user_id', user.id),
      supabase.from('accounts').select('id, name').eq('user_id', user.id),
    ])

    let ok = 0
    const errors: string[] = []

    for (const line of dataLines) {
      // Parser CSV (valeurs entre guillemets)
      const cols = line.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '')) ?? line.split(',')
      const [date, type, assetName, , accountName, qty, price] = cols

      const asset = assets?.find(a => a.name.toLowerCase() === assetName?.toLowerCase())
      const account = accounts?.find(a => a.name.toLowerCase() === accountName?.toLowerCase())

      if (!asset) { errors.push(`Actif introuvable : "${assetName}" (ligne ignorée)`); continue }
      if (!account) { errors.push(`Compte introuvable : "${accountName}" (ligne ignorée)`); continue }
      if (!date || !qty || !price) { errors.push(`Données manquantes ligne : ${line}`); continue }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        asset_id: asset.id,
        account_id: account.id,
        type: type?.toLowerCase() === 'achat' ? 'achat' : 'vente',
        date,
        quantity: parseFloat(qty),
        price: parseFloat(price),
      })
      if (error) errors.push(`Erreur : ${error.message}`)
      else ok++
    }

    setImportResult({ ok, errors })
    setImporting(false)
    e.target.value = ''
    if (ok > 0) loadData()
  }

  function exportCSV() {
    const header = ['Date', 'Type', 'Actif', 'Catégorie', 'Compte', 'Quantité', 'Prix unitaire', 'Total']
    const rows = transactions.map(tx => {
      const asset = (tx as any).asset
      const account = (tx as any).account
      return [
        tx.date,
        tx.type === 'achat' ? 'Achat' : 'Vente',
        asset?.name ?? '',
        asset?.category ?? '',
        account?.name ?? '',
        tx.quantity.toString(),
        tx.price.toString(),
        (tx.quantity * tx.price).toFixed(2),
      ]
    })
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wwcd-transactions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cols = mobile
    ? '80px 1fr 80px 50px'
    : '95px 60px 1fr 90px 90px 90px 60px'

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Transactions</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--surface)', color: importing ? 'var(--brand)' : 'var(--muted)',
              border: '0.5px solid var(--border)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <Upload size={14} /> {!mobile && (importing ? 'Import…' : 'Import CSV')}
              <input type="file" accept=".csv" onChange={importCSV} style={{ display: 'none' }} />
            </label>
            {transactions.length > 0 && (
              <button onClick={exportCSV} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--muted)',
                border: '0.5px solid var(--border)', fontSize: 13,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
                <Download size={14} /> {!mobile && 'Export CSV'}
              </button>
            )}
            <button
              onClick={() => { setEditTx(null); setShowModal(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                background: 'var(--brand)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              <Plus size={15} /> {mobile ? 'Ajouter' : 'Nouvelle transaction'}
            </button>
          </div>
        </div>

        {importResult && (
          <div style={{ background: importResult.errors.length ? '#FAEEDA' : '#E1F5EE', border: `0.5px solid ${importResult.errors.length ? '#EF9F27' : '#1D9E75'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
            <p style={{ fontWeight: 500, color: importResult.errors.length ? '#633806' : '#085041' }}>
              ✓ {importResult.ok} transaction{importResult.ok > 1 ? 's' : ''} importée{importResult.ok > 1 ? 's' : ''}
              {importResult.errors.length > 0 && ` · ${importResult.errors.length} erreur${importResult.errors.length > 1 ? 's' : ''}`}
            </p>
            {importResult.errors.map((e, i) => (
              <p key={i} style={{ fontSize: 11, color: '#633806', marginTop: 4 }}>{e}</p>
            ))}
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {/* En-tête */}
          <div style={{
            display: 'grid', gridTemplateColumns: cols,
            gap: 8, padding: '10px 16px',
            borderBottom: '0.5px solid var(--border)',
            fontSize: 11, color: 'var(--muted)',
            background: 'var(--bg)',
          }}>
            <span>Date</span>
            {!mobile && <span>Type</span>}
            <span>Actif</span>
            {!mobile && <span style={{ textAlign: 'right' }}>Qté</span>}
            {!mobile && <span style={{ textAlign: 'right' }}>Prix</span>}
            <span style={{ textAlign: 'right' }}>Total</span>
            <span />
          </div>

          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>
          ) : !transactions.length ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucune transaction enregistrée
            </div>
          ) : (
            transactions.map(tx => {
              const total = tx.quantity * tx.price
              const asset = (tx as any).asset
              const account = (tx as any).account
              return (
                <div
                  key={tx.id}
                  style={{
                    display: 'grid', gridTemplateColumns: cols,
                    gap: 8, padding: '10px 16px',
                    borderBottom: '0.5px solid var(--border)',
                    fontSize: 13, alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {format(parseISO(tx.date), mobile ? 'd MMM' : 'd MMM yyyy', { locale: fr })}
                  </span>
                  {!mobile && (
                    <span style={{ fontWeight: 500, color: tx.type === 'achat' ? 'var(--green)' : 'var(--red)' }}>
                      {tx.type === 'achat' ? 'Achat' : 'Vente'}
                    </span>
                  )}
                  <div>
                    <p style={{ fontWeight: 500, fontSize: mobile ? 12 : 13 }}>{asset?.name ?? '–'}</p>
                    <p style={{ fontSize: 10, color: mobile ? (tx.type === 'achat' ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>
                      {mobile
                        ? (tx.type === 'achat' ? 'Achat' : 'Vente')
                        : <>{account?.name} · <span className={`badge ${asset?.category ? getCategoryBadgeClass(asset.category) : ''}`}>{asset?.category ? getCategoryLabel(asset.category) : ''}</span></>
                      }
                    </p>
                  </div>
                  {!mobile && <span style={{ textAlign: 'right', filter: privacy ? 'blur(5px)' : 'none' }}>{tx.quantity.toFixed(4)}</span>}
                  {!mobile && <span style={{ textAlign: 'right', filter: privacy ? 'blur(5px)' : 'none' }}>{formatEur(tx.price)}</span>}
                  <span style={{ textAlign: 'right', fontWeight: 500, filter: privacy ? 'blur(5px)' : 'none' }}>{formatEur(total, 0)}</span>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setEditTx(tx); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteTx(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
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
