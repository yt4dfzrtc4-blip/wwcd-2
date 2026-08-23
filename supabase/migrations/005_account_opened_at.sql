-- Migration 005 : date d'ouverture d'un compte, nécessaire pour estimer
-- l'exonération d'IR d'un PEA après 5 ans (fiscalité, /analyse).
-- Coller dans Supabase SQL Editor > New query > Run

alter table public.accounts
  add column if not exists opened_at date;
