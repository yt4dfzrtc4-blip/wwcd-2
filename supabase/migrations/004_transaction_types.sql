-- Migration 004 : la contrainte de type sur `transactions` n'autorisait que
-- ('achat','vente') alors que l'app utilise depuis longtemps 'dividende',
-- 'interets', 'coupon' et 'remboursement' (CAT, livrets, obligations, créances).
-- Coller dans Supabase SQL Editor > New query > Run

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('achat', 'vente', 'dividende', 'interets', 'coupon', 'remboursement'));
