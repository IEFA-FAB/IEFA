-- Sprint 7: remove CATMAT/price columns from ingredient now that purchase_item owns them
ALTER TABLE sisub.ingredient
  DROP COLUMN IF EXISTS catmat_item_codigo,
  DROP COLUMN IF EXISTS catmat_item_descricao,
  DROP COLUMN IF EXISTS catmat_match_status,
  DROP COLUMN IF EXISTS catmat_match_score,
  DROP COLUMN IF EXISTS unit_price;
