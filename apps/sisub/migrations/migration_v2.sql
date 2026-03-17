-- FULL REDO MIGRATION v2
-- Drops all migrated data and re-inserts from scratch with the following fixes:
--
--   FIX 1: legacy_id stored directly on sisub.folder, sisub.product, sisub.recipes
--           at INSERT time — no separate lookup step, no row-number matching.
--
--   FIX 2: Folders are inserted with description + legacy_id = id_grupo_produto
--           directly, so the grupo→folder mapping is deterministic (no timestamp
--           ordering trick that breaks when all rows share the same NOW()).
--
--   FIX 3: Every subsequent join uses legacy_id (exact match) instead of
--           description text or time-window heuristics.
--
--   FIX 4: Steps 5b + 6b cover recipes/ingredients that exist only in
--           preparacao_original (not in preparacao_base). Without these,
--           14 ingrediente_preparacao_original rows would silently produce
--           no alternatives in Step 7 because r.legacy_id had no match.
--
-- SAFE TO RUN MULTIPLE TIMES: the cleanup step deletes by lookup UUID, so running
-- again after a partial failure will clean up the previous attempt.

BEGIN;

-- =========================================================
-- STEP 0: ADD legacy_id COLUMNS (idempotent, must come first)
-- =========================================================

ALTER TABLE sisub.folder  ADD COLUMN IF NOT EXISTS legacy_id integer;
ALTER TABLE sisub.product ADD COLUMN IF NOT EXISTS legacy_id bigint;
ALTER TABLE sisub.recipes ADD COLUMN IF NOT EXISTS legacy_id bigint;

-- =========================================================
-- STEP 0b: PRE-FLIGHT — unicidade obrigatória nos dados fonte
-- =========================================================
-- public.insumo e public.preparacao_base não têm constraint PRIMARY KEY,
-- por isso verificamos manualmente. Duplicatas causariam:
--   - scalar subquery em Step 5 falhar com "more than one row returned"
--   - INSERT na PK de migration_product_lookup / migration_recipe_lookup falhar.

DO $$
BEGIN
  IF EXISTS (
    SELECT id_insumo FROM public.insumo
    GROUP BY id_insumo HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.insumo tem id_insumo duplicados — corrija os dados antes de migrar';
  END IF;

  IF EXISTS (
    SELECT id_preparacao FROM public.preparacao_base
    GROUP BY id_preparacao HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.preparacao_base tem id_preparacao duplicados — corrija os dados antes de migrar';
  END IF;
END $$;

-- =========================================================
-- STEP 1: CLEAN UP PREVIOUS MIGRATION (FK order: children first)
-- =========================================================

-- 1a. Alternatives that reference migrated recipe_ingredients
DELETE FROM sisub.recipe_ingredient_alternatives
WHERE recipe_ingredient_id IN (
  SELECT ri.id
  FROM sisub.recipe_ingredients ri
  JOIN sisub.migration_recipe_lookup rl ON rl.new_recipe_id = ri.recipe_id
);

-- 1b. menu_items referencing migrated recipes (via recipe_origin_id)
DELETE FROM sisub.menu_items
WHERE recipe_origin_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup);

-- 1c. menu_template_items referencing migrated recipes
DELETE FROM sisub.menu_template_items
WHERE recipe_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup);

-- 1d. Recipe ingredients from migrated recipes
DELETE FROM sisub.recipe_ingredients
WHERE recipe_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup);

-- 1e. Migrated recipes
DELETE FROM sisub.recipes
WHERE id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup);

-- 1f. Product items from migrated products
DELETE FROM sisub.product_item
WHERE product_id IN (SELECT new_product_id FROM sisub.migration_product_lookup);

-- 1g. Migrated products
DELETE FROM sisub.product
WHERE id IN (SELECT new_product_id FROM sisub.migration_product_lookup);

-- 1h. Migrated folders
DELETE FROM sisub.folder
WHERE id IN (SELECT new_folder_id FROM sisub.migration_folder_lookup);

