export type AccountType = 'pea' | 'cto' | 'crypto' | 'livret' | 'per' | 'or' | 'obligations' | 'autre'
export type AssetCategory = 'action' | 'etf' | 'crypto' | 'obligation' | 'livret' | 'cat' | 'per' | 'or' | 'autre'
export type TransactionType = 'achat' | 'vente'

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  created_at: string
}

export interface Asset {
  id: string
  user_id: string
  isin?: string
  ticker?: string
  name: string
  category: AssetCategory
  currency: string
  created_at: string
  // jointures
  prices?: Price
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  asset_id: string
  type: TransactionType
  quantity: number
  price: number
  date: string
  notes?: string
  created_at: string
  // jointures
  asset?: Asset
  account?: Account
}

export interface Price {
  id: string
  asset_id: string
  price: number
  change_pct: number
  updated_at: string
}

export interface Snapshot {
  id: string
  user_id: string
  date: string
  total_value: number
  total_invested: number
  created_at: string
}

export interface LivretRate {
  id: string
  asset_id: string
  rate: number
  effective_date: string
  created_at: string
}

// Positions calculées (non stockées en DB)
export interface Position {
  asset: Asset
  account: Account
  quantity: number
  average_price: number   // PRU
  current_price: number
  current_value: number
  invested_value: number
  pnl: number             // plus-value latente €
  pnl_pct: number         // plus-value latente %
  day_change: number      // variation du jour €
  day_change_pct: number
}

export interface PortfolioSummary {
  total_value: number
  total_invested: number
  total_pnl: number
  total_pnl_pct: number
  day_change: number
  day_change_pct: number
  positions: Position[]
  by_category: Record<AssetCategory, number>
  by_account: Record<string, number>
}
