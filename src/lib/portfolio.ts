import type { Transaction, Position, Asset, Account, PortfolioSummary } from '@/types'

/**
 * Calcule le PRU (Prix de Revient Unitaire) pondéré moyen
 * et la quantité totale à partir d'une liste de transactions.
 */
export function calculatePosition(transactions: Transaction[]): {
  quantity: number
  averagePrice: number
  investedValue: number
} {
  let quantity = 0
  let totalCost = 0

  const sorted = [...transactions].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  for (const tx of sorted) {
    if (tx.type === 'achat' || tx.type === 'interets') {
      // Intérêts (livrets, CAT) : traités comme un dépôt — l'argent gagné
      // reste dans la position, exactement comme un achat.
      totalCost += tx.quantity * tx.price
      quantity += tx.quantity
    } else if (tx.type === 'vente' || tx.type === 'remboursement') {
      // Vente : on réduit la quantité, le PRU ne change pas
      const soldRatio = tx.quantity / quantity
      totalCost -= totalCost * soldRatio
      quantity -= tx.quantity
    }
  }

  if (quantity <= 0) return { quantity: 0, averagePrice: 0, investedValue: 0 }

  return {
    quantity,
    averagePrice: totalCost / quantity,
    investedValue: totalCost,
  }
}

/**
 * Construit toutes les positions ouvertes depuis les transactions.
 */
