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

## PWA — suite (icône trouble sur iPhone)
- Après premier test d'installation, l'icône WWCD apparaissait nettement plus floue/pâle que les icônes d'apps natives voisines (LCL, CIC, Trade Republic...) sur l'écran d'accueil de l'utilisateur.
- Cause : `logo-source.png` ne fait que 500×500 px (export Canva, confirmé par l'utilisateur comme étant la meilleure résolution disponible) — un peu juste pour les grandes tailles d'icônes iOS actuelles.
- Correctif appliqué : `scripts/sharpen-png.js` (unsharp mask maison, décodage/réencodage PNG manuel comme le reste du pipeline, pas de dépendance) appliqué sur chaque icône générée dans `scripts/build-icons-from-logo.sh` (force 0.6). Nettement plus net après test visuel.
- Redéployé en prod (23/08/2026).
- **Important pour l'utilisateur** : iOS met en cache l'icône au moment du "Sur l'écran d'accueil" — il faut supprimer l'icône WWCD existante et refaire l'ajout à l'écran d'accueil pour voir la version corrigée (une simple actualisation de la page ne suffit pas).

## Rebrand complet façon logo (23/08/2026, déployé en prod)
- Choix de l'utilisateur (vs option plus prudente "accent seulement") : appliquer la charte du logo à tout le site, pas juste la couleur d'accent.
- `--brand` violet `#534AB7` → bleu du logo `#004AAD` (+ `--brand-light`/`--brand-dark` recalculés). `--bg` gris clair `#F7F6F3` → crème du logo `#F1E2BD`. `--surface` (cartes) reste blanc pour préserver la lisibilité des tableaux de données financières.
- Échelle `tailwind.config.js` `brand.{50..900}` recalculée sur la même base bleue.
- Badges `etf`/`crypto` (teintes dérivées de l'ancien violet) recolorés en bleu ; les autres badges de catégorie (livret vert, or marron, obligation brique, cat jaune...) **non touchés** car ce sont des couleurs sémantiques indépendantes de la marque.
- Couleurs codées en dur (recharts a besoin de hex directs, pas de `var()`) mises à jour dans `EvolutionChart.tsx`, `prediction/page.tsx`, `layout.tsx` (theme-color).
- `manifest.json` : `theme_color`/`background_color` alignés sur la nouvelle palette.
- Écran `/login` : le texte "WWCD" remplacé par le vrai logo (icône `icons/icon-192.png`, arrondi).
- Vérifié visuellement en local (dev server + `mcp__Claude_Preview`) sur `/login` uniquement — **pages authentifiées (dashboard, analyse, transactions) non vérifiées visuellement**, pas d'accès aux identifiants. À confirmer par l'utilisateur après déploiement.
- `.claude/launch.json` ajouté (config serveur dev pour l'outil de preview, `npm run dev`, autoPort activé car le port 3000 était déjà occupé par un autre process sur la machine).

## Rebrand — retour utilisateur "pas beau" et corrections (23/08/2026, déployé en prod)
- Après vérification sur le dashboard réel, l'utilisateur a trouvé le fond crème `#F1E2BD` trop saturé/lourd sur une page dense en cartes blanches et chiffres — écrasait la lisibilité des données.
- Correctif : `--bg` adouci de `#F1E2BD` (crème saturé du logo) vers `#F7F4EE` (même teinte chaude, beaucoup plus clair/désaturé — même logique que "canvas vs card" des dashboards type Linear/Notion). `--surface` (cartes) toujours blanc pur, garde le contraste. `manifest.json` `background_color` aligné.
- Attention si on retouche encore cette variable : `--bg` est réutilisé partout dans le code pour deux rôles différents (fond de page ET fond "creux" des inputs/tracks de progress bar/hover de lignes à l'intérieur des cartes blanches) — toute nouvelle teinte doit rester assez proche du blanc pour ne pas redevenir criarde, mais garder un minimum de contraste avec `--surface` blanc pour que les inputs restent visibles (le `border` des inputs aide aussi à la lisibilité indépendamment du fill).
- Logo dans la topbar (`src/components/layout/Topbar.tsx`) : remplacé le texte "WWCD" par le vrai logo, demande explicite de l'utilisateur. Nouveau script `scripts/make-logo-mark.js` : détoure le fond crème du logo (transparence par distance de couleur avec anti-aliasing doux sur les bords) et recadre au plus près des lettres → `public/logo-mark.png` (293×288, fond transparent, passé aussi par `sharpen-png.js`). Utilisable sur n'importe quel fond contrairement aux icônes carrées `icons/icon-*.png`.
- Redéployé en prod. **Pages authentifiées (dashboard/analyse/transactions) toujours pas vérifiées par moi-même** (pas d'identifiants) — dernier retour utilisateur à obtenir sur ce fond assoupli + le nouveau logo topbar.

## Diagnostic tickers en échec (23/08/2026)
Requête en lecture seule sur la table `assets` (autorisée explicitement par l'utilisateur) pour identifier les 4 tickers en échec vus dans `/api/prices/refresh` :
- **Apollo** (`APO`) : ticker correct, mais `category` = "autre" au lieu de "action" → le code de refresh ne fetch que les catégories action/etf/crypto, donc il est skippé et signalé en erreur à tort. Fix simple à faire dans `/assets` : changer la catégorie.
- **Banco Santander** (`BSDE.DE`) : ticker invalide. Le bon, vérifié sur Yahoo Finance : `SAN.MC` (cotation Madrid).
- **Global Bioenergies** (`ALGBE.PA`) : aucun ticker valide trouvé sur Yahoo (recherche par nom aussi infructueuse) — probablement radiée/plus suivie par Yahoo. À vérifier si la ligne est toujours pertinente.
- **ASML** (`ASME.DE` — coquille "ASME" au lieu de "ASML" en plus du mauvais suffixe) : le bon ticker, vérifié : `ASML.AS` (Amsterdam).
Aucune correction appliquée en base pour l'instant (l'utilisateur a préféré vérifier lui-même sur `/assets`) — à reprendre si besoin.

## Bug spinner "Actualiser" corrigé (23/08/2026, déployé en prod)
- Sur `/dashboard` uniquement, l'icône de rafraîchissement (`RefreshCw` dans `Topbar.tsx`) ne tournait pas pendant le fetch des cours (partie la plus longue). Bug pré-existant, pas une régression du rebrand.
- Cause : `Dashboard` passe une prop `refreshing` contrôlée à `Topbar`, et `isRefreshing = refreshingProp ?? refreshing` (nullish coalescing) prenait toujours la prop du Dashboard puisqu'elle vaut `false` (pas `undefined`) au départ — donc l'état interne de `Topbar` (mis à `true` dès le clic) était totalement masqué pendant toute la durée du fetch réseau. La prop ne passait à `true` qu'après coup, pendant le rechargement local des données (`loadData()`), d'où une icône qui ne tournait quasiment jamais.
- Fix dans `Topbar.tsx` : `handleRefresh` attend maintenant (`await`) le callback `onRefresh` avant de repasser `refreshing` à `false`, et `isRefreshing = refreshing || !!refreshingProp` (OR au lieu de `??`) pour ne plus jamais masquer l'état interne. Les autres pages (transactions, assets, etc.) ne passaient pas de prop `refreshing` donc n'étaient pas affectées par ce bug.
- Confirmé fonctionnel par l'utilisateur après déploiement.

## Pour vérifier l'état actuel
Dernier déploiement prod OK (23/08/2026), incluant perf par compte + fiscalité + Monte Carlo + PWA (logo réel, icônes affinées) + rebrand (bleu `#004AAD` + fond crème assoupli `#F7F4EE` + logo dans la topbar) + fix spinner refresh dashboard. Migration 005 exécutée côté Supabase, confirmée par l'utilisateur. Reste à traiter si l'utilisateur le souhaite : corriger la catégorie Apollo + tickers Santander/ASML en base, sort du sujet Global Bioenergies, et le SMTP Resend pour l'invitation d'un second utilisateur (non confirmé comme fait).