-- 1i. Fallback: orphaned rows from partial runs — legacy_id set but not recorded in lookup.
--     Handles the case where a previous run died after INSERT but before the lookup was
--     populated (e.g. crash between Step 2 folder INSERT and migration_folder_lookup INSERT).
--     FK order: children first.
DELETE FROM sisub.recipe_ingredient_alternatives
WHERE recipe_ingredient_id IN (
  SELECT ri.id FROM sisub.recipe_ingredients ri
  WHERE ri.recipe_id IN (
    SELECT id FROM sisub.recipes
    WHERE legacy_id IS NOT NULL
      AND id NOT IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup)
  )
);

DELETE FROM sisub.recipe_ingredients
WHERE recipe_id IN (
  SELECT id FROM sisub.recipes
  WHERE legacy_id IS NOT NULL
    AND id NOT IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup)
);

DELETE FROM sisub.recipes
WHERE legacy_id IS NOT NULL
  AND id NOT IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup);

DELETE FROM sisub.product_item
WHERE product_id IN (
  SELECT id FROM sisub.product
  WHERE legacy_id IS NOT NULL
    AND id NOT IN (SELECT new_product_id FROM sisub.migration_product_lookup)
);

DELETE FROM sisub.product
WHERE legacy_id IS NOT NULL
  AND id NOT IN (SELECT new_product_id FROM sisub.migration_product_lookup);

DELETE FROM sisub.folder
WHERE legacy_id IS NOT NULL
  AND id NOT IN (SELECT new_folder_id FROM sisub.migration_folder_lookup);

-- 1j. Clear lookup tables
TRUNCATE sisub.migration_folder_lookup;
TRUNCATE sisub.migration_product_lookup;
TRUNCATE sisub.migration_recipe_lookup;

-- =========================================================
-- STEP 2: FOLDERS — insert with legacy_id at creation time
-- =========================================================
-- Creates folders for grupos with direct insumos AND all their ancestors
-- (via grupo_predescessor) so that parent_id can be wired correctly.
-- Without the recursive CTE, ancestor-only groups would be missing and
-- all child folders would end up with parent_id = NULL.

WITH RECURSIVE grupos_necessarios AS (
  -- base: groups with at least one direct insumo
  SELECT gp.id_grupo_produto, gp.grupo_predescessor
  FROM public.grupo_produto gp
  WHERE EXISTS (SELECT 1 FROM public.insumo i WHERE i.id_grupo_produto = gp.id_grupo_produto)
  UNION
  -- walk up the tree: include parents of any group already in the set
  SELECT gp.id_grupo_produto, gp.grupo_predescessor
  FROM public.grupo_produto gp
  JOIN grupos_necessarios gn ON gn.grupo_predescessor = gp.id_grupo_produto
)
INSERT INTO sisub.folder (id, description, legacy_id, created_at)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(TRIM(gp.descricao), ''), 'Grupo ' || gp.id_grupo_produto),
  gp.id_grupo_produto,
  NOW()
FROM public.grupo_produto gp
WHERE gp.id_grupo_produto IN (SELECT id_grupo_produto FROM grupos_necessarios);

-- Populate folder lookup from the fresh folders
INSERT INTO sisub.migration_folder_lookup (legacy_id_grupo_produto, new_folder_id)
SELECT f.legacy_id, f.id
FROM sisub.folder f
WHERE f.legacy_id IS NOT NULL;

-- Wire up parent_id using the legacy_id cross-reference.
-- Runs after all folders are inserted so parent rows already exist.
UPDATE sisub.folder f
SET parent_id = pf.id
FROM public.grupo_produto gp
JOIN sisub.folder pf ON pf.legacy_id = gp.grupo_predescessor
WHERE f.legacy_id = gp.id_grupo_produto
  AND gp.grupo_predescessor IS NOT NULL;

-- =========================================================
-- STEP 3: PRODUCTS — insert with legacy_id and correct folder
-- =========================================================
-- Join uses f.legacy_id = i.id_grupo_produto — exact match, no heuristics.
-- Note: insumo.descricao is NOT unique, so legacy_id is the only safe key.