export function buildPositions(
  transactions: Transaction[],
  assets: Asset[],
  accounts: Account[]
): Position[] {
  const assetMap = new Map(assets.map(a => [a.id, a]))
  const accountMap = new Map(accounts.map(a => [a.id, a]))

  // Grouper les transactions par (asset_id, account_id)
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = `${tx.asset_id}__${tx.account_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  const positions: Position[] = []

  // Passe 1 : actifs NON-obligations via transactions
  for (const [key, txs] of groups) {
    const [assetId, accountId] = key.split('__')
    const asset = assetMap.get(assetId)
    if (!asset) continue
    if (asset.category === 'obligation') continue  // obligations gérées séparément

    const account = accountMap.get(accountId) ?? {
      id: accountId ?? 'unknown',
      name: 'Compte inconnu',
      type: 'autre',
      created_at: '',
      user_id: '',
    } as Account

    const { quantity, averagePrice, investedValue } = calculatePosition(txs)
    if (quantity <= 0) continue

    const currentPrice = asset.prices?.price || averagePrice
    const currentValue = quantity * currentPrice
    // Résidu de rounding après une liquidation quasi-totale (ex: somme de dizaines
    // d'achats/ventes en 6 décimales qui ne retombe pas exactement sur 0) : on
    // ignore les positions dont la valeur est négligeable plutôt que d'afficher
    // une ligne fantôme à "0 €".
    if (currentValue < 0.05) continue
    const pnl = currentValue - investedValue
    const pnlPct = investedValue > 0 ? (pnl / investedValue) * 100 : 0
    const dayChangePct = asset.prices?.change_pct ?? 0
    const dayChange = currentValue * (dayChangePct / 100)

    positions.push({
      asset,
      account,
      quantity,
      average_price: averagePrice,
      current_price: currentPrice,
      current_value: currentValue,
      invested_value: investedValue,
      pnl,
      pnl_pct: pnlPct,
      day_change: dayChange,
      day_change_pct: dayChangePct,
    })
  }

  // Passe 2 : obligations directement via obligation_nominal (modèle simplifié)
  const obligAccount = accounts.find(a => (a as any).type === 'obligations')
    ?? { id: 'unknown', name: 'Obligations', type: 'autre', created_at: '', user_id: '' } as Account

  for (const asset of assets) {
    if (asset.category !== 'obligation') continue
    const nominal = (asset as any).obligation_nominal ?? 0
    if (!nominal) continue

    // Prix d'achat moyen en % (ex: 98.5 → 0.985)
    const avgPricePct = (asset as any).obligation_avg_price ?? 100
    const avgPrice = avgPricePct / 100
    const investedValue = nominal * avgPrice

    // Valeur actuelle : nominal (les obligations cotent près du pair sans prix live)
    const currentValue = nominal

    positions.push({
      asset,
      account: obligAccount,
      quantity: nominal,
      average_price: avgPrice,
      current_price: 1.0,
      current_value: currentValue,
      invested_value: investedValue,
      pnl: currentValue - investedValue,
      pnl_pct: investedValue > 0 ? ((currentValue - investedValue) / investedValue) * 100 : 0,
      day_change: 0,
      day_change_pct: 0,
    })
  }

  // Passe 3 : créances — valeur = capital initial - remboursements reçus
  // Compte/banque virtuels (non persistés en base) : `virtual` + `detailPath` permettent
  // aux pages consommatrices (dashboard) de router vers le détail sans connaître "créances"
  // spécifiquement — un futur regroupement (ex: immobilier) suivra le même contrat.
  const creanceAccount = {
    id: 'creances', name: 'Créances', type: 'autre', created_at: '', user_id: '',
    virtual: true, detailPath: '/creances',
    bank: { id: 'creances-bank', name: 'Créances', user_id: '', created_at: '', virtual: true, detailPath: '/creances' },
  } as any as Account

  for (const asset of assets) {
    if (asset.category !== 'creance') continue
    const initial = (asset as any).creance_initial ?? 0
    if (!initial) continue

    // Somme des remboursements sur cet actif
    const txs = transactions.filter(t => t.asset_id === asset.id && t.type === 'remboursement')
    const repaid = txs.reduce((s, t) => s + t.quantity * t.price, 0)
    const currentValue = Math.max(0, initial - repaid)

    const acc = creanceAccount

    positions.push({
      asset,
      account: acc,
      quantity: 1,
      average_price: initial,
      current_price: currentValue,
      current_value: currentValue,
      invested_value: initial,
      pnl: currentValue - initial,
      pnl_pct: initial > 0 ? ((currentValue - initial) / initial) * 100 : 0,
      day_change: 0,
      day_change_pct: 0,
    })
  }

  // Passe 4 : mobilier (montres, art…) — pas de cours ni de transactions,
  // juste un prix d'achat et une valeur actuelle estimée mise à jour à la main.
  const mobilierAccount = {
    id: 'mobilier', name: 'Mobilier', type: 'autre', created_at: '', user_id: '',
    virtual: true, detailPath: '/mobilier',
    bank: { id: 'mobilier-bank', name: 'Mobilier', user_id: '', created_at: '', virtual: true, detailPath: '/mobilier' },
  } as any as Account

  for (const asset of assets) {
    if (asset.category !== 'mobilier') continue
    const purchasePrice = (asset as any).mobilier_purchase_price ?? 0
    const currentValue = (asset as any).mobilier_current_value ?? purchasePrice
    if (!purchasePrice && !currentValue) continue

    positions.push({
      asset,
      account: mobilierAccount,
      quantity: 1,
      average_price: purchasePrice,
      current_price: currentValue,
      current_value: currentValue,
      invested_value: purchasePrice,
      pnl: currentValue - purchasePrice,
      pnl_pct: purchasePrice > 0 ? ((currentValue - purchasePrice) / purchasePrice) * 100 : 0,
      day_change: 0,
      day_change_pct: 0,
    })
  }

  // Tri par valorisation décroissante
  return positions.sort((a, b) => b.current_value - a.current_value)
}

/**
 * Calcule le résumé global du patrimoine.
 */
export function buildPortfolioSummary(positions: Position[]): PortfolioSummary {
  let totalValue = 0
  let totalInvested = 0
  let dayChange = 0
  const byCategory: Record<string, number> = {}
  const byAccount: Record<string, number> = {}

  for (const pos of positions) {
    totalValue += pos.current_value
    totalInvested += pos.invested_value
    dayChange += pos.day_change

    const cat = pos.asset.category
    byCategory[cat] = (byCategory[cat] ?? 0) + pos.current_value

    const acc = pos.account.name
    byAccount[acc] = (byAccount[acc] ?? 0) + pos.current_value
  }

  const totalPnl = totalValue - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const dayChangePct = totalValue > 0 ? (dayChange / totalValue) * 100 : 0

  return {
    total_value: totalValue,
    total_invested: totalInvested,
    total_pnl: totalPnl,
    total_pnl_pct: totalPnlPct,
    day_change: dayChange,
    day_change_pct: dayChangePct,
    positions,
    by_category: byCategory as any,
    by_account: byAccount,
  }
}

/**
 * Formatte un montant en euros.
 */
export function formatEur(value: number, decimals = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Formatte un pourcentage.
 */
export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)} %`
}

