-- ============================================
-- WWCD — Schéma base de données Supabase
-- Colle ce contenu dans SQL Editor > New query
-- puis clique sur "Run"
-- ============================================

-- Extension pour les UUIDs
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLE : accounts (enveloppes / comptes)
-- ============================================
create table public.accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('pea','cto','crypto','livret','per','or','obligations','autre')),
  created_at timestamptz default now()
);

-- ============================================
-- TABLE : assets (référentiel des actifs)
-- ============================================
create table public.assets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  isin text,
  ticker text,
  name text not null,
  category text not null check (category in ('action','etf','crypto','obligation','livret','cat','per','or','autre')),
  currency text default 'EUR',
  created_at timestamptz default now()
);

-- ============================================
-- TABLE : transactions
-- ============================================
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  asset_id uuid references public.assets(id) on delete cascade not null,
  type text not null check (type in ('achat','vente')),
  quantity numeric(18,6) not null,
  price numeric(18,6) not null,
  date date not null,
  notes text,
  created_at timestamptz default now()
);

-- ============================================
-- TABLE : prices (derniers cours connus)
-- ============================================
create table public.prices (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid references public.assets(id) on delete cascade not null unique,
  price numeric(18,6),
  change_pct numeric(8,4),
  updated_at timestamptz default now()
);

-- ============================================
-- TABLE : snapshots (photos quotidiennes à 23h)
-- ============================================
create table public.snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  total_value numeric(18,2) not null,
  total_invested numeric(18,2) not null,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- ============================================
-- TABLE : livret_rates (taux des livrets)
-- ============================================
create table public.livret_rates (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid references public.assets(id) on delete cascade not null,
  rate numeric(6,4) not null,
  effective_date date not null,
  created_at timestamptz default now()
);

-- ============================================
-- RLS : Sécurité — chaque user ne voit que ses données
-- ============================================
alter table public.accounts enable row level security;
alter table public.assets enable row level security;
alter table public.transactions enable row level security;
alter table public.prices enable row level security;
alter table public.snapshots enable row level security;
alter table public.livret_rates enable row level security;

-- Policies accounts
create policy "accounts_own" on public.accounts for all using (auth.uid() = user_id);

-- Policies assets
create policy "assets_own" on public.assets for all using (auth.uid() = user_id);

-- Policies transactions
create policy "transactions_own" on public.transactions for all using (auth.uid() = user_id);

-- Policies prices (lecture seule via asset ownership)
create policy "prices_read" on public.prices for select
  using (exists (select 1 from public.assets a where a.id = asset_id and a.user_id = auth.uid()));
create policy "prices_write" on public.prices for all
  using (exists (select 1 from public.assets a where a.id = asset_id and a.user_id = auth.uid()));

-- Policies snapshots
create policy "snapshots_own" on public.snapshots for all using (auth.uid() = user_id);

-- Policies livret_rates
create policy "livret_rates_own" on public.livret_rates for all
  using (exists (select 1 from public.assets a where a.id = asset_id and a.user_id = auth.uid()));

-- ============================================
-- DONNÉES DE DÉMO (optionnel — à supprimer en prod)
-- ============================================
-- Les données sont créées via l'interface, pas ici.
-- Le schéma est prêt !
