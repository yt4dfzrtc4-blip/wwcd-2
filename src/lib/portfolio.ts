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
    if (tx.type === 'achat') {
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

export const CATEGORY_COLORS: Record<string, string> = {
  etf:        '#534AB7',
  action:     '#378ADD',
  crypto:     '#7F77DD',
  livret:     '#1D9E75',
  or:         '#EF9F27',
  obligation: '#D85A30',
  cat:        '#BA7517',
  per:        '#5DCAA5',
  autre:      '#B4B2A9',
}
