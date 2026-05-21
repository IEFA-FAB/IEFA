-- Sprint 2/7: Migrate CATMAT data from ingredient → purchase_item
-- One purchase_item per distinct catmat_item_codigo.
-- Each ingredient linked via purchase_item_ingredient (is_default=true, factor=1.0).
-- procurement_list_item rows backfilled with purchase_item_id + snapshots.

-- 1. Create purchase_items from ingredients with CATMAT link.
--    Use catmat_item_descricao as description (official commercial name);
--    fall back to 'CATMAT <code>' when null.
--    One row per distinct catmat_item_codigo — DISTINCT ON picks lowest description.
WITH distinct_catmat AS (
  SELECT DISTINCT ON (catmat_item_codigo)
    catmat_item_codigo,
    catmat_item_descricao,
    catmat_match_status,
    catmat_match_score,
    measure_unit AS purchase_measure_unit,
    unit_price
  FROM sisub.ingredient
  WHERE catmat_item_codigo IS NOT NULL
    AND deleted_at IS NULL
  ORDER BY catmat_item_codigo, description
)
INSERT INTO sisub.purchase_item (
  description,
  purchase_measure_unit,
  catmat_item_codigo,
  catmat_item_descricao,
  catmat_match_status,
  catmat_match_score,
  unit_price
)
SELECT
  COALESCE(catmat_item_descricao, 'CATMAT ' || catmat_item_codigo::text),
  purchase_measure_unit,
  catmat_item_codigo,
  catmat_item_descricao,
  catmat_match_status,
  catmat_match_score,
  unit_price
FROM distinct_catmat
ON CONFLICT DO NOTHING;

-- 2. Link each ingredient to its purchase_item (is_default=true, factor=1.0).
INSERT INTO sisub.purchase_item_ingredient (
  purchase_item_id,
  ingredient_id,
  conversion_factor,
  is_default
)
SELECT
  pi.id,
  i.id,
  1.0,
  true
FROM sisub.ingredient i
JOIN sisub.purchase_item pi
  ON pi.catmat_item_codigo = i.catmat_item_codigo
WHERE i.catmat_item_codigo IS NOT NULL
  AND i.deleted_at IS NULL
ON CONFLICT (purchase_item_id, ingredient_id) DO NOTHING;

-- 3. Backfill procurement_list_item with purchase_item snapshot.
--    purchase_quantity = total_quantity (conversion_factor=1.0 backfill).
UPDATE sisub.procurement_list_item pli
SET
  purchase_item_id          = pi.id,
  purchase_item_description = pi.description,
  purchase_measure_unit     = pi.purchase_measure_unit,
  purchase_quantity         = pli.total_quantity,
  conversion_factor         = 1.0
FROM sisub.purchase_item pi
WHERE pi.catmat_item_codigo = pli.catmat_item_codigo
  AND pli.purchase_item_id IS NULL;
