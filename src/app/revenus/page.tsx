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
  const [debugInfo, setDebugInfo] = useState<any>(null)

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
      supabase.from('assets').select('*, prices(*)'),
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*, asset:assets(name, category)').order('date', { ascending: true }),
    ])

    // Auto-fetch dividend info from Yahoo pour les actifs action/ETF (avec timeout 3s)
    const divInfoCache: Record<string, { dividendYield: number | null; frequency: string | null; month: number | null }> = {}
    const tickerAssets = (assets ?? []).filter((a: any) => ['action', 'etf'].includes(a.category) && a.ticker)
    await Promise.all(
      tickerAssets.map(async (a: any) => {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 3000)
          const r = await fetch(`/api/asset-info?ticker=${encodeURIComponent(a.ticker)}`, { signal: controller.signal })
          clearTimeout(timer)
          const d = await r.json()
          divInfoCache[a.id] = { dividendYield: d.dividendYield ?? null, frequency: d.frequency ?? null, month: d.month ?? null }
        } catch {
          divInfoCache[a.id] = { dividendYield: null, frequency: null, month: null }
        }
      })
    )

    // ── DEBUG ── à supprimer après diagnostic
    setDebugInfo({
      livretAccounts: (accounts ?? []).filter((a: any) => a.type === 'livret').map((a: any) => ({ name: a.name, taux: a.livret_rate, balance: a.balance })),
      catAccounts: (accounts ?? []).filter((a: any) => a.type === 'cat').map((a: any) => ({ name: a.name, taux: a.livret_rate, balance: a.balance, echeance: a.cat_maturity_date })),
      livretAssets: (assets ?? []).filter((a: any) => a.category === 'livret').map((a: any) => ({ name: a.name, taux: a.livret_rate, balance: a.livret_balance, mode: a.livret_mode })),
      obligAssets: (assets ?? []).filter((a: any) => a.category === 'obligation').map((a: any) => ({ name: a.name, coupon: a.obligation_coupon, nominal: a.obligation_nominal })),
      txCount: (transactions ?? []).length,
    })

    const result: RevenueItem[] = []

    // ── LIVRETS ── via les comptes de type 'livret'
    for (const acc of (accounts ?? [])) {
      if (acc.type !== 'livret') continue
      const taux = (acc as any).livret_rate ?? 0
      if (!taux) continue

      const txs = (transactions ?? []).filter((t: any) => t.account_id === acc.id)
      let solde = txs.reduce((sum: number, tx: any) => {
        const montant = tx.quantity * tx.price
        if (tx.type === 'achat' || tx.type === 'interets') return sum + montant
        if (tx.type === 'vente') return sum - montant
        return sum
      }, 0)

      // Fallback : solde manuel sur le compte
      if (!solde) solde = (acc as any).balance || 0
      // Fallback : livret_balance sur l'actif lié (même nom)
      if (!solde) {
        const linked = (assets ?? []).find((a: any) => a.category === 'livret' && a.name === acc.name)
        if (linked) solde = (linked as any).livret_balance || 0
      }
      if (!solde) continue

      const annual = solde * (taux / 100)
      const monthly = Array(12).fill(0)
      monthly[11] = annual

      result.push({
        name: acc.name,
        type: 'livret',
        annualAmount: annual,
        monthlyBreakdown: monthly,
        detail: `${solde.toLocaleString('fr-FR')} € × ${taux} %`,
        isEstimate: true,
      })
    }

    // ── LIVRETS (actifs avec livret_balance ou transactions) ──
    for (const asset of (assets ?? [])) {
      if (asset.category !== 'livret') continue
      // Éviter les doublons avec les comptes déjà traités
      const alreadyCounted = result.some(r => r.type === 'livret' && r.name === asset.name)
      if (alreadyCounted) continue

      // Taux : sur l'actif ou sur le compte du même nom
      let taux = (asset as any).livret_rate ?? 0
      if (!taux) {
        const matchingAcc = (accounts ?? []).find((a: any) => a.type === 'livret' && a.name === asset.name)
        taux = (matchingAcc as any)?.livret_rate ?? 0
      }
      if (!taux) continue

      // Solde : livret_balance (mode balance) ou via transactions sur l'actif ou sur le compte
      let solde = (asset as any).livret_balance ?? 0
      if (!solde) {
        const txsByAsset = (transactions ?? []).filter((t: any) => t.asset_id === asset.id)
        solde = txsByAsset.reduce((sum: number, tx: any) => {
          const montant = tx.quantity * tx.price
          if (tx.type === 'achat' || tx.type === 'interets') return sum + montant
          if (tx.type === 'vente') return sum - montant
          return sum
        }, 0)
      }
      if (!solde) {
        const matchingAcc = (accounts ?? []).find((a: any) => a.type === 'livret' && a.name === asset.name)
        if (matchingAcc) {
          const txsByAcc = (transactions ?? []).filter((t: any) => t.account_id === (matchingAcc as any).id)
          solde = txsByAcc.reduce((sum: number, tx: any) => {
            const montant = tx.quantity * tx.price
            if (tx.type === 'achat' || tx.type === 'interets') return sum + montant
            if (tx.type === 'vente') return sum - montant
            return sum
          }, 0) || (matchingAcc as any).balance || 0
        }
      }
      if (!solde) continue

      const annual = solde * (taux / 100)
      const monthly = Array(12).fill(0)
      monthly[11] = annual
      result.push({
        name: asset.name,
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
      if (!taux) continue

      const txs = (transactions ?? []).filter((t: any) => t.account_id === acc.id)
      const capitalFromTx = txs.reduce((sum: number, tx: any) => {
        return tx.type === 'achat' ? sum + tx.quantity * tx.price : sum - tx.quantity * tx.price
      }, 0)
      let capital = capitalFromTx || (acc as any).balance || 0
      // Fallback : chercher l'actif CAT lié par nom
      if (!capital) {
        const linked = (assets ?? []).find((a: any) => a.category === 'cat' && a.name === acc.name)
        if (linked) capital = (linked as any).livret_balance || 0
      }
      if (!capital) continue

      const maturityStr = (acc as any).cat_maturity_date
      const maturity = maturityStr ? new Date(maturityStr) : null

      // Calcul de l'intérêt : si on connaît l'échéance, prorata de la durée ; sinon intérêt annuel
      let interet: number
      let monthly = Array(12).fill(0)
      if (maturity) {
        const openDate = txs.length > 0 ? new Date(txs[0].date) : yearStart
        const duree = differenceInDays(maturity, openDate)
        interet = capital * (taux / 100) * (duree / 365)
        monthly[maturity.getMonth()] = interet
      } else {
        interet = capital * (taux / 100)
        monthly[11] = interet
      }

      result.push({
        name: acc.name,
        type: 'cat',
        annualAmount: interet,
        monthlyBreakdown: monthly,
        detail: `${capital.toLocaleString('fr-FR')} € × ${taux} %${maturity ? ` — échéance ${format(maturity, 'd MMM yyyy', { locale: fr })}` : ''}`,
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

      // Coupons réels reçus cette année (type 'interets' ou 'coupon')
      const realCoupons = txs.filter((t: any) => {
        if (t.type !== 'coupon' && t.type !== 'interets') return false
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
      if (!coupon) continue
      // qty = nominal total détenu en € (la quantité dans les transactions obligation = nominal en €)
      const qty = txs.filter((t: any) => t.type === 'achat').reduce((s: number, t: any) => s + t.quantity, 0)
        - txs.filter((t: any) => t.type === 'vente' || t.type === 'remboursement').reduce((s: number, t: any) => s + t.quantity, 0)
      if (!qty) continue

      const couponAnnuel = qty * (coupon / 100)
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
        detail: `${qty.toLocaleString('fr-FR')} € nominal × ${coupon} % (${freq})`,
        isEstimate: true,
      })
    }

    // ── DIVIDENDES ── réels (transactions type 'dividende') + estimés (dividend_yield sur l'actif)
    const dividendeTxs = (transactions ?? []).filter((t: any) => {
      if (t.type !== 'dividende') return false
      return new Date(t.date).getFullYear() === year
    })

    // Dividendes réels reçus — groupés par actif
    const divRealByAsset: Record<string, { name: string; txs: any[] }> = {}
    for (const tx of dividendeTxs) {
      const assetName = (tx as any).asset?.name ?? tx.asset_id
      if (!divRealByAsset[tx.asset_id]) divRealByAsset[tx.asset_id] = { name: assetName, txs: [] }
      divRealByAsset[tx.asset_id].txs.push(tx)
    }
    const assetsWithRealDiv = new Set(Object.keys(divRealByAsset))

    for (const [, { name, txs: dtxs }] of Object.entries(divRealByAsset)) {
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

    // Dividendes estimés automatiquement depuis Yahoo (ou dividend_yield sur l'actif si renseigné)
    for (const asset of (assets ?? [])) {
      if (assetsWithRealDiv.has(asset.id)) continue
      if (!['action', 'etf'].includes(asset.category)) continue

      const yahooInfo = divInfoCache[asset.id]
      const dyield = yahooInfo?.dividendYield ?? (asset as any).dividend_yield
      if (!dyield) continue

      const freq = yahooInfo?.frequency ?? (asset as any).dividend_frequency ?? 'annuelle'
      const startMonth = Math.max(0, ((yahooInfo?.month ?? (asset as any).dividend_month ?? 1) - 1))

      const txs = (transactions ?? []).filter((t: any) => t.asset_id === asset.id)
      const qty = txs.filter((t: any) => t.type === 'achat').reduce((s: number, t: any) => s + t.quantity, 0)
        - txs.filter((t: any) => t.type === 'vente').reduce((s: number, t: any) => s + t.quantity, 0)
      if (qty <= 0) continue

      // Utiliser le cours actuel, sinon le PRU calculé depuis les transactions
      const rawPrice = (asset as any).prices?.price
      const totalCost = txs.filter((t: any) => t.type === 'achat').reduce((s: number, t: any) => s + t.quantity * t.price, 0)
      const totalQty = txs.filter((t: any) => t.type === 'achat').reduce((s: number, t: any) => s + t.quantity, 0)
      const avgPrice = totalQty > 0 ? totalCost / totalQty : 0
      const currentPrice = rawPrice || avgPrice
      if (!currentPrice) continue

      const annualDiv = qty * currentPrice * (dyield / 100)
      const monthly = Array(12).fill(0)

      if (freq === 'mensuelle') {
        for (let m = 0; m < 12; m++) monthly[m] = annualDiv / 12
      } else if (freq === 'trimestrielle') {
        for (let i = 0; i < 4; i++) monthly[(startMonth + i * 3) % 12] += annualDiv / 4
      } else if (freq === 'semestrielle') {
        monthly[startMonth % 12] += annualDiv / 2
        monthly[(startMonth + 6) % 12] += annualDiv / 2
      } else {
        monthly[startMonth % 12] += annualDiv
      }

      result.push({
        name: asset.name,
        type: 'dividende',
        annualAmount: annualDiv,
        monthlyBreakdown: monthly,
        detail: `${qty} titre(s) × ${currentPrice.toFixed(2)} € × ${dyield} % (${freq}) — Yahoo estimé`,
        isEstimate: true,
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
          💡 Les dividendes sont estimés automatiquement si vous renseignez un <strong>rendement dividende</strong> sur l&apos;actif (Actions & ETF). Pour enregistrer un dividende réel reçu : Transactions → type <strong>Dividende</strong>.
        </div>

        {/* ── BLOC DEBUG TEMPORAIRE ── */}
        {debugInfo && (
          <div style={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: 10, padding: 16, fontSize: 11, fontFamily: 'monospace', color: '#e0e0e0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <p style={{ color: '#ff6b6b', fontWeight: 700, marginBottom: 8 }}>🔧 DEBUG — À SUPPRIMER</p>
            <p style={{ color: '#ffd93d', marginBottom: 4 }}>Comptes livret ({debugInfo.livretAccounts.length}) :</p>
            {debugInfo.livretAccounts.length === 0 && <p style={{ color: '#888' }}>  aucun</p>}
            {debugInfo.livretAccounts.map((a: any, i: number) => (
              <p key={i} style={{ marginLeft: 8 }}>{a.name} · taux={String(a.taux)} · balance={String(a.balance)}</p>
            ))}
            <p style={{ color: '#ffd93d', marginBottom: 4, marginTop: 8 }}>Comptes CAT ({debugInfo.catAccounts.length}) :</p>
            {debugInfo.catAccounts.length === 0 && <p style={{ color: '#888' }}>  aucun</p>}
            {debugInfo.catAccounts.map((a: any, i: number) => (
              <p key={i} style={{ marginLeft: 8 }}>{a.name} · taux={String(a.taux)} · balance={String(a.balance)} · échéance={String(a.echeance)}</p>
            ))}
            <p style={{ color: '#ffd93d', marginBottom: 4, marginTop: 8 }}>Actifs livret ({debugInfo.livretAssets.length}) :</p>
            {debugInfo.livretAssets.length === 0 && <p style={{ color: '#888' }}>  aucun</p>}
            {debugInfo.livretAssets.map((a: any, i: number) => (
              <p key={i} style={{ marginLeft: 8 }}>{a.name} · taux={String(a.taux)} · balance={String(a.balance)} · mode={String(a.mode)}</p>
            ))}
            <p style={{ color: '#ffd93d', marginBottom: 4, marginTop: 8 }}>Actifs obligation ({debugInfo.obligAssets.length}) :</p>
            {debugInfo.obligAssets.length === 0 && <p style={{ color: '#888' }}>  aucun</p>}
            {debugInfo.obligAssets.map((a: any, i: number) => (
              <p key={i} style={{ marginLeft: 8 }}>{a.name} · coupon={String(a.coupon)} · nominal={String(a.nominal)}</p>
            ))}
            <p style={{ color: '#ffd93d', marginTop: 8 }}>Transactions total : {debugInfo.txCount}</p>
          </div>
        )}
      </main>
    </div>
  )
}