INSERT INTO sisub.product (id, description, folder_id, measure_unit, correction_factor, legacy_id, created_at)
SELECT
  gen_random_uuid(),
  i.descricao,
  f.id,
  COALESCE(NULLIF(TRIM(um.abreviacao_unidade_medida), ''), 'UN'),
  COALESCE(i.fator_correcao, 1.0),
  i.id_insumo,
  NOW()
FROM public.insumo i
LEFT JOIN sisub.folder f ON f.legacy_id = i.id_grupo_produto
LEFT JOIN public.unidade_medida um ON um.id_unidade_medida = i.id_unidade_medida
WHERE i.descricao IS NOT NULL;

-- Populate product lookup from the fresh products
INSERT INTO sisub.migration_product_lookup (legacy_id_insumo, new_product_id, legacy_descricao)
SELECT p.legacy_id, p.id, p.description
FROM sisub.product p
WHERE p.legacy_id IS NOT NULL;

-- =========================================================
-- STEP 4: PRODUCT ITEMS
-- =========================================================
-- item_produto.id_produto references produto.id_produto which equals insumo.id_insumo.
-- We join via p.legacy_id (exact) instead of the old description-match approach.

INSERT INTO sisub.product_item (
  id, description, product_id, barcode,
  purchase_measure_unit, unit_content_quantity, created_at
)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(TRIM(ip.item_produto), ''), 'Item #' || ip.id_item_produto),
  p.id,
  NULLIF(TRIM(ip.codigo_barras), ''),
  e.embalagem,
  e.fator_multiplicativo,
  NOW()
FROM public.item_produto ip
JOIN sisub.product p ON p.legacy_id = ip.id_produto
LEFT JOIN public.embalagem e ON e.id_embalagem = ip.id_embalagem;

-- =========================================================
-- STEP 5: RECIPES — insert with legacy_id at creation time
-- =========================================================
-- preparacao_base.id_preparacao = insumo_original.id_insumo (recipe name lives there).
-- portion_yield cast: rendimento is numeric, column is smallint — use ROUND+cap.

INSERT INTO sisub.recipes (
  id, name, preparation_method, portion_yield,
  kitchen_id, version, base_recipe_id, cooking_factor,
  preparation_time_minutes, legacy_id, created_at
)
SELECT
  gen_random_uuid(),
  COALESCE(
    NULLIF(TRIM((SELECT io.descricao FROM public.insumo_original io WHERE io.id_insumo = pb.id_preparacao)), ''),
    NULLIF(TRIM((SELECT i.descricao  FROM public.insumo i              WHERE i.id_insumo  = pb.id_preparacao)), ''),
    'Receita Legada #' || pb.id_preparacao
  ),
  NULLIF(TRIM(CONCAT_WS(E'\n\n',
    NULLIF(TRIM(pb.modo_preparo), ''),
    CASE WHEN NULLIF(TRIM(pb.equipamentos_necessarios), '') IS NOT NULL
         THEN 'Equipamentos: ' || pb.equipamentos_necessarios ELSE NULL END,
    CASE WHEN NULLIF(TRIM(pb.observacoes), '') IS NOT NULL
         THEN 'Observações: ' || pb.observacoes ELSE NULL END,
    CASE WHEN NULLIF(TRIM(pb.sugestoes_acompanhamento), '') IS NOT NULL
         THEN 'Sugestões: ' || pb.sugestoes_acompanhamento ELSE NULL END,
    CASE WHEN pb.modo_convencional = true THEN 'Modo Convencional' ELSE NULL END,
    CASE WHEN pb.forno_combinado    = true THEN 'Forno Combinado'   ELSE NULL END
  )), ''),
  -- rendimento is numeric; portion_yield is smallint — round and clamp to smallint range
  LEAST(GREATEST(ROUND(COALESCE(pb.rendimento, 1)), 1), 32767)::smallint,
  NULL,   -- kitchen_id = global (NULL)
  1,      -- version inicial
  NULL,   -- base_recipe_id: sem fork ainda
  1.0,    -- cooking_factor padrão
  NULL,   -- preparation_time_minutes: não disponível no schema antigo
  pb.id_preparacao,
  NOW()
