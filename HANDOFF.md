WWCD — Reprise de session (23/08/2026)

Contexte : app de suivi de patrimoine perso. Repo local /Users/williamquaile/Desktop/wwcd-2, prod wwcd-2.vercel.app, déploiement via `npx vercel deploy --prod`. Stack Next.js 14 App Router + Supabase. Voir le résumé projet complet dans les instructions précédentes (dashboard, transactions, assets, revenus, analyse, prediction, livrets/cat/obligations/creances/banks/accounts par [id]).

## Ce qui a été fait dans la session précédente

**Bugs corrigés (déployés en prod) :**
1. Graphique d'évolution du dashboard jamais fonctionné → `SUPABASE_SERVICE_ROLE_KEY`/`CRON_SECRET` manquantes sur Vercel + bug table `profiles` inexistante dans `/api/snapshot`. Corrigé, variables ajoutées.
2. Backfill d'historique créé (`/api/snapshot/backfill`, bouton dashboard) pour reconstruire les snapshots depuis les transactions + cours Yahoo historiques.
3. Lien créance mort dans le dashboard (comptes virtuels non routés) + paiement créance qui échouait silencieusement (contrainte NOT NULL sur `transactions.account_id`, migration 003 appliquée).
4. Positions fantômes à "0 €" (résidus de calcul flottant après liquidation quasi-totale) → filtre `currentValue < 0.05` ajouté dans `buildPositions()`.
5. Intérêts de créance ajoutés au calcul de `/revenus` (prorata sur la durée du prêt).
6. Audit complet : ~40 écritures Supabase sans vérification d'erreur → toutes corrigées (alertes visibles).
7. Boucle de pagination dupliquée dans 9 fichiers → helper `fetchAllPaginated()` dans `src/lib/supabase/paginate.ts`. Bug découvert au passage : `/api/snapshot` (cron) ne paginait pas du tout → total tronqué à 1000 transactions.
8. Logique de position dupliquée dans `/revenus` → réutilise `calculatePosition()` de `lib/portfolio.ts`.
9. Comptes/banques virtuels généralisés (flag `virtual` + `detailPath` sur `Account`/`Bank`) au lieu de chaînes magiques `'creances'`.
10. Contrainte SQL `transactions_type_check` élargie (migration 004) — n'autorisait que `achat`/`vente`, bloquait `dividende`/`interets`/`coupon`/`remboursement` en silence depuis le début.
11. Routage cassé vers les pages détail : positions livret/CAT menaient vers `/assets/[id]` (générique) au lieu de `/livrets/[id]`/`/cat/[id]` (pages dédiées, indexées par ID de COMPTE pas d'actif). Nouveau helper `getPositionDetailPath()`.
12. Étiquetage des transactions dans `/assets/[id]` (tout non-"achat" affiché "Vente") → table `TX_TYPE_LABELS`/`TX_TYPE_COLORS` partagée dans `lib/portfolio.ts`.
13. **Bug racine des intérêts** : `calculatePosition()` ignorait complètement le type `interets` → les intérêts de livret ne remontaient jamais dans le calcul de valeur du dashboard/comptes/banques. Corrigé (traité comme un achat). Convention `quantity`/`price` de `/livrets/[id]` alignée sur celle déjà utilisée par les achats/ventes.

## Connu mais non traité (dette technique identifiée, pas de bug actif)

- **`/cat/[id]` a une convention `quantity=1, price=montant` incohérente** avec `calculatePosition()` — fonctionne aujourd'hui par coïncidence (un seul cycle achat/vente complet sur le seul CAT existant) mais casserait avec des dépôts multiples/retraits partiels. Pas de fix appliqué (pas de problème visible, corriger nécessiterait de retoucher les 2 transactions existantes).
- CAT n'a pas d'option "Intérêts" dans son modal (contrairement aux livrets) — si besoin un jour, il faudra d'abord régler le point ci-dessus.
- Roadmap déjà connue (non commencée) : benchmark MSCI World/CAC40, alertes de seuil, export PDF, TWRR annualisée, immobilier, PWA.

## Migrations SQL exécutées manuellement par l'utilisateur cette session
- `003_creance_account_nullable.sql`
- `004_transaction_types.sql`

## Pour vérifier l'état actuel
Dernier déploiement prod OK, testé et confirmé par l'utilisateur (Livret A affiche bien 400 € après correction des intérêts).