/**
 * Label et couleur lisibles pour un type de transaction. Toujours utiliser
 * cette table plutôt qu'un ternaire achat/vente : les types dividende/interets/
 * coupon/remboursement existent depuis longtemps et un ternaire binaire les
 * fait passer pour des "Vente" à tort.
 */
export const TX_TYPE_LABELS: Record<string, string> = {
  achat: 'Achat',
  vente: 'Vente',
  dividende: 'Dividende',
  interets: 'Intérêts',
  coupon: 'Coupon',
  remboursement: 'Remboursement',
}

export const TX_TYPE_COLORS: Record<string, string> = {
  achat: 'var(--brand)',
  vente: 'var(--red)',
  dividende: 'var(--green)',
  interets: 'var(--green)',
  coupon: '#EF9F27',
  remboursement: 'var(--green)',
}

/**
 * Label lisible pour une catégorie.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  action: 'Actions',
  etf: 'ETF',
  crypto: 'Cryptos',
  obligation: 'Obligations',
  livret: 'Livrets',
  cat: 'CAT',
  per: 'PER',
  or: 'Or',
  creance: 'Créances',
  mobilier: 'Mobilier',
  autre: 'Autre',
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#B4B2A9'
}

export function getCategoryBadgeClass(category: string): string {
  return CATEGORY_LABELS[category] ? `badge-${category}` : 'badge-autre'
}

/**
 * Route de détail d'une position. Livrets et CAT ont des pages dédiées
 * indexées par l'ID du COMPTE (pas de l'actif) — s'y tromper amène sur la
 * fiche actif générique (PRU/Quantité, Achat/Vente/Dividende) au lieu de la
 * page adaptée (Solde, Dépôt/Retrait/Intérêts).
 */
export function getPositionDetailPath(pos: Position): string {
  if (pos.asset.category === 'creance') return `/creances/${pos.asset.id}`
  if (pos.asset.category === 'mobilier') return `/mobilier/${pos.asset.id}`
  if (pos.account.type === 'livret') return `/livrets/${pos.account.id}`
  if (pos.account.type === 'cat') return `/cat/${pos.account.id}`
  return `/assets/${pos.asset.id}`
}

/**
 * Estimation fiscale — impôt latent sur les plus-values non réalisées si le
 * portefeuille était liquidé aujourd'hui. Approximation volontairement simple,
 * pas un conseil fiscal :
 * - PFU (flat tax) : 12,8 % IR + 18,6 % prélèvements sociaux = 31,4 %.
 * - PEA détenu depuis ≥ 5 ans (`account.opened_at`) : IR exonéré, seuls les
 *   18,6 % de prélèvements sociaux s'appliquent.
 * - Livrets réglementés (Livret A/LDDS) : exonérés — approximation, ne
 *   distingue pas un livret bancaire non réglementé qui serait taxable.
 * - PER, Or physique et Mobilier (montres, art…) : régimes de sortie/plus-value
 *   spécifiques (taxe forfaitaire, abattement pour durée de détention…), non
 *   estimés ici plutôt que de risquer un chiffre faux (`excluded: true`).
 */
export const PFU_IR_RATE = 0.128
export const PFU_SOCIAL_RATE = 0.186
export const PFU_TOTAL_RATE = PFU_IR_RATE + PFU_SOCIAL_RATE
const PEA_EXEMPTION_YEARS = 5

export function isPeaMature(account: Account, asOf: Date = new Date()): boolean {
  const openedAt = (account as any).opened_at as string | undefined
  if (!openedAt) return false
  const opened = new Date(openedAt)
  const maturity = new Date(opened)
  maturity.setFullYear(maturity.getFullYear() + PEA_EXEMPTION_YEARS)
  return asOf >= maturity
}

export interface PositionTaxEstimate {
  rate: number
  taxableGain: number
  tax: number
  excluded: boolean
}

export function estimatePositionTax(pos: Position): PositionTaxEstimate {
  const taxableGain = Math.max(0, pos.pnl)
  const category = pos.asset.category

  if (category === 'per' || category === 'or' || category === 'mobilier') {
    return { rate: 0, taxableGain, tax: 0, excluded: true }
  }
  if (category === 'livret') {
    return { rate: 0, taxableGain, tax: 0, excluded: false }
  }

  let rate = PFU_TOTAL_RATE
  if ((category === 'action' || category === 'etf') && pos.account.type === 'pea') {
    rate = isPeaMature(pos.account) ? PFU_SOCIAL_RATE : PFU_TOTAL_RATE
  }

  return { rate, taxableGain, tax: taxableGain * rate, excluded: false }
}

