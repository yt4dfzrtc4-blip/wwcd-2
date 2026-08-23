'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { ArrowLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function MobilierPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [asset, setAsset] = useState<any>(null)
  const [mobile, setMobile] = useState(false)
  const [editPurchase, setEditPurchase] = useState(false)
  const [newPurchase, setNewPurchase] = useState('')
  const [editCurrent, setEditCurrent] = useState(false)
  const [newCurrent, setNewCurrent] = useState('')
  const [editDate, setEditDate] = useState(false)
  const [newDate, setNewDate] = useState('')

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: ast } = await supabase.from('assets').select('*').eq('id', id).single()
    if (ast) {
      setAsset(ast)
      setNewPurchase(ast.mobilier_purchase_price?.toString() ?? '0')
      setNewCurrent(ast.mobilier_current_value?.toString() ?? '0')
      setNewDate(ast.mobilier_purchase_date ?? '')
    }
  }

  async function savePurchase() {
    const { error } = await supabase.from('assets').update({ mobilier_purchase_price: parseFloat(newPurchase) || 0 }).eq('id', id)
    if (error) { alert(`Échec de l'enregistrement : ${error.message}`); return }
    setEditPurchase(false); loadData()
  }

  async function saveCurrent() {
    const { error } = await supabase.from('assets').update({ mobilier_current_value: parseFloat(newCurrent) || 0 }).eq('id', id)
    if (error) { alert(`Échec de l'enregistrement : ${error.message}`); return }
    setEditCurrent(false); loadData()
  }

  async function saveDate() {
    const { error } = await supabase.from('assets').update({ mobilier_purchase_date: newDate || null }).eq('id', id)
    if (error) { alert(`Échec de l'enregistrement : ${error.message}`); return }
    setEditDate(false); loadData()
  }

  if (!asset) return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  const purchasePrice = asset.mobilier_purchase_price ?? 0
  const currentValue = asset.mobilier_current_value ?? 0
  const pvLatente = currentValue - purchasePrice
  const pvPct = purchasePrice > 0 ? (pvLatente / purchasePrice) * 100 : 0

  const fmt = (v: number, d = 2) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: d })

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
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {asset.mobilier_purchase_date
                ? `Acheté le ${format(parseISO(asset.mobilier_purchase_date), 'd MMMM yyyy', { locale: fr })}`
                : `Ajouté le ${format(parseISO(asset.created_at), 'd MMMM yyyy', { locale: fr })}`}
            </p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: '#F1E7DC', color: '#6B4423' }}>Mobilier</span>
        </div>

        {/* Position */}
        <div style={card}>
          <p style={{ ...lbl, marginBottom: 12 }}>Ma position</p>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>

            <div>
              <p style={lbl}>Prix d&apos;achat</p>
              {editPurchase ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input type="number" step="0.01" value={newPurchase} onChange={e => setNewPurchase(e.target.value)}
                    style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <button onClick={savePurchase} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditPurchase(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(purchasePrice, 0)}</p>
                  <button onClick={() => setEditPurchase(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>

            <div>
              <p style={lbl}>Valeur actuelle estimée</p>
              {editCurrent ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input type="number" step="0.01" value={newCurrent} onChange={e => setNewCurrent(e.target.value)}
                    style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <button onClick={saveCurrent} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditCurrent(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, filter: privacy ? 'blur(7px)' : 'none' }}>{fmt(currentValue, 0)}</p>
                  <button onClick={() => setEditCurrent(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>

            <div>
              <p style={lbl}>Plus-value latente</p>
              <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500, marginTop: 4, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', filter: privacy ? 'blur(7px)' : 'none' }}>
                {pvLatente >= 0 ? '+' : ''}{fmt(pvLatente, 0)}
              </p>
              <p style={{ fontSize: 11, color: pvLatente >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>{pvPct >= 0 ? '+' : ''}{pvPct.toFixed(1)} %</p>
            </div>

            <div>
              <p style={lbl}>Date d&apos;achat</p>
              {editDate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }} autoFocus />
                  <button onClick={saveDate} style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>OK</button>
                  <button onClick={() => setEditDate(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <p style={{ fontSize: mobile ? 16 : 20, fontWeight: 500 }}>
                    {asset.mobilier_purchase_date ? format(parseISO(asset.mobilier_purchase_date), 'd MMM yyyy', { locale: fr }) : '–'}
                  </p>
                  <button onClick={() => setEditDate(true)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>modifier</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>
          💡 Modifiez le <strong>prix d&apos;achat</strong> et la <strong>valeur actuelle estimée</strong> directement ici, quand vous avez une nouvelle estimation (expertise, vente comparable…). Ce bien n&apos;est pas inclus dans l&apos;estimation fiscale de l&apos;onglet Fiscalité — le régime des biens meubles (taxe forfaitaire ou plus-value avec abattement) est trop spécifique pour être estimé de façon fiable ici.
        </div>
      </main>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
