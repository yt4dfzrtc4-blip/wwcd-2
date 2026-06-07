'use client'

import { usePrivacy } from '@/hooks/usePrivacy'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatEur, getCategoryLabel, getCategoryBadgeClass } from '@/lib/portfolio'
import type { Transaction } from '@/types'
import Topbar from '@/components/layout/Topbar'
import TransactionModal from '@/components/ui/TransactionModal'
import { Plus, Pencil, Trash2, Download, Upload, ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { useRef } from 'react'

const TX_LABEL: Record<string, string> = {
  achat: 'Achat', vente: 'Vente', dividende: 'Dividende',
  interets: 'Intérêts', coupon: 'Coupon', remboursement: 'Remboursement',
}
const TX_COLOR: Record<string, string> = {
  achat: 'var(--brand)', vente: 'var(--red)', dividende: 'var(--green)',
  interets: 'var(--green)', coupon: '#EF9F27', remboursement: 'var(--green)',
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const { privacy, togglePrivacy } = usePrivacy()
  const [showModal, setShowModal] = useState(false)
  const [editTx, setEditTx] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [importResult, setImportResult] = useState<{ ok: number; skipped: number; errors: string[] } | null>(null)
  const [showImportInfo, setShowImportInfo] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [removingDupes, setRemovingDupes] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: assets }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('user_id', user.id),
      supabase.from('accounts').select('id, name').eq('user_id', user.id),
    ])

    // Convertir un nombre FR (1 234,56 ou 1234.56) en float
    function parseFR(val: any): number {
      if (typeof val === 'number') return val
      return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'))
    }

    // Convertir une date dd/mm/yyyy, yyyy-mm-dd, ou serial Excel en yyyy-mm-dd
    function parseDate(val: any): string {
      if (typeof val === 'number') {
        // Serial Excel → date JS
        const d = XLSX.SSF.parse_date_code(val)
        return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
      const s = String(val).trim()
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y] = s.split('/'); return `${y}-${m}-${d}` }
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { const [d,m,y] = s.split('-'); return `${y}-${m}-${d}` }
      return s
    }

    // Lire les lignes selon le type de fichier
    let rows: any[][] = []
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
    } else {
      const text = (await file.text()).replace(/^﻿/, '')
      const sep = text.split('\n')[0]?.includes(';') ? ';' : ','
      rows = text.split(/\r?\n/).map(line => {
        const cols: string[] = []
        let cur = '', inQ = false
        for (const ch of line) {
          if (ch === '"') inQ = !inQ
          else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = '' }
          else cur += ch
        }
        cols.push(cur.trim())
        return cols
      })
    }

    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''))

    // Charger TOUTES les transactions existantes pour déduplication (pagination)
    const allExisting: any[] = []
    let exFrom = 0
    while (true) {
      const { data: exPage } = await supabase
        .from('transactions')
        .select('date, type, asset_id, account_id, quantity, price')
        .eq('user_id', user.id)
        .range(exFrom, exFrom + 999)
      if (!exPage || exPage.length === 0) break
      allExisting.push(...exPage)
      if (exPage.length < 1000) break
      exFrom += 1000
    }

    const existingSet = new Set(
      allExisting.map(t => `${t.date}|${t.type}|${t.asset_id}|${t.account_id}|${t.quantity}|${t.price}`)
    )

    let ok = 0, skipped = 0
    const errors: string[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const [rawDate, type, assetName, , accountName, rawQty, rawPrice] = dataRows[i]
      const date = parseDate(rawDate)
      const qty = parseFR(rawQty)
      const price = parseFR(rawPrice)

      const asset = assets?.find(a => a.name.toLowerCase() === String(assetName).toLowerCase().trim())
      const account = accounts?.find(a => a.name.toLowerCase() === String(accountName).toLowerCase().trim())

      if (!asset) { errors.push(`Ligne ${i + 2} — Actif introuvable : "${assetName}"`); continue }
      if (!account) { errors.push(`Ligne ${i + 2} — Compte introuvable : "${accountName}"`); continue }
      if (!date || isNaN(qty) || isNaN(price)) { errors.push(`Ligne ${i + 2} — Données manquantes ou invalides`); continue }

      const txType = String(type).toLowerCase().trim()
      const validType = ['achat', 'vente', 'dividende', 'interets'].includes(txType) ? txType : 'achat'

      // Déduplication
      const key = `${date}|${validType}|${asset.id}|${account.id}|${qty}|${price}`
      if (existingSet.has(key)) { skipped++; continue }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id, asset_id: asset.id, account_id: account.id,
        type: validType, date, quantity: qty, price,
      })
      if (error) errors.push(`Ligne ${i + 2} — Erreur : ${error.message}`)
      else { ok++; existingSet.add(key) }
    }

    setImportResult({ ok, skipped, errors })
    setImporting(false)
    e.target.value = ''
    if (ok > 0) loadData()
  }

  function buildExportData() {
    const header = ['Date', 'Type', 'Actif', 'Catégorie', 'Compte', 'Quantité', 'Prix unitaire', 'Total']
    const rows = transactions.map(tx => {
      const asset = (tx as any).asset
      const account = (tx as any).account
      const [y, m, d] = tx.date.split('-')
      const typeLabel = TX_LABEL[tx.type] ?? tx.type
      return [
        `${d}/${m}/${y}`,
        typeLabel,
        asset?.name ?? '',
        asset?.category ?? '',
        account?.name ?? '',
        tx.quantity,
        tx.price,
        tx.quantity * tx.price,
      ]
    })
    return { header, rows }
  }

  async function removeDuplicates() {
    if (!confirm('Supprimer tous les doublons de transactions ? Cette action est irréversible.')) return
    setRemovingDupes(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Charger toutes les transactions
    const all: any[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase.from('transactions')
        .select('id, date, type, asset_id, account_id, quantity, price')
        .eq('user_id', user.id).order('created_at', { ascending: true }).range(from, from + 999)
      if (!page || page.length === 0) break
      all.push(...page)
      if (page.length < 1000) break
      from += 1000
    }

    const seen = new Set<string>()
    const toDelete: string[] = []
    for (const t of all) {
      const key = `${t.date}|${t.type}|${t.asset_id}|${t.account_id}|${t.quantity}|${t.price}`
      if (seen.has(key)) toDelete.push(t.id)
      else seen.add(key)
    }

    if (toDelete.length === 0) { alert('Aucun doublon trouvé.'); setRemovingDupes(false); return }

    // Supprimer par lots de 100
    for (let i = 0; i < toDelete.length; i += 100) {
      await supabase.from('transactions').delete().in('id', toDelete.slice(i, i + 100))
    }

    alert(`${toDelete.length} doublon(s) supprimé(s).`)
    setRemovingDupes(false)
    loadData()
  }

  function exportXLSX() {
    const { header, rows } = buildExportData()
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    // Largeurs de colonnes
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `wwcd-transactions-${new Date().toISOString().split('T')[0]}.xlsx`)
    setShowExportMenu(false)
  }

  function exportCSV() {
    const { header, rows } = buildExportData()
    const fmtNum = (n: number) => n.toFixed(4).replace('.', ',')
    const csvRows = [header, ...rows.map(r => r.map((v, i) => i >= 5 ? fmtNum(Number(v)) : v))]
    const csv = csvRows.map(r => r.map(v => `"${v}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wwcd-transactions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  const cols = mobile
    ? '80px 1fr 80px 50px'
    : '95px 60px 1fr 90px 90px 90px 60px'

  const filtered = search.trim()
    ? transactions.filter(tx => {
        const q = search.toLowerCase()
        const asset = (tx as any).asset
        const account = (tx as any).account
        return asset?.name?.toLowerCase().includes(q) || account?.name?.toLowerCase().includes(q)
      })
    : transactions

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Transactions</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Bouton Import */}
            <button onClick={() => setShowImportInfo(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--surface)', color: importing ? 'var(--brand)' : 'var(--muted)',
              border: '0.5px solid var(--border)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <Upload size={14} /> {!mobile && (importing ? 'Import…' : 'Importer')}
            </button>
            <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={importFile} style={{ display: 'none' }} />

            {/* Bouton supprimer doublons */}
            <button onClick={removeDuplicates} disabled={removingDupes} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--red)',
              border: '0.5px solid var(--border)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              {removingDupes ? 'Nettoyage…' : '✕ Doublons'}
            </button>

            {/* Bouton Export avec menu */}
            {transactions.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowExportMenu(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--surface)', color: 'var(--muted)',
                  border: '0.5px solid var(--border)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <Download size={14} /> {!mobile && 'Exporter'} <ChevronDown size={12} />
                </button>
                {showExportMenu && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                    <button onClick={exportXLSX} style={{ display: 'block', width: '100%', padding: '10px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      📊 Excel (.xlsx)
                    </button>
                    <button onClick={exportCSV} style={{ display: 'block', width: '100%', padding: '10px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text)', borderTop: '0.5px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      📄 CSV (.csv)
                    </button>
                  </div>
                )}
              </div>
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

        {/* Recherche */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un actif ou un compte…"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', marginBottom: 12, outline: 'none', fontFamily: 'var(--font-sans)' }}
        />

        {importResult && (
          <div style={{ background: importResult.errors.length ? '#FAEEDA' : '#E1F5EE', border: `0.5px solid ${importResult.errors.length ? '#EF9F27' : '#1D9E75'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
            <p style={{ fontWeight: 500, color: importResult.errors.length ? '#633806' : '#085041' }}>
              ✓ {importResult.ok} importée{importResult.ok > 1 ? 's' : ''}
              {importResult.skipped > 0 && <span style={{ fontWeight: 400 }}> · {importResult.skipped} doublon{importResult.skipped > 1 ? 's' : ''} ignoré{importResult.skipped > 1 ? 's' : ''}</span>}
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
          ) : !filtered.length ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucun résultat pour &quot;{search}&quot;
            </div>
          ) : (
            filtered.map(tx => {
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
                    <span style={{ fontWeight: 500, color: TX_COLOR[tx.type] ?? 'var(--muted)' }}>
                      {TX_LABEL[tx.type] ?? tx.type}
                    </span>
                  )}
                  <div>
                    <p style={{ fontWeight: 500, fontSize: mobile ? 12 : 13 }}>{asset?.name ?? '–'}</p>
                    <p style={{ fontSize: 10, color: mobile ? (TX_COLOR[tx.type] ?? 'var(--muted)') : 'var(--muted)' }}>
                      {mobile
                        ? (TX_LABEL[tx.type] ?? tx.type)
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

      {/* Modale info avant import */}
      {showImportInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, border: '0.5px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Format d&apos;import</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Fichiers acceptés : <strong>.xlsx, .xls, .csv</strong>. Les colonnes doivent être dans cet ordre :
            </p>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 12, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              Date · Type · Actif · Catégorie · Compte · Quantité · Prix unitaire · Total
            </div>
            <ul style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              <li><strong>Date</strong> : dd/mm/yyyy ou yyyy-mm-dd</li>
              <li><strong>Type</strong> : Achat, Vente, Dividende, Interets</li>
              <li><strong>Actif / Compte</strong> : nom exact tel qu&apos;il existe dans l&apos;app</li>
              <li><strong>Quantité / Prix</strong> : nombres (virgule ou point acceptés)</li>
              <li><strong>Catégorie / Total</strong> : colonnes ignorées à l&apos;import</li>
            </ul>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              💡 Les doublons (même date, type, actif, compte, quantité et prix) sont automatiquement ignorés.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowImportInfo(false)} style={{ padding: 10, borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Annuler
              </button>
              <button onClick={() => { setShowImportInfo(false); importInputRef.current?.click() }} style={{ padding: 10, borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Choisir un fichier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
