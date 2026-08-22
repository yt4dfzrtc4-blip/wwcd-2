-- Migration 003 : les remboursements de créances ne sont plus rattachés
-- à un compte réel (compte virtuel géré côté app) — account_id doit
-- pouvoir être NULL pour ces transactions.
-- Coller dans Supabase SQL Editor > New query > Run

alter table public.transactions
  alter column account_id drop not null;