FROM public.preparacao_base pb
WHERE pb.id_preparacao IS NOT NULL;

-- Populate recipe lookup from fresh recipes (preparacao_base)
INSERT INTO sisub.migration_recipe_lookup (legacy_id_preparacao, new_recipe_id, legacy_rendimento)
SELECT r.legacy_id, r.id, pb.rendimento
FROM sisub.recipes r
JOIN public.preparacao_base pb ON pb.id_preparacao = r.legacy_id
WHERE r.legacy_id IS NOT NULL;

-- =========================================================
-- STEP 5b: RECIPES — preparacao_original not covered by preparacao_base
-- =========================================================
-- These are the recipes that exist ONLY in the _original tables and would
-- cause ingrediente_preparacao_original joins to fail silently in Step 7.

INSERT INTO sisub.recipes (
  id, name, preparation_method, portion_yield,
  kitchen_id, version, base_recipe_id, cooking_factor,
  preparation_time_minutes, legacy_id, created_at
)
SELECT
  gen_random_uuid(),
  COALESCE(
    NULLIF(TRIM(io.descricao), ''),
    'Receita Original #' || po.id_preparacao
  ),
  NULLIF(TRIM(CONCAT_WS(E'\n\n',
    NULLIF(TRIM(po.modo_preparo), ''),
    CASE WHEN NULLIF(TRIM(po.equipamentos_necessarios), '') IS NOT NULL
         THEN 'Equipamentos: ' || po.equipamentos_necessarios ELSE NULL END,
    CASE WHEN NULLIF(TRIM(po.observacoes), '') IS NOT NULL
         THEN 'Observações: ' || po.observacoes ELSE NULL END,
    CASE WHEN NULLIF(TRIM(po.sugestoes_acompanhamento), '') IS NOT NULL
         THEN 'Sugestões: ' || po.sugestoes_acompanhamento ELSE NULL END,
    CASE WHEN po.modo_convencional = true THEN 'Modo Convencional' ELSE NULL END,
    CASE WHEN po.forno_combinado    = true THEN 'Forno Combinado'   ELSE NULL END
  )), ''),
  LEAST(GREATEST(ROUND(COALESCE(po.rendimento, 1)), 1), 32767)::smallint,
  NULL,   -- kitchen_id = global (NULL)
  1,      -- version inicial
  NULL,   -- base_recipe_id: sem fork ainda
  1.0,    -- cooking_factor padrão
  NULL,   -- preparation_time_minutes: não disponível no schema antigo
  po.id_preparacao,
  NOW()
FROM public.preparacao_original po
LEFT JOIN public.insumo_original io ON io.id_insumo = po.id_preparacao
WHERE NOT EXISTS (
  SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = po.id_preparacao
);

-- Populate recipe lookup for preparacao_original-only recipes
INSERT INTO sisub.migration_recipe_lookup (legacy_id_preparacao, new_recipe_id, legacy_rendimento)
SELECT r.legacy_id, r.id, po.rendimento
FROM sisub.recipes r
JOIN public.preparacao_original po ON po.id_preparacao = r.legacy_id
WHERE r.legacy_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sisub.migration_recipe_lookup mrl WHERE mrl.legacy_id_preparacao = r.legacy_id
  );

-- =========================================================
-- STEP 6: RECIPE INGREDIENTS
-- =========================================================
-- All joins use legacy_id — no time-windows, no description matching.

INSERT INTO sisub.recipe_ingredients (
  id, recipe_id, product_id, net_quantity,
  is_optional, priority_order, created_at
)
SELECT
  gen_random_uuid(),
  r.id,
  p.id,
  ip.quantidadeliquida,
  FALSE,
  NULL,
  NOW()
FROM public.ingrediente_preparacao ip
JOIN sisub.recipes  r ON r.legacy_id = ip.id_preparacao
JOIN sisub.product  p ON p.legacy_id = ip.id_produto
WHERE ip.quantidadeliquida > 0;

