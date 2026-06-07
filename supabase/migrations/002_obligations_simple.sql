-- Migration 002 : modèle simplifié pour les obligations
-- Coller dans Supabase SQL Editor > New query > Run

-- Prix d'achat moyen en % (ex: 98.5 pour 98,5% du nominal)
alter table public.assets
  add column if not exists obligation_avg_price numeric(8,4);
