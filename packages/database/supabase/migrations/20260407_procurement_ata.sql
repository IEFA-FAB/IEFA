-- ─── EXTENSÕES AO MODELO DE TEMPLATES ───────────────────────────────────────

-- Headcount padrão do template e tipo (semanal vs evento)
ALTER TABLE sisub.menu_template
  ADD COLUMN IF NOT EXISTS default_headcount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'weekly'
    CHECK (template_type IN ('weekly', 'event'));

-- Override de headcount por item (ex: frango = 450 num cardápio de 400 pessoas)
ALTER TABLE sisub.menu_template_items
  ADD COLUMN IF NOT EXISTS headcount_override integer;

-- Preço unitário no produto (para estimativa de custo da ATA)
ALTER TABLE sisub.product
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,4);

-- ─── ENTIDADE ATA ────────────────────────────────────────────────────────────

-- Documento ATA (nível unidade)
CREATE TABLE IF NOT EXISTS sisub.procurement_ata (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     integer NOT NULL REFERENCES sisub.units(id),
  title       text NOT NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);

-- Cozinhas participantes da ATA (cada uma com local de entrega próprio)
CREATE TABLE IF NOT EXISTS sisub.procurement_ata_kitchen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id          uuid NOT NULL REFERENCES sisub.procurement_ata(id) ON DELETE CASCADE,
  kitchen_id      integer NOT NULL REFERENCES sisub.kitchen(id),
  delivery_notes  text,
  UNIQUE (ata_id, kitchen_id)
);

-- Seleções de templates/eventos por cozinha
CREATE TABLE IF NOT EXISTS sisub.procurement_ata_selection (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_kitchen_id  uuid NOT NULL REFERENCES sisub.procurement_ata_kitchen(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES sisub.menu_template(id),
  repetitions     integer NOT NULL DEFAULT 1 CHECK (repetitions > 0)
);

-- Itens calculados da ATA (snapshot no momento da geração)
CREATE TABLE IF NOT EXISTS sisub.procurement_ata_item (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id                uuid NOT NULL REFERENCES sisub.procurement_ata(id) ON DELETE CASCADE,
  product_id            uuid REFERENCES sisub.product(id),
  catmat_item_codigo    integer,
  catmat_item_descricao text,
  product_name          text NOT NULL,
  folder_id             text,
  folder_description    text,
  measure_unit          text,
  total_quantity        numeric(14,4) NOT NULL,
  unit_price            numeric(12,4),
  total_value           numeric(14,4)
);

-- ─── RASCUNHO DA COZINHA ─────────────────────────────────────────────────────

-- Rascunho criado pelo nutricionista para sugerir mix ao gestor da unidade
CREATE TABLE IF NOT EXISTS sisub.kitchen_ata_draft (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id  integer NOT NULL REFERENCES sisub.kitchen(id),
  title       text NOT NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'reviewed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- Seleções de templates/eventos no rascunho
CREATE TABLE IF NOT EXISTS sisub.kitchen_ata_draft_selection (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    uuid NOT NULL REFERENCES sisub.kitchen_ata_draft(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES sisub.menu_template(id),
  repetitions integer NOT NULL DEFAULT 1 CHECK (repetitions > 0)
);