-- =========================================================
-- STEP 6b: RECIPE INGREDIENTS — preparacao_original-only recipes
-- =========================================================
-- Feeds the main ingredients for the Step 5b recipes so that the Step 7
-- JOIN to recipe_ingredients resolves correctly for all alternatives.

INSERT INTO sisub.recipe_ingredients (
  id, recipe_id, product_id, net_quantity,
  is_optional, priority_order, created_at
)
SELECT
  gen_random_uuid(),
  r.id,
  p.id,
  ipo.quantidadeliquida,
  FALSE,
  NULL,
  NOW()
FROM public.ingrediente_preparacao_original ipo
JOIN sisub.recipes r ON r.legacy_id = ipo.id_preparacao
JOIN sisub.product p ON p.legacy_id = ipo.id_produto
WHERE ipo.quantidadeliquida > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = ipo.id_preparacao
  );

-- =========================================================
-- STEP 7: PRE-FLIGHT — alternativas cujo ingrediente principal não foi migrado
-- =========================================================
-- Se um ingrediente_preparacao_original tem id_produto_substituto mas seu
-- ingrediente principal (id_produto) não existe em sisub.recipe_ingredients
-- (porque quantidadeliquida <= 0 filtrou o Step 6), o INSERT do Step 7
-- descartaria a alternativa silenciosamente.
-- Abortamos aqui para forçar correção consciente nos dados de origem.

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.ingrediente_preparacao_original ipo
  JOIN sisub.recipes  r      ON r.legacy_id     = ipo.id_preparacao
  JOIN sisub.product  p_orig ON p_orig.legacy_id = ipo.id_produto
  WHERE ipo.id_produto_substituto IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM sisub.recipe_ingredients ri
      WHERE ri.recipe_id = r.id AND ri.product_id = p_orig.id
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'ABORT: % alternativa(s) serão descartadas porque o ingrediente principal '
      'tem quantidadeliquida <= 0 e não existe em sisub.recipe_ingredients. '
      'Corrija os dados de origem ou ajuste o filtro de quantidadeliquida no Step 6.',
      v_count;
  END IF;
END $$;

-- =========================================================
-- STEP 7: RECIPE INGREDIENT ALTERNATIVES (substitutes)
-- =========================================================

INSERT INTO sisub.recipe_ingredient_alternatives (
  id, recipe_ingredient_id, product_id, net_quantity, priority_order, created_at
)
SELECT
  gen_random_uuid(),
  ri.id,
  p_sub.id,
  COALESCE(ipo.quantidade_substituto, ipo.quantidadeliquida),
  1,
  NOW()
FROM public.ingrediente_preparacao_original ipo
JOIN sisub.recipes           r       ON r.legacy_id     = ipo.id_preparacao
JOIN sisub.product           p_orig  ON p_orig.legacy_id = ipo.id_produto
JOIN sisub.product           p_sub   ON p_sub.legacy_id  = ipo.id_produto_substituto
JOIN sisub.recipe_ingredients ri     ON ri.recipe_id     = r.id
                                     AND ri.product_id   = p_orig.id
WHERE ipo.id_produto_substituto IS NOT NULL;

-- =========================================================
-- STEP 8: VERIFICATION — all ERRO lines must show 0
-- =========================================================

-- Contadores de migrados (filtrados pela lookup — excluem linhas pré-existentes)
SELECT 'Folders migrados'        AS check, COUNT(*) AS total FROM sisub.folder  WHERE legacy_id IS NOT NULL
UNION ALL
SELECT 'Produtos migrados',                COUNT(*)           FROM sisub.product WHERE legacy_id IS NOT NULL
UNION ALL
SELECT 'Product items migrados',
  COUNT(*) FROM sisub.product_item
  WHERE product_id IN (SELECT new_product_id FROM sisub.migration_product_lookup)
UNION ALL
SELECT 'Receitas migradas',                COUNT(*)           FROM sisub.recipes WHERE legacy_id IS NOT NULL
UNION ALL
SELECT 'Ingredientes migrados',
  COUNT(*) FROM sisub.recipe_ingredients
  WHERE recipe_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup)
