'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { differenceInDays, format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

interface RevenueItem {
  name: string
  type: 'livret' | 'cat' | 'obligation' | 'dividende'
  annualAmount: number
  monthlyBreakdown: number[]
  detail: string
  isEstimate: boolean
}

export default function RevenusPage() {
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [items, setItems] = useState<RevenueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date()
    const year = today.getFullYear()
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31)

    const [{ data: assets }, { data: accounts }, { data: transactions }] = await Promise.all([
      supabase.from('assets').select('*'),
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*, asset:assets(name, category)').order('date', { ascending: true }),
    ])

    const result: RevenueItem[] = []

    // ── LIVRETS ── via les comptes de type 'livret'
    for (const acc of (accounts ?? [])) {
      if (acc.type !== 'livret') continue
      const taux = (acc as any).livret_rate ?? 0
      if (!taux) continue

      const txs = (transactions ?? []).filter((t: any) => t.account_id === acc.id)
      const solde = txs.reduce((sum: number, tx: any) => {
        const montant = tx.quantity * tx.price
        if (tx.type === 'achat' || tx.type === 'interets') return sum + montant
        if (tx.type === 'vente') return sum - montant
        return sum
      }, 0)
      if (!solde) continue

      const annual = solde * (taux / 100)
      const monthly = Array(12).fill(0)
      monthly[11] = annual // Livrets français : 31 déc

      result.push({
        name: acc.name,
        type: 'livret',
        annualAmount: annual,
        monthlyBreakdown: monthly,
        detail: `${solde.toLocaleString('fr-FR')} € × ${taux} %`,
        isEstimate: true,
      })
    }

    // ── CAT ── via les comptes de type 'cat'
    for (const acc of (accounts ?? [])) {
      if (acc.type !== 'cat') continue
      const taux = (acc as any).livret_rate ?? 0
      const maturityStr = (acc as any).cat_maturity_date
      if (!taux || !maturityStr) continue

      const maturity = new Date(maturityStr)
      if (maturity.getFullYear() !== year) continue

      const txs = (transactions ?? []).filter((t: any) => t.account_id === acc.id)
      const capital = txs.reduce((sum: number, tx: any) => {
        return tx.type === 'achat' ? sum + tx.quantity * tx.price : sum - tx.quantity * tx.price
      }, 0)
      if (!capital) continue

      const openDate = txs.length > 0 ? new Date(txs[0].date) : yearStart
      const duree = differenceInDays(maturity, openDate)
      const interet = capital * (taux / 100) * (duree / 365)

      const monthly = Array(12).fill(0)
      monthly[maturity.getMonth()] = interet

      result.push({
        name: acc.name,
        type: 'cat',
        annualAmount: interet,
        monthlyBreakdown: monthly,
        detail: `${capital.toLocaleString('fr-FR')} € × ${taux} % — échéance ${format(maturity, 'd MMM', { locale: fr })}`,
        isEstimate: true,
      })
    }

    // ── OBLIGATIONS ── coupons estimés + coupons déjà reçus cette année
    for (const asset of (assets ?? [])) {
      if (asset.category !== 'obligation') continue
      const coupon = (asset as any).obligation_coupon ?? 0
      const nominal = (asset as any).obligation_nominal ?? 0
      const freq = (asset as any).obligation_frequency ?? 'annuelle'

      const txs = (transactions ?? []).filter((t: any) => t.asset_id === asset.id)

      // Coupons réels reçus cette année
      const realCoupons = txs.filter((t: any) => {
        if (t.type !== 'coupon') return false
        const d = new Date(t.date)
        return d.getFullYear() === year
      })

      if (realCoupons.length > 0) {
        const monthly = Array(12).fill(0)
        realCoupons.forEach((t: any) => { monthly[new Date(t.date).getMonth()] += t.quantity * t.price })
        const annual = realCoupons.reduce((s: number, t: any) => s + t.quantity * t.price, 0)
        result.push({
          name: asset.name,
          type: 'obligation',
          annualAmount: annual,
          monthlyBreakdown: monthly,
          detail: `${realCoupons.length} coupon(s) enregistré(s) en ${year}`,
          isEstimate: false,
        })
        continue
      }

      // Estimation si pas encore de coupons enregistrés
      if (!coupon || !nominal) continue
      const qty = txs.filter((t: any) => t.type === 'achat').reduce((s: number, t: any) => s + t.quantity, 0)
        - txs.filter((t: any) => t.type === 'vente' || t.type === 'remboursement').reduce((s: number, t: any) => s + t.quantity, 0)
      if (!qty) continue

      const couponAnnuel = nominal * qty * (coupon / 100)
      const monthly = Array(12).fill(0)
      const freqDiv = freq === 'semestrielle' ? 2 : freq === 'trimestrielle' ? 4 : 1
      if (freq === 'semestrielle') { monthly[5] = couponAnnuel / 2; monthly[11] = couponAnnuel / 2 }
      else if (freq === 'trimestrielle') { monthly[2] = monthly[5] = monthly[8] = monthly[11] = couponAnnuel / 4 }
      else monthly[11] = couponAnnuel

      result.push({
        name: asset.name,
        type: 'obligation',
        annualAmount: couponAnnuel,
        monthlyBreakdown: monthly,
        detail: `${qty} titre(s) × ${nominal} € × ${coupon} % (${freq})`,
        isEstimate: true,
      })
    }

    // ── DIVIDENDES ── transactions de type 'dividende' cette année
    const dividendeTxs = (transactions ?? []).filter((t: any) => {
      if (t.type !== 'dividende') return false
      return new Date(t.date).getFullYear() === year
    })

    // Grouper par actif
    const divByAsset: Record<string, { name: string; txs: any[] }> = {}
    for (const tx of dividendeTxs) {
      const assetName = (tx as any).asset?.name ?? tx.asset_id
      if (!divByAsset[tx.asset_id]) divByAsset[tx.asset_id] = { name: assetName, txs: [] }
      divByAsset[tx.asset_id].txs.push(tx)
    }

    for (const [, { name, txs: dtxs }] of Object.entries(divByAsset)) {
      const monthly = Array(12).fill(0)
      dtxs.forEach((t: any) => { monthly[new Date(t.date).getMonth()] += t.quantity * t.price })
      const annual = dtxs.reduce((s: number, t: any) => s + t.quantity * t.price, 0)
      result.push({
        name,
        type: 'dividende',
        annualAmount: annual,
        monthlyBreakdown: monthly,
        detail: `${dtxs.length} dividende(s) enregistré(s) en ${year}`,
        isEstimate: false,
      })
    }

    result.sort((a, b) => b.annualAmount - a.annualAmount)
    setItems(result)
    setLoading(false)
  }

  const totalAnnual = items.reduce((s, i) => s + i.annualAmount, 0)
  const monthlyTotals = Array(12).fill(0).map((_, m) => items.reduce((s, i) => s + i.monthlyBreakdown[m], 0))
  const maxMonth = Math.max(...monthlyTotals, 1)

  const fmt = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const fmtD = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

  const typeColors: Record<string, string> = {
    livret: 'var(--green)',
    cat: '#BA7517',
    obligation: '#D85A30',
    dividende: 'var(--brand)',
  }
  const typeLabels: Record<string, string> = {
    livret: 'Livret',
    cat: 'CAT',
    obligation: 'Obligation',
    dividende: 'Dividende',
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={togglePrivacy} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Revenus — {new Date().getFullYear()}</h1>
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>Estimés + réels</p>
        </div>

        {/* Total */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Total estimé sur l&apos;année
          </p>
          <p style={{ fontSize: 32, fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(8px)' : 'none' }}>{fmt(totalAnnual)}</p>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            {(['livret','cat','obligation','dividende'] as const).map(t => {
              const total = items.filter(i => i.type === t).reduce((s, i) => s + i.annualAmount, 0)
              if (!total) return null
              return (
                <span key={t} style={{ fontSize: 12, color: typeColors[t] }}>
                  {typeLabels[t]} : {fmtD(total)}
                </span>
              )
            })}
          </div>
        </div>

        {/* Vue mensuelle */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Vue mensuelle</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? 3 : 8, height: 100 }}>
            {monthlyTotals.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: `${(v / maxMonth) * 80}px`,
                  minHeight: v > 0 ? 3 : 0,
                  background: 'var(--green)', borderRadius: 3, opacity: 0.8,
                  filter: privacy ? 'blur(4px)' : 'none',
                }} />
                <span style={{ fontSize: 9, color: 'var(--muted)' }}>{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Détail par actif */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Détail par actif ({items.length})
            </p>
          </div>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>
          ) : !items.length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucun revenu — ajoutez des livrets/CAT avec taux, des obligations avec coupon, ou enregistrez des dividendes
            </div>
          ) : items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: `${typeColors[item.type]}22`, color: typeColors[item.type] }}>
                    {typeLabels[item.type]}
                  </span>
                  {item.isEstimate && <span style={{ fontSize: 10, color: 'var(--muted)' }}>estimé</span>}
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.detail}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(6px)' : 'none' }}>{fmtD(item.annualAmount)}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {totalAnnual > 0 ? `${((item.annualAmount / totalAnnual) * 100).toFixed(1)} %` : '–'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Calendrier des paiements */}
        {items.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calendrier des paiements</p>
            </div>
            {MONTHS.map((month, mi) => {
              const total = monthlyTotals[mi]
              if (!total) return null
              return (
                <div key={mi} style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{month} {new Date().getFullYear()}</span>
                    <span style={{ fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(6px)' : 'none' }}>{fmtD(total)}</span>
                  </div>
                  {items.filter(it => it.monthlyBreakdown[mi] > 0).map(it => (
                    <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', paddingLeft: 8 }}>
                      <span>{it.name} <span style={{ color: typeColors[it.type] }}>·</span> {typeLabels[it.type]}</span>
                      <span style={{ filter: privacy ? 'blur(5px)' : 'none' }}>{fmtD(it.monthlyBreakdown[mi])}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Note dividendes */}
        <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>
          💡 Pour enregistrer un dividende : Transactions → Nouvelle transaction → type <strong>Dividende</strong> → sélectionner l&apos;actif + montant
        </div>
      </main>
    </div>
  )
}