export interface PortfolioTaxSummary {
  totalTax: number
  taxableValue: number
  excludedValue: number
  byPosition: Array<{ position: Position; estimate: PositionTaxEstimate }>
}

export function estimatePortfolioTax(positions: Position[]): PortfolioTaxSummary {
  let totalTax = 0
  let taxableValue = 0
  let excludedValue = 0
  const byPosition = positions.map(position => {
    const estimate = estimatePositionTax(position)
    if (estimate.excluded) excludedValue += position.current_value
    else taxableValue += position.current_value
    totalTax += estimate.tax
    return { position, estimate }
  })
  return { totalTax, taxableValue, excludedValue, byPosition }
}

export const CATEGORY_COLORS: Record<string, string> = {
  etf:        '#534AB7',
  action:     '#378ADD',
  crypto:     '#7F77DD',
  livret:     '#1D9E75',
  or:         '#EF9F27',
  obligation: '#D85A30',
  cat:        '#BA7517',
  per:        '#5DCAA5',
  creance:    '#0EA5A0',
  mobilier:   '#9C6644',
  autre:      '#B4B2A9',
}

export interface LivretInterestEstimate {
  /** Intérêts courus depuis le 1er janvier jusqu'à `asOf`, au prorata réel des dépôts/retraits. */
  interestToDate: number
  /** Projection du `asOf` au 31 décembre, en supposant le solde actuel constant. */
  interestRemaining: number
  /** Estimation totale sur l'année (interestToDate + interestRemaining). */
  interestYear: number
  /** Solde actuel (reconstitué depuis les mouvements, ou solde de repli fourni). */
  balance: number
}

/**
 * Estimation des intérêts d'un livret au prorata réel des dépôts/retraits — pas
 * un simple `solde actuel × taux` appliqué depuis le 1er janvier (ce qui
 * surestime fortement l'intérêt d'un dépôt récent). On reconstitue le solde
 * jour par jour à partir des mouvements (achat=dépôt, vente=retrait,
 * interets=capitalisation) et on applique `solde × taux/100 × jours/365` sur
 * chaque palier entre deux mouvements.
 *
 * `currentBalanceFallback` sert uniquement quand `movements` est vide (solde
 * saisi manuellement, sans historique) — dans ce cas on ne connaît pas la date
 * réelle des dépôts, donc on retombe sur l'approximation "présent depuis le
 * 1er janvier".
 */
export function estimateLivretInterest(
  movements: { type: string; quantity: number; price: number; date: string }[],
  taux: number,
  currentBalanceFallback: number,
  asOf: Date = new Date()
): LivretInterestEstimate {
  const yearStart = new Date(asOf.getFullYear(), 0, 1)
  const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000)
  const joursEcoules = diffDays(asOf, yearStart)
  const joursRestants = 365 - joursEcoules

  const sorted = movements
    .filter(m => m.type === 'achat' || m.type === 'vente' || m.type === 'interets')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (sorted.length === 0) {
    const interestToDate = currentBalanceFallback * (taux / 100) * (joursEcoules / 365)
    const interestRemaining = currentBalanceFallback * (taux / 100) * (joursRestants / 365)
    return { interestToDate, interestRemaining, interestYear: interestToDate + interestRemaining, balance: currentBalanceFallback }
  }

  let balance = sorted
    .filter(m => new Date(m.date) < yearStart)
    .reduce((s, m) => s + (m.type === 'vente' ? -m.quantity * m.price : m.quantity * m.price), 0)

  let cursor = yearStart
  let interestToDate = 0
  for (const m of sorted.filter(m => new Date(m.date) >= yearStart && new Date(m.date) <= asOf)) {
    const mDate = new Date(m.date)
    interestToDate += balance * (taux / 100) * (diffDays(mDate, cursor) / 365)
    balance += m.type === 'vente' ? -m.quantity * m.price : m.quantity * m.price
    cursor = mDate
  }
  interestToDate += balance * (taux / 100) * (diffDays(asOf, cursor) / 365)

  const interestRemaining = balance * (taux / 100) * (joursRestants / 365)

  return { interestToDate, interestRemaining, interestYear: interestToDate + interestRemaining, balance }
}
