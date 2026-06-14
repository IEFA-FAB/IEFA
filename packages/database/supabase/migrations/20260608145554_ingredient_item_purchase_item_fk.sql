-- Sprint 6: item de produto (ingredient_item) referencia 1 item de compra (purchase_item)
-- Modelo: catmat → purchase_item → ingredient_item (estoque/GS1) → ingredient
-- O item de produto herda o CATMAT do purchase_item referenciado.
-- Coluna nullable + ON DELETE SET NULL — aditiva e retrocompatível.

ALTER TABLE sisub.ingredient_item
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid REFERENCES sisub.purchase_item(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ingredient_item_purchase_item_idx
  ON sisub.ingredient_item (purchase_item_id)
  WHERE purchase_item_id IS NOT NULL;