UNION ALL
SELECT 'Alternativas migradas',
  COUNT(*) FROM sisub.recipe_ingredient_alternatives
  WHERE recipe_ingredient_id IN (
    SELECT ri.id FROM sisub.recipe_ingredients ri
    WHERE ri.recipe_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup)
  )
UNION ALL
SELECT '--- ESPERADOS ---',                0
UNION ALL
SELECT 'Folders com parent_id resolvido',  COUNT(*) FROM sisub.folder f WHERE f.legacy_id IS NOT NULL AND f.parent_id IS NOT NULL
UNION ALL
SELECT 'Grupos com grupo_predescessor (esperado acima)', COUNT(*) FROM public.grupo_produto WHERE grupo_predescessor IS NOT NULL
UNION ALL
SELECT 'Produtos esperados (insumos com descricao)',     COUNT(*) FROM public.insumo WHERE descricao IS NOT NULL
UNION ALL
SELECT 'Receitas esperadas (base + original exclusivas)',
  (SELECT COUNT(*) FROM public.preparacao_base)
  + (SELECT COUNT(*) FROM public.preparacao_original po
     WHERE NOT EXISTS (SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = po.id_preparacao))
UNION ALL
SELECT 'Ingredientes esperados (base, liq > 0)',         COUNT(*) FROM public.ingrediente_preparacao WHERE quantidadeliquida > 0
UNION ALL
SELECT 'Ingredientes esperados (original-exclusivas, liq > 0)',
  (SELECT COUNT(*) FROM public.ingrediente_preparacao_original ipo
   WHERE ipo.quantidadeliquida > 0
     AND NOT EXISTS (SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = ipo.id_preparacao))
UNION ALL
SELECT 'Alternativas esperadas (id_produto_substituto IS NOT NULL)', COUNT(*) FROM public.ingrediente_preparacao_original WHERE id_produto_substituto IS NOT NULL
UNION ALL
SELECT 'Product items esperados (item_produto count)', COUNT(*) FROM public.item_produto
UNION ALL
SELECT '--- ERROS (devem ser 0) ---',      0
UNION ALL
-- FK integrity checks
SELECT 'ERRO: parent_id não resolvido (ancestor faltando)',
  COUNT(*) FROM sisub.folder f
  JOIN public.grupo_produto gp ON gp.id_grupo_produto = f.legacy_id
  WHERE gp.grupo_predescessor IS NOT NULL AND f.parent_id IS NULL
UNION ALL
SELECT 'ERRO: Produtos sem folder',
  COUNT(*) FROM sisub.product WHERE folder_id IS NULL AND legacy_id IS NOT NULL
UNION ALL
SELECT 'ERRO: Ingredientes sem recipe_id',
  COUNT(*) FROM sisub.recipe_ingredients ri
  LEFT JOIN sisub.recipes r ON r.id = ri.recipe_id WHERE r.id IS NULL
UNION ALL
SELECT 'ERRO: Ingredientes sem product_id',
  COUNT(*) FROM sisub.recipe_ingredients ri
  LEFT JOIN sisub.product p ON p.id = ri.product_id WHERE p.id IS NULL
UNION ALL
SELECT 'ERRO: Alternativas sem recipe_ingredient_id',
  COUNT(*) FROM sisub.recipe_ingredient_alternatives ria
  LEFT JOIN sisub.recipe_ingredients ri ON ri.id = ria.recipe_ingredient_id WHERE ri.id IS NULL
UNION ALL
-- Count mismatch checks (discrepâncias = drops silenciosos)
SELECT 'ERRO: Produtos não migrados (insumos perdidos)',
  (SELECT COUNT(*) FROM public.insumo WHERE descricao IS NOT NULL)
  - (SELECT COUNT(*) FROM sisub.product WHERE legacy_id IS NOT NULL)
UNION ALL
SELECT 'ERRO: Receitas não migradas (preparacoes perdidas)',
  (  (SELECT COUNT(*) FROM public.preparacao_base)
   + (SELECT COUNT(*) FROM public.preparacao_original po
      WHERE NOT EXISTS (SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = po.id_preparacao))
  ) - (SELECT COUNT(*) FROM sisub.recipes WHERE legacy_id IS NOT NULL)
