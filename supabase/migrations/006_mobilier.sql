-- Migration 006 : nouvelle catégorie "mobilier" (montres, art, bijoux…)
-- Coller dans Supabase SQL Editor > New query > Run

-- Prix d'achat et valeur actuelle estimée (mise à jour manuelle, pas de cours)
alter table public.assets
  add column if not exists mobilier_purchase_price numeric(12,2),
  add column if not exists mobilier_current_value numeric(12,2);

-- La contrainte de catégorie d'origine (001_schema.sql) est devenue incohérente
-- avec l'app : elle n'incluait déjà pas 'creance', et l'app permet depuis
-- longtemps de saisir une catégorie personnalisée libre ("Autre (personnalisé)")
-- qui ne peut pas être couverte par une liste figée. On la supprime plutôt que
-- de la recréer avec 'mobilier' en plus, pour ne pas bloquer les catégories
-- personnalisées déjà utilisées.
alter table public.assets drop constraint if exists assets_category_check;
