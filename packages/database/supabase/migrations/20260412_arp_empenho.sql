-- ─── FASE 1: LINKAGEM ARP + REGISTRO DE EMPENHO ──────────────────────────────
--
-- Conecta a ATA interna à ARP real do Compras.gov.br e registra empenhos
-- emitidos, dando visibilidade de comprometimento orçamentário por item.

-- ─── ARP (Ata de Registro de Preços oficial) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS sisub.procurement_arp (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              integer NOT NULL REFERENCES sisub.units(id),
  ata_id               uuid NOT NULL REFERENCES sisub.procurement_ata(id) ON DELETE CASCADE,
  -- Chave de consulta na API Compras.gov.br
  numero_ata           text NOT NULL,
  ano_ata              text,
  uasg_gerenciadora    text NOT NULL,
  nome_uasg_gerenciadora text,
  -- Metadados importados
  objeto               text,
  data_vigencia_inicio date,
  data_vigencia_fim    date,
  status_ata           text,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id, numero_ata, uasg_gerenciadora)
);

-- ─── Itens da ARP (snapshot importado via API 2_consultarARPItem) ─────────────

CREATE TABLE IF NOT EXISTS sisub.procurement_arp_item (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arp_id                uuid NOT NULL REFERENCES sisub.procurement_arp(id) ON DELETE CASCADE,
  -- Vínculo com item da ATA interna (match por catmat_item_codigo)
  ata_item_id           uuid REFERENCES sisub.procurement_ata_item(id) ON DELETE SET NULL,
  -- Dados do Compras.gov.br
  numero_item           integer,
  catmat_item_codigo    integer,
  descricao_item        text,
  ni_fornecedor         text,
  nome_fornecedor       text,
  valor_unitario        numeric(12,4),
  quantidade_homologada numeric(14,4),
  medida_catmat         text,
  -- Snapshot de saldo (atualizado via API 4_consultarEmpenhosSaldoItem ou
  -- re-consulta de 2_consultarARPItem)
  quantidade_empenhada  numeric(14,4) DEFAULT 0,
  saldo_empenho         numeric(14,4),
  synced_at             timestamptz NOT NULL DEFAULT now()
);

-- ─── Empenhos registrados pelo gestor ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sisub.empenho (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              integer NOT NULL REFERENCES sisub.units(id),
  arp_item_id          uuid NOT NULL REFERENCES sisub.procurement_arp_item(id) ON DELETE CASCADE,
  -- Identificação do empenho no SIASG (ex: "2026NE000123")
  numero_empenho       text NOT NULL,
  data_empenho         date NOT NULL,
  quantidade_empenhada numeric(14,4) NOT NULL CHECK (quantidade_empenhada > 0),
  valor_unitario       numeric(12,4) NOT NULL,
  valor_total          numeric(14,4) NOT NULL,
  nota_lancamento      text,
  status               text NOT NULL DEFAULT 'ativo'
                       CHECK (status IN ('ativo', 'anulado')),
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id, numero_empenho)
);

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_procurement_arp_unit  ON sisub.procurement_arp(unit_id);
CREATE INDEX IF NOT EXISTS idx_procurement_arp_ata   ON sisub.procurement_arp(ata_id);
CREATE INDEX IF NOT EXISTS idx_arp_item_arp          ON sisub.procurement_arp_item(arp_id);
CREATE INDEX IF NOT EXISTS idx_arp_item_catmat       ON sisub.procurement_arp_item(catmat_item_codigo);
CREATE INDEX IF NOT EXISTS idx_arp_item_ata_item     ON sisub.procurement_arp_item(ata_item_id);
CREATE INDEX IF NOT EXISTS idx_empenho_unit          ON sisub.empenho(unit_id);
CREATE INDEX IF NOT EXISTS idx_empenho_arp_item      ON sisub.empenho(arp_item_id);
CREATE INDEX IF NOT EXISTS idx_empenho_status        ON sisub.empenho(status);
