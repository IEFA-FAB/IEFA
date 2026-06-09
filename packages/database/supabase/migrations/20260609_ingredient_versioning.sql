-- Ingredient versioning: snapshot completo do agregado do insumo a cada alteração.
-- Permite histórico estilo "Google Docs" (recomposição + diff + restauração).
-- O snapshot captura, na perspectiva da tela de edição do insumo:
--   ingredient (campos) + nutrientes ativos + itens de produto + itens de compra vinculados.
-- Denormaliza alguns rótulos (folder/ceafa/nutriente/purchase_item) para que cada
-- versão seja auto-suficiente para exibição histórica, sem lookups posteriores.
-- RLS habilitado (service-role only, padrão do projeto desde 20260522).

CREATE TABLE sisub.ingredient_version (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id   uuid        NOT NULL REFERENCES sisub.ingredient(id) ON DELETE CASCADE,
  version_number  integer     NOT NULL,
  snapshot        jsonb       NOT NULL,
  change_summary  text,
  changed_by      uuid,
  changed_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, version_number)
);

CREATE INDEX ingredient_version_ingredient_idx
  ON sisub.ingredient_version (ingredient_id, version_number DESC);

ALTER TABLE sisub.ingredient_version ENABLE ROW LEVEL SECURITY;

-- ── Backfill: versão baseline (v1) por insumo ativo ───────────────────────────
-- Garante que toda edição futura tenha um "antes" para diffar.
INSERT INTO sisub.ingredient_version (ingredient_id, version_number, snapshot, changed_by_name, change_summary)
SELECT
  i.id,
  1,
  jsonb_build_object(
    'ingredient', jsonb_build_object(
      'description', i.description,
      'folder_id', i.folder_id,
      'folder_description', f.description,
      'measure_unit', i.measure_unit,
      'correction_factor', i.correction_factor,
      'ceafa_id', i.ceafa_id,
      'ceafa_description', c.description
    ),
    'nutrients', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('nutrient_id', inu.nutrient_id, 'name', n.name, 'value', inu.nutrient_value)
        ORDER BY n.display_order NULLS LAST, n.name
      )
      FROM sisub.ingredient_nutrient inu
      JOIN sisub.nutrient n ON n.id = inu.nutrient_id
      WHERE inu.ingredient_id = i.id AND inu.deleted_at IS NULL
    ), '[]'::jsonb),
    'product_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ii.id,
          'description', ii.description,
          'barcode', ii.barcode,
          'purchase_measure_unit', ii.purchase_measure_unit,
          'unit_content_quantity', ii.unit_content_quantity,
          'correction_factor', ii.correction_factor,
          'purchase_item_id', ii.purchase_item_id
        )
        ORDER BY ii.created_at
      )
      FROM sisub.ingredient_item ii
      WHERE ii.ingredient_id = i.id AND ii.deleted_at IS NULL
    ), '[]'::jsonb),
    'purchase_links', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'link_id', pii.id,
          'purchase_item_id', pi.id,
          'description', pi.description,
          'catmat_item_codigo', pi.catmat_item_codigo,
          'catmat_item_descricao', pi.catmat_item_descricao,
          'purchase_measure_unit', pi.purchase_measure_unit,
          'unit_price', pi.unit_price,
          'conversion_factor', pii.conversion_factor,
          'is_default', pii.is_default
        )
        ORDER BY pii.created_at
      )
      FROM sisub.purchase_item_ingredient pii
      JOIN sisub.purchase_item pi ON pi.id = pii.purchase_item_id
      WHERE pii.ingredient_id = i.id AND pi.deleted_at IS NULL
    ), '[]'::jsonb)
  ),
  'Sistema (baseline)',
  'Versão inicial registrada automaticamente'
FROM sisub.ingredient i
LEFT JOIN sisub.folder f ON f.id = i.folder_id
LEFT JOIN sisub.ceafa c ON c.id = i.ceafa_id
WHERE i.deleted_at IS NULL;
