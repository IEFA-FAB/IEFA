-- ─── RENOMEAR: product → ingredient ───────────────────────────────────────────
--
-- Motivo: a tabela "product" armazena insumos das preparações (ingredientes),
-- não produtos acabados. Na interface já tratávamos como "Insumos/Ingredientes".
-- Alinhar o modelo de dados com a semântica real.

-- 1. Renomear tabelas
ALTER TABLE sisub.product RENAME TO ingredient;
ALTER TABLE sisub.product_item RENAME TO ingredient_item;
ALTER TABLE sisub.product_nutrient RENAME TO ingredient_nutrient;

-- 2. Renomear colunas FK para consistência
ALTER TABLE sisub.ingredient_item RENAME COLUMN product_id TO ingredient_id;
ALTER TABLE sisub.ingredient_nutrient RENAME COLUMN product_id TO ingredient_id;
ALTER TABLE sisub.recipe_ingredients RENAME COLUMN product_id TO ingredient_id;
ALTER TABLE sisub.recipe_ingredient_alternatives RENAME COLUMN product_id TO ingredient_id;
ALTER TABLE sisub.procurement_list_item RENAME COLUMN product_id TO ingredient_id;
ALTER TABLE sisub.procurement_list_item RENAME COLUMN product_name TO ingredient_name;

-- 3. Renomear view
ALTER VIEW sisub.v_product_kg_lt_items RENAME TO v_ingredient_kg_lt_items;