UNION ALL
-- Fix: denominator restrito a receitas oriundas de preparacao_base para não incluir
-- linhas inseridas pelo Step 6b (ingrediente_preparacao_original-exclusivas),
-- o que produziria um resultado negativo mascarando perdas reais do Step 6.
SELECT 'ERRO: Ingredientes base não migrados (liq > 0)',
  (SELECT COUNT(*) FROM public.ingrediente_preparacao WHERE quantidadeliquida > 0)
  - (SELECT COUNT(*) FROM sisub.recipe_ingredients ri
     WHERE ri.recipe_id IN (
       SELECT rl.new_recipe_id
       FROM sisub.migration_recipe_lookup rl
       JOIN sisub.recipes r ON r.id = rl.new_recipe_id
       WHERE EXISTS (
         SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = r.legacy_id
       )
     ))
UNION ALL
-- Verifica se o Step 6b perdeu linhas de ingrediente_preparacao_original para
-- receitas exclusivas de preparacao_original (produto não presente em sisub.product).
SELECT 'ERRO: Ingredientes original-exclusivos não migrados (liq > 0)',
  (SELECT COUNT(*) FROM public.ingrediente_preparacao_original ipo
   WHERE ipo.quantidadeliquida > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = ipo.id_preparacao
     ))
  - (SELECT COUNT(*) FROM sisub.recipe_ingredients ri
     WHERE ri.recipe_id IN (
       SELECT rl.new_recipe_id
       FROM sisub.migration_recipe_lookup rl
       JOIN sisub.recipes r ON r.id = rl.new_recipe_id
       WHERE NOT EXISTS (
         SELECT 1 FROM public.preparacao_base pb WHERE pb.id_preparacao = r.legacy_id
       )
     ))
UNION ALL
SELECT 'ERRO: Alternativas não migradas (produto_substituto perdido)',
  (SELECT COUNT(*) FROM public.ingrediente_preparacao_original WHERE id_produto_substituto IS NOT NULL)
  - (SELECT COUNT(*) FROM sisub.recipe_ingredient_alternatives
     WHERE recipe_ingredient_id IN (
       SELECT ri.id FROM sisub.recipe_ingredients ri
       WHERE ri.recipe_id IN (SELECT new_recipe_id FROM sisub.migration_recipe_lookup)
     ))
UNION ALL
-- Verifica se item_produto perdeu linhas porque id_produto não tinha match em sisub.product
-- (produto existe em public.produto mas não em public.insumo).
SELECT 'ERRO: Product items perdidos (id_produto sem match em sisub.product)',
  (SELECT COUNT(*) FROM public.item_produto)
  - (SELECT COUNT(*) FROM sisub.product_item
     WHERE product_id IN (SELECT new_product_id FROM sisub.migration_product_lookup))
UNION ALL
-- Alternativas cujo ingrediente principal não existe em recipe_ingredients (Step 7 silent drop)
-- (redundante com o pre-flight DO do Step 7, mas mantido como confirmação pós-inserção)
SELECT 'ERRO: Alt. com substituto cujo ingrediente principal não foi migrado',
  COUNT(*)
FROM public.ingrediente_preparacao_original ipo
JOIN sisub.recipes r ON r.legacy_id = ipo.id_preparacao
JOIN sisub.product p_orig ON p_orig.legacy_id = ipo.id_produto
WHERE ipo.id_produto_substituto IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sisub.recipe_ingredients ri
    WHERE ri.recipe_id = r.id AND ri.product_id = p_orig.id
  );

-- Update audit comments
COMMENT ON TABLE sisub.migration_folder_lookup  IS 'Migração v2 — NÃO DELETE (auditoria)';
COMMENT ON TABLE sisub.migration_product_lookup IS 'Migração v2 — NÃO DELETE (auditoria)';
COMMENT ON TABLE sisub.migration_recipe_lookup  IS 'Migração v2 — NÃO DELETE (auditoria)';

COMMIT;
