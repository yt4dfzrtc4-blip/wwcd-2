WWCD — Reprise de session (23/08/2026)

Contexte : app de suivi de patrimoine perso. Repo local /Users/williamquaile/Desktop/wwcd-2, prod wwcd-2.vercel.app, déploiement via `npx vercel deploy --prod`. Stack Next.js 14 App Router + Supabase.

## Session du 23/08/2026 — comparaison de perf + fiscalité (déployé en prod)

**1. Comparaison de performance par compte** (`/analyse` → onglet Performance)
- Nouvelle section "Performance par compte" : regroupe les positions par `account.id`, calcule PnL €/% et un rendement annualisé (réutilise le `xirr()` déjà présent, cashflows filtrés par compte).
- Limite connue : comptes virtuels (créances, obligations) affichent `–` en annualisé — leurs transactions ne sont pas rattachées à un `account_id` réel de la même façon, donc pas de cashflows à agréger pour le XIRR. Le PnL €/% reste correct pour eux.

**2. Fiscalité — impôt latent estimé** (`/analyse` → nouvel onglet Fiscalité)
- `lib/portfolio.ts` : `estimatePositionTax()` / `estimatePortfolioTax()`. Taux PFU = 12,8 % IR + 18,6 % prélèvements sociaux = 31,4 % (taux 2026 confirmés par l'utilisateur, pas les 30 % historiques).
- PEA détenu ≥ 5 ans (`account.opened_at`, nouvelle colonne) → IR exonéré, prélèvements sociaux seuls (18,6 %).
- Livrets (Livret A/LDDS) : supposés exonérés — approximation, ne distingue pas un livret bancaire non réglementé taxable.
- PER et Or physique : **exclus du calcul** (régimes de sortie/plus-value spécifiques, pas estimés plutôt qu'un chiffre faux) — apparaissent en "Non estimé" dans l'UI.
- Nouveau champ "Date d'ouverture" dans le formulaire compte (`/assets`), visible seulement pour le type PEA.
- KPIs ajoutés : Impôt latent estimé, Patrimoine net d'impôt, Valeur non estimée (PER/Or), + statut de maturité par compte PEA.

## Migrations SQL exécutées manuellement par l'utilisateur
- `003_creance_account_nullable.sql`
- `004_transaction_types.sql`
- `005_account_opened_at.sql` (ajoute `accounts.opened_at`, nécessaire pour l'exonération PEA) — confirmé exécuté par l'utilisateur le 23/08/2026.

## Connu mais non traité (dette technique identifiée, pas de bug actif)
- **`/cat/[id]` a une convention `quantity=1, price=montant` incohérente** avec `calculatePosition()` — fonctionne aujourd'hui par coïncidence (un seul cycle achat/vente complet sur le seul CAT existant) mais casserait avec des dépôts multiples/retraits partiels. Pas de fix appliqué.
- CAT n'a pas d'option "Intérêts" dans son modal (contrairement aux livrets).
- Fiscalité : approximation, pas un conseil fiscal. Pas de distinction livret réglementé vs bancaire classique. Créances taxées au PFU par défaut (approximation, pas de barème IR réel).
- Roadmap déjà connue (non commencée) : benchmark MSCI World/CAC40, alertes de seuil, export PDF, TWRR annualisée, immobilier (+ passif lié), import CSV/OFX, multi-devise, PWA.

## Pour vérifier l'état actuel
Dernier déploiement prod OK (23/08/2026), validé par l'utilisateur. Migration 005 exécutée côté Supabase, confirmée par l'utilisateur.
