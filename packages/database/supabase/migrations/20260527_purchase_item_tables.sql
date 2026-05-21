-- Sprint 1/7: Tables purchase_item + purchase_item_ingredient
-- + ALTER procurement_list_item (additive columns, all nullable — retrocompatible)
-- + RLS enabled (service-role only, project standard since 20260522)

-- ── purchase_item ─────────────────────────────────────────────────────────────

CREATE TABLE sisub.purchase_item (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  description           text        NOT NULL,
  purchase_measure_unit text,

  -- CATMAT (Compras.gov.br)
  catmat_item_codigo    integer     REFERENCES sisub.compras_material_item(codigo_item) ON DELETE SET NULL,
  catmat_item_descricao text,
  catmat_match_status   text        CHECK (catmat_match_status IN ('pending','matched','review','no_match','skip')),
  catmat_match_score    numeric,

  -- GPC (GS1 Global Product Classification)
  gpc_segment_code      text,
  gpc_family_code       text,
  gpc_class_code        text,
  gpc_brick_code        text,

  -- Preço de referência
  unit_price            numeric(12,4),

  -- Audit
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX purchase_item_catmat_idx
  ON sisub.purchase_item (catmat_item_codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX purchase_item_description_trgm_idx
  ON sisub.purchase_item USING GIN (description gin_trgm_ops)
  WHERE deleted_at IS NULL;

ALTER TABLE sisub.purchase_item ENABLE ROW LEVEL SECURITY;

-- ── purchase_item_ingredient ──────────────────────────────────────────────────
-- Junction: N purchase_items ↔ N ingredients, with unit conversion

CREATE TABLE sisub.purchase_item_ingredient (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_item_id  uuid        NOT NULL REFERENCES sisub.purchase_item(id)  ON DELETE CASCADE,
  ingredient_id     uuid        NOT NULL REFERENCES sisub.ingredient(id)     ON DELETE CASCADE,
  conversion_factor numeric(12,6) NOT NULL DEFAULT 1.0,
  conversion_notes  text,
  is_default        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_item_id, ingredient_id)
);

CREATE INDEX purchase_item_ingredient_ingredient_idx
  ON sisub.purchase_item_ingredient (ingredient_id);

ALTER TABLE sisub.purchase_item_ingredient ENABLE ROW LEVEL SECURITY;

-- ── procurement_list_item: additive columns ───────────────────────────────────
-- All nullable — retrocompatible. Populated by Sprint 2 backfill + Sprint 3 code.

ALTER TABLE sisub.procurement_list_item
  ADD COLUMN IF NOT EXISTS purchase_item_id          uuid    REFERENCES sisub.purchase_item(id),
  ADD COLUMN IF NOT EXISTS purchase_item_description text,
  ADD COLUMN IF NOT EXISTS purchase_measure_unit     text,
  ADD COLUMN IF NOT EXISTS purchase_quantity         numeric(14,4),
  ADD COLUMN IF NOT EXISTS conversion_factor         numeric(12,6);

CREATE INDEX procurement_list_item_purchase_item_idx
  ON sisub.procurement_list_item (purchase_item_id)
  WHERE purchase_item_id IS NOT NULL;
