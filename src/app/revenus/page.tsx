'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePrivacy } from '@/hooks/usePrivacy'
import Topbar from '@/components/layout/Topbar'
import { differenceInDays, startOfYear, endOfYear, format } from 'date-fns'
import { fr } from 'date-fns/locale'

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

interface RevenueItem {
  name: string
  category: string
  type: 'livret' | 'cat' | 'obligation' | 'dividende'
  annualAmount: number
  monthlyBreakdown: number[] // 12 valeurs
  detail: string
}

export default function RevenusPage() {
  const supabase = createClient()
  const { privacy, togglePrivacy } = usePrivacy()
  const [items, setItems] = useState<RevenueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const today = new Date()
    const year = today.getFullYear()
    const yearStart = startOfYear(today)
    const yearEnd = endOfYear(today)

    // Charger actifs + transactions + comptes
    const [{ data: assets }, { data: transactions }, { data: accounts }] = await Promise.all([
      supabase.from('assets').select('*'),
      supabase.from('transactions').select('*, asset:assets(*)').order('date', { ascending: true }),
      supabase.from('accounts').select('*'),
    ])

    const result: RevenueItem[] = []

    for (const asset of assets ?? []) {
      // LIVRETS
      if (asset.category === 'livret') {
        const taux = (asset as any).livret_rate ?? 0
        if (!taux) continue

        // Calcul du solde actuel via les transactions
        const txs = (transactions ?? []).filter(t => (t as any).asset_id === asset.id)
        const solde = txs.reduce((sum: number, tx: any) => {
          const montant = tx.quantity * tx.price
          return tx.type === 'achat' || tx.type === 'interets' ? sum + montant : sum - montant
        }, 0)
        if (!solde) continue

        const annual = solde * (taux / 100)
        // Livrets français : crédités au 31 déc
        const monthly = Array(12).fill(0)
        monthly[11] = annual // Décembre
        result.push({
          name: asset.name,
          category: 'livret',
          type: 'livret',
          annualAmount: annual,
          monthlyBreakdown: monthly,
          detail: `${solde.toLocaleString('fr-FR')} € × ${taux} %`,
        })
      }

      // CAT
      if (asset.category === 'cat') {
        // Trouver le compte CAT associé par nom
        const account = (accounts ?? []).find((a: any) => a.name === asset.name && a.type === 'cat')
        if (!account) continue
        const taux = (account as any).livret_rate ?? 0
        const maturityStr = (account as any).cat_maturity_date
        if (!taux || !maturityStr) continue

        const maturity = new Date(maturityStr)
        if (maturity.getFullYear() !== year) continue // Pas cette année

        const txs = (transactions ?? []).filter(t => (t as any).account_id === account.id)
        const capital = txs.reduce((sum: number, tx: any) => {
          const montant = tx.quantity * tx.price
          return tx.type === 'achat' ? sum + montant : sum - montant
        }, 0)
        if (!capital) continue

        const openingDate = txs.length > 0 ? new Date(txs[0].date) : yearStart
        const duree = differenceInDays(maturity, openingDate)
        const interet = capital * (taux / 100) * (duree / 365)

        const monthly = Array(12).fill(0)
        monthly[maturity.getMonth()] = interet
        result.push({
          name: asset.name,
          category: 'cat',
          type: 'cat',
          annualAmount: interet,
          monthlyBreakdown: monthly,
          detail: `${capital.toLocaleString('fr-FR')} € × ${taux} % — échéance ${format(maturity, 'd MMM', { locale: fr })}`,
        })
      }

      // OBLIGATIONS
      if (asset.category === 'obligation') {
        const coupon = (asset as any).obligation_coupon ?? 0
        const nominal = (asset as any).obligation_nominal ?? 0
        const freq = (asset as any).obligation_frequency ?? 'annuelle'
        if (!coupon || !nominal) continue

        // Calcul quantité via transactions
        const txs = (transactions ?? []).filter(t => (t as any).asset_id === asset.id)
        const qty = txs.reduce((sum: number, tx: any) => {
          return tx.type === 'achat' ? sum + tx.quantity : sum - tx.quantity
        }, 0)
        if (!qty) continue

        const couponAnnuel = nominal * qty * (coupon / 100)
        const monthly = Array(12).fill(0)

        if (freq === 'annuelle') {
          monthly[11] = couponAnnuel
        } else if (freq === 'semestrielle') {
          monthly[5] = couponAnnuel / 2
          monthly[11] = couponAnnuel / 2
        } else if (freq === 'trimestrielle') {
          monthly[2] = couponAnnuel / 4
          monthly[5] = couponAnnuel / 4
          monthly[8] = couponAnnuel / 4
          monthly[11] = couponAnnuel / 4
        }

        result.push({
          name: asset.name,
          category: 'obligation',
          type: 'obligation',
          annualAmount: couponAnnuel,
          monthlyBreakdown: monthly,
          detail: `${qty} × ${nominal} € × ${coupon} % (${freq})`,
        })
      }
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

        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Revenus à venir — {new Date().getFullYear()}</h1>

        {/* Total */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Total estimé sur l&apos;année</p>
          <p style={{ fontSize: 32, fontWeight: 500, color: 'var(--green)', filter: privacy ? 'blur(8px)' : 'none' }}>{fmt(totalAnnual)}</p>
        </div>

        {/* Vue mensuelle (barres) */}
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Vue mensuelle</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? 4 : 8, height: 100 }}>
            {monthlyTotals.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%',
                  height: `${(v / maxMonth) * 80}px`,
                  minHeight: v > 0 ? 3 : 0,
                  background: 'var(--green)',
                  borderRadius: 3,
                  opacity: 0.8,
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
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>
          ) : !items.length ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucun revenu calculable — ajoutez des livrets, CAT ou obligations avec leur taux
            </div>
          ) : items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderBottom: '0.5px solid var(--border)',
              fontSize: 13,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: `${typeColors[item.type]}22`, color: typeColors[item.type] }}>
                    {typeLabels[item.type]}
                  </span>
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

        {/* Détail mensuel */}
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
                      <span>{it.name}</span>
                      <span style={{ filter: privacy ? 'blur(5px)' : 'none' }}>{fmtD(it.monthlyBreakdown[mi])}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
