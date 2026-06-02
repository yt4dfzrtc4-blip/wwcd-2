export type AccountType = 'pea' | 'cto' | 'crypto' | 'livret' | 'cat' | 'per' | 'or' | 'obligations' | 'autre'
export type AssetCategory = 'action' | 'etf' | 'crypto' | 'obligation' | 'livret' | 'cat' | 'per' | 'or' | 'autre'
export type TransactionType = 'achat' | 'vente'
export type LivretMode = 'auto' | 'balance' | 'transactions'

export interface Bank {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Account {
  id: string
  user_id: string
  bank_id?: string
  name: string
  type: AccountType
  created_at: string
  bank?: Bank
}

export interface Asset {
  id: string
  user_id: string
  isin?: string
  ticker?: string
  name: string
  category: AssetCategory
  currency: string
  livret_mode?: LivretMode
  livret_balance?: number
  livret_rate?: number
  created_at: string
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

export interface Position {
  asset: Asset
  account: Account
  quantity: number
  average_price: number
  current_price: number
  current_value: number
  invested_value: number
  pnl: number
  pnl_pct: number
  day_change: number
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
