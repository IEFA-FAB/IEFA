-- ─── MEMÓRIA DE CÁLCULO — PESQUISA DE PREÇOS (LEI 14.133/2021) ──────────────
--
-- Registra cada execução de pesquisa de preços para uma ATA, incluindo
-- TODAS as amostras utilizadas, removidas como outliers e descartadas por
-- poluição CATMAT — garantindo rastreabilidade completa para auditoria.
--
-- Convenção de nomenclatura:
--   - Atributos de integração com o Compras.gov.br → nomes originais do sistema externo
--   - Atributos internos da aplicação → inglês
--
-- Referência legal:
--   - Lei 14.133/2021, Art. 23 (pesquisa de preços obrigatória)
--   - IN SEGES/ME 65/2021 (procedimentos de pesquisa de mercado)
--   - TCU: Acórdão 2471/2008 (documentação da metodologia de preços)

-- ─── Cabeçalho da pesquisa (uma por execução) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS sisub.procurement_pesquisa_preco (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id        uuid        NOT NULL REFERENCES sisub.procurement_ata(id) ON DELETE CASCADE,

  -- Parâmetros internos da pesquisa (reprodutibilidade)
  reference_method      text        NOT NULL DEFAULT 'median'
                        CHECK (reference_method IN ('median', 'mean', 'lowest')),
  period_months         smallint    NOT NULL DEFAULT 12,
  similarity_threshold  numeric(4,3) NOT NULL,

  -- Filtros aplicados — valores referenciam campos externos do Compras.gov.br
  filter_estado         text,         -- valor do campo `estado` da API
  filter_uasg_code      text,         -- valor do campo `codigoUasg` da API
  filter_municipio_code integer,      -- valor do campo `codigoMunicipio` da API

  -- Resumo executivo interno (denormalizado para listagem rápida)
  total_items           integer     NOT NULL DEFAULT 0,
  items_with_price      integer     NOT NULL DEFAULT 0,
  items_without_catmat  integer     NOT NULL DEFAULT 0,
  non_compliant_items   integer     NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── Resultado por item (um por item da ATA, por pesquisa) ───────────────────

CREATE TABLE IF NOT EXISTS sisub.procurement_pesquisa_preco_item (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id   uuid        NOT NULL REFERENCES sisub.procurement_pesquisa_preco(id) ON DELETE CASCADE,
  -- Referência ao item da ATA (SET NULL se o item for removido)
  ata_item_id   uuid        REFERENCES sisub.procurement_ata_item(id) ON DELETE SET NULL,

  -- Snapshot imutável do item — catmat_* são identificadores externos
  catmat_codigo           integer,
  catmat_descricao        text,
  product_name            text        NOT NULL,

  -- Pipeline de filtragem interno (rastreabilidade do funil)
  total_raw                   integer     NOT NULL DEFAULT 0,
  total_after_date_filter     integer     NOT NULL DEFAULT 0,
  total_after_pollution_filter integer    NOT NULL DEFAULT 0,
  total_after_outlier         integer     NOT NULL DEFAULT 0,

  -- Estatísticas internas (null quando não há amostras válidas)
  price_min       numeric(12,4),
  price_max       numeric(12,4),
  price_mean      numeric(12,4),
  price_median    numeric(12,4),
  std_dev         numeric(12,4),
  cv_pct          numeric(8,2),   -- coeficiente de variação em %
  unique_sources  integer,         -- nº de UASGs distintas

  -- Preço de referência adotado (interno)
  reference_price   numeric(12,4),
  reference_method  text,            -- snapshot do método (redundância intencional)
  measure_unit      text,

  -- Conformidade Lei 14.133 / IN 65/2021 (interno)
  is_compliant              boolean     NOT NULL DEFAULT false,
  non_compliance_reasons    text[]      NOT NULL DEFAULT '{}',

  -- Erro de consulta à API externo, se houver
  error           text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Amostras individuais (memória de cálculo completa) ──────────────────────
--
-- Cada linha é uma compra pública avaliada durante a pesquisa.
-- `sample_type` classifica o destino de cada amostra (campo interno):
--   'valid'     — incluída no cálculo do preço de referência
--   'outlier'   — excluída pelo método IQR (preço aberrante)
--   'pollution' — excluída por baixa similaridade com a descrição CATMAT

CREATE TABLE IF NOT EXISTS sisub.procurement_pesquisa_preco_amostra (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_item_id    uuid        NOT NULL
                      REFERENCES sisub.procurement_pesquisa_preco_item(id) ON DELETE CASCADE,

  -- Campo interno: classificação da amostra
  sample_type         text        NOT NULL CHECK (sample_type IN ('valid', 'outlier', 'pollution')),

  -- Campos externos do Compras.gov.br (nomes originais da API)
  id_compra           text        NOT NULL,
  id_item_compra      integer,
  descricao_item      text,
  preco_unitario      numeric(12,4),                -- campo `precoUnitario` da API (por unidade de fornecimento)
  capacidade_unidade_fornecimento  integer,          -- campo `capacidadeUnidadeFornecimento` da API
  sigla_unidade_fornecimento       text,             -- campo `siglaUnidadeFornecimento` da API
  sigla_unidade_medida             text,             -- campo `siglaUnidadeMedida` da API
  quantidade          numeric(14,4),
  codigo_uasg         text,
  nome_uasg           text,
  municipio           text,
  estado              text,
  esfera              text,
  marca               text,

  -- Campos internos (inglês)
  normalized_price    numeric(12,4),   -- preco_unitario / capacidade_unidade_fornecimento
  reference_date      date,            -- dataResultado ?? dataCompra — derivado internamente
  similarity          numeric(4,3)     -- recall de tokens vs descrição CATMAT
);

-- ─── Índices para consultas de auditoria ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pesquisa_preco_ata
  ON sisub.procurement_pesquisa_preco (ata_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pesquisa_preco_item_research
  ON sisub.procurement_pesquisa_preco_item (research_id);

CREATE INDEX IF NOT EXISTS idx_pesquisa_preco_item_ata_item
  ON sisub.procurement_pesquisa_preco_item (ata_item_id);

CREATE INDEX IF NOT EXISTS idx_pesquisa_preco_amostra_item_type
  ON sisub.procurement_pesquisa_preco_amostra (research_item_id, sample_type);
