-- Migration 007 : date d'achat pour les biens mobiliers (montres, art…)
-- Coller dans Supabase SQL Editor > New query > Run

alter table public.assets
  add column if not exists mobilier_purchase_date date;
