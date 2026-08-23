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

**3. Prédiction Monte Carlo** (`/prediction`, déployé en prod)
- Toggle "Scénarios" (ancienne vue 3 courbes, conservée) / "Monte Carlo" (nouveau).
- 500 simulations, tirage aléatoire du rendement annuel par catégorie (loi normale, Box-Muller). Moyenne = taux "Base" existant, écart-type dérivé de l'écart pessimiste/optimiste déjà réglé par l'utilisateur (pas de nouveau champ).
- Graphe en fourchette (bande 10e-90e centile + médiane) + badge "Probabilité d'atteindre l'objectif" avec année médiane d'atteinte.

**4. PWA (app mobile installable)** — pas encore déployé, build local validé
- `public/manifest.json` (nom, icônes, `start_url: /dashboard`, `display: standalone`, couleurs brand).
- Icônes générées depuis le vrai logo fourni par l'utilisateur : `public/logo-source.png` → `scripts/build-icons-from-logo.sh` (utilise `sips`, natif macOS, pas de dépendance externe). Produit `public/icons/icon-{192,512}[-maskable].png` (versions maskable = logo réduit à 70% + padding couleur de fond du logo `#f1e2bd`, échantillonnée automatiquement, pour survivre au masque circulaire Android) + `public/apple-touch-icon.png`. Relancer ce script si le logo change.
- `public/sw.js` : service worker minimal, cache uniquement les assets statiques (`/_next/static/*`, `/icons/*`) — aucune page ni appel API n'est mis en cache pour ne jamais afficher des données patrimoniales périmées. Enregistré via `src/components/ServiceWorkerRegister.tsx` (client component, monté dans `layout.tsx`).
- `src/app/layout.tsx` : ajout `metadata.manifest`, `metadata.icons`, `metadata.appleWebApp`, `viewport.themeColor`.
- `vercel.json` : header `Cache-Control: no-cache` sur `/sw.js` pour que les mises à jour du service worker se propagent immédiatement après déploiement.
- Build de prod (`npm run build`) validé sans erreur. **Pas encore déployé/testé en conditions réelles** (installation sur téléphone) — à faire à la prochaine étape.

## Discussion en cours (non résolue) — invitation d'un second utilisateur
- Besoin : créer un second compte de connexion **séparé** (pas de partage de patrimoine, RLS déjà cloisonnée par `user_id` donc rien à coder côté app).
- Blocage rencontré : Supabase → Authentication → Users → "Send invitation" échoue avec `email rate limit exceeded` (limite basse du service mail intégré par défaut).
- Décision prise par l'utilisateur : configurer un **SMTP personnalisé** (Resend recommandé, gratuit jusqu'à 3000 emails/mois) plutôt que d'attendre le reset de la limite. Étapes détaillées données (compte Resend → domaine/clé API → Supabase Authentication → Settings → SMTP Settings) mais **pas confirmé comme fait** par l'utilisateur — à vérifier/reprendre à la prochaine session.

## Pistes évoquées et écartées pour l'instant
- Agrégation bancaire automatique (DSP2/open banking) : jugée trop complexe pour un usage strictement perso.
- Benchmark vs indices (MSCI World/CAC40) : expliqué, l'utilisateur a dit "pas besoin" pour l'instant.
- Assurance-vie comme catégorie d'actif : identifié comme le plus gros trou fonctionnel restant (placement le plus courant en France, absent de `CATEGORY_LABELS`), mais pas encore demandé explicitement par l'utilisateur — à proposer si pertinent.

## Pour vérifier l'état actuel
Dernier déploiement prod OK (23/08/2026), incluant perf par compte + fiscalité + Monte Carlo. Migration 005 exécutée côté Supabase, confirmée par l'utilisateur. PWA implémentée en local avec le vrai logo (build validé), déploiement et test d'installation mobile à confirmer.
