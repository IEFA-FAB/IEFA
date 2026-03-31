-- =============================================================================
-- Migração: Integração Compras.gov.br (CATMAT/CATSER)
-- Schema: sisub
-- Data: 2026-03-31
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- MÓDULO MATERIAL (CATMAT)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sisub.compras_material_grupo (
  codigo_grupo          INTEGER     PRIMARY KEY,
  nome_grupo            TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_material_classe (
  codigo_classe         INTEGER     PRIMARY KEY,
  codigo_grupo          INTEGER     NOT NULL REFERENCES sisub.compras_material_grupo(codigo_grupo),
  nome_classe           TEXT        NOT NULL,
  status_classe         BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_material_pdm (
  codigo_pdm            INTEGER     PRIMARY KEY,
  codigo_classe         INTEGER     NOT NULL REFERENCES sisub.compras_material_classe(codigo_classe),
  nome_pdm              TEXT        NOT NULL,
  status_pdm            BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item de Material (CATMAT) — tabela principal
CREATE TABLE sisub.compras_material_item (
  codigo_item                    INTEGER     PRIMARY KEY,
  codigo_pdm                     INTEGER     REFERENCES sisub.compras_material_pdm(codigo_pdm),
  descricao_item                 TEXT        NOT NULL,
  status_item                    BOOLEAN     NOT NULL DEFAULT true,
  item_sustentavel               BOOLEAN,
  codigo_ncm                     TEXT,
  descricao_ncm                  TEXT,
  aplica_margem_preferencia      BOOLEAN,
  data_hora_atualizacao          TIMESTAMPTZ,
  synced_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_deactivation_detected_at TIMESTAMPTZ
);

CREATE INDEX idx_compras_material_item_pdm
  ON sisub.compras_material_item(codigo_pdm);

-- Trigger: preserva first_deactivation_detected_at após primeiro preenchimento
CREATE OR REPLACE FUNCTION sisub.compras_material_item_preserve_deactivation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Se já tem um valor, preserva
  IF OLD.first_deactivation_detected_at IS NOT NULL THEN
    NEW.first_deactivation_detected_at := OLD.first_deactivation_detected_at;
    RETURN NEW;
  END IF;
  -- Se o item está sendo desativado pela primeira vez, registra agora
  IF NEW.status_item = false AND OLD.status_item = true THEN
    NEW.first_deactivation_detected_at := now();
  END IF;
  -- Se inserindo já desativado
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compras_material_item_deactivation
  BEFORE UPDATE ON sisub.compras_material_item
  FOR EACH ROW EXECUTE FUNCTION sisub.compras_material_item_preserve_deactivation();

-- Trigger para INSERT (item já inserido como inativo)
CREATE OR REPLACE FUNCTION sisub.compras_material_item_set_deactivation_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status_item = false AND NEW.first_deactivation_detected_at IS NULL THEN
    NEW.first_deactivation_detected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compras_material_item_deactivation_insert
  BEFORE INSERT ON sisub.compras_material_item
  FOR EACH ROW EXECUTE FUNCTION sisub.compras_material_item_set_deactivation_on_insert();

-- Natureza da Despesa (Material) — N:1 com PDM
CREATE TABLE sisub.compras_material_natureza_despesa (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_pdm                INTEGER     NOT NULL REFERENCES sisub.compras_material_pdm(codigo_pdm),
  codigo_natureza_despesa   TEXT        NOT NULL,
  nome_natureza_despesa     TEXT        NOT NULL,
  status_natureza_despesa   BOOLEAN     NOT NULL DEFAULT true,
  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_pdm, codigo_natureza_despesa)
);

-- Unidade de Fornecimento — N:1 com PDM
CREATE TABLE sisub.compras_material_unidade_fornecimento (
  id                                     BIGSERIAL   PRIMARY KEY,
  codigo_pdm                             INTEGER     NOT NULL REFERENCES sisub.compras_material_pdm(codigo_pdm),
  numero_sequencial_unidade_fornecimento INTEGER,
  sigla_unidade_fornecimento             TEXT,
  nome_unidade_fornecimento              TEXT,
  descricao_unidade_fornecimento         TEXT,
  sigla_unidade_medida                   TEXT,
  capacidade_unidade_fornecimento        INTEGER,
  status_unidade_fornecimento_pdm        BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao                  TIMESTAMPTZ,
  synced_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_pdm, numero_sequencial_unidade_fornecimento)
);

-- Características — N:1 com Item
CREATE TABLE sisub.compras_material_caracteristica (
  id                          BIGSERIAL   PRIMARY KEY,
  codigo_item                 INTEGER     NOT NULL REFERENCES sisub.compras_material_item(codigo_item),
  codigo_caracteristica       TEXT        NOT NULL,
  nome_caracteristica         TEXT        NOT NULL,
  status_caracteristica       BOOLEAN     NOT NULL DEFAULT true,
  codigo_valor_caracteristica TEXT,
  nome_valor_caracteristica   TEXT,
  status_valor_caracteristica BOOLEAN,
  numero_caracteristica       INTEGER,
  sigla_unidade_medida        TEXT,
  data_hora_atualizacao       TIMESTAMPTZ,
  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_item, codigo_caracteristica, codigo_valor_caracteristica)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MÓDULO SERVIÇO (CATSER)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sisub.compras_servico_secao (
  codigo_secao          INTEGER     PRIMARY KEY,
  nome_secao            TEXT        NOT NULL,
  status_secao          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_servico_divisao (
  codigo_divisao        INTEGER     PRIMARY KEY,
  codigo_secao          INTEGER     NOT NULL REFERENCES sisub.compras_servico_secao(codigo_secao),
  nome_divisao          TEXT        NOT NULL,
  status_divisao        BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_servico_grupo (
  codigo_grupo          INTEGER     PRIMARY KEY,
  codigo_divisao        INTEGER     NOT NULL REFERENCES sisub.compras_servico_divisao(codigo_divisao),
  nome_grupo            TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_servico_classe (
  codigo_classe         INTEGER     PRIMARY KEY,
  codigo_grupo          INTEGER     NOT NULL REFERENCES sisub.compras_servico_grupo(codigo_grupo),
  nome_classe           TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sisub.compras_servico_subclasse (
  codigo_subclasse      INTEGER     PRIMARY KEY,
  codigo_classe         INTEGER     NOT NULL REFERENCES sisub.compras_servico_classe(codigo_classe),
  nome_subclasse        TEXT        NOT NULL,
  status_subclasse      BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item de Serviço (CATSER) — tabela principal
CREATE TABLE sisub.compras_servico_item (
  codigo_servico                 INTEGER     PRIMARY KEY,
  codigo_subclasse               INTEGER     REFERENCES sisub.compras_servico_subclasse(codigo_subclasse),
  nome_servico                   TEXT        NOT NULL,
  codigo_cpc                     INTEGER,
  exclusivo_central_compras      BOOLEAN,
  status_servico                 BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao          TIMESTAMPTZ,
  synced_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_deactivation_detected_at TIMESTAMPTZ
);

-- Trigger: preserva first_deactivation_detected_at após primeiro preenchimento
CREATE OR REPLACE FUNCTION sisub.compras_servico_item_preserve_deactivation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.first_deactivation_detected_at IS NOT NULL THEN
    NEW.first_deactivation_detected_at := OLD.first_deactivation_detected_at;
    RETURN NEW;
  END IF;
  IF NEW.status_servico = false AND OLD.status_servico = true THEN
    NEW.first_deactivation_detected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compras_servico_item_deactivation
  BEFORE UPDATE ON sisub.compras_servico_item
  FOR EACH ROW EXECUTE FUNCTION sisub.compras_servico_item_preserve_deactivation();

CREATE OR REPLACE FUNCTION sisub.compras_servico_item_set_deactivation_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status_servico = false AND NEW.first_deactivation_detected_at IS NULL THEN
    NEW.first_deactivation_detected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compras_servico_item_deactivation_insert
  BEFORE INSERT ON sisub.compras_servico_item
  FOR EACH ROW EXECUTE FUNCTION sisub.compras_servico_item_set_deactivation_on_insert();

-- Unidade de Medida de Serviço — N:1 com Item
CREATE TABLE sisub.compras_servico_unidade_medida (
  id                    BIGSERIAL   PRIMARY KEY,
  codigo_servico        INTEGER     NOT NULL REFERENCES sisub.compras_servico_item(codigo_servico),
  sigla_unidade_medida  TEXT        NOT NULL,
  nome_unidade_medida   TEXT,
  status_unidade_medida BOOLEAN     NOT NULL DEFAULT true,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_servico, sigla_unidade_medida)
);

-- Natureza da Despesa (Serviço) — N:1 com Item
CREATE TABLE sisub.compras_servico_natureza_despesa (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_servico            INTEGER     NOT NULL REFERENCES sisub.compras_servico_item(codigo_servico),
  codigo_natureza_despesa   TEXT        NOT NULL,
  nome_natureza_despesa     TEXT        NOT NULL,
  status_natureza_despesa   BOOLEAN     NOT NULL DEFAULT true,
  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_servico, codigo_natureza_despesa)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OBSERVABILIDADE: compras_sync_log + compras_sync_step
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sisub.compras_sync_log (
  id                BIGSERIAL   PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  triggered_by      TEXT        NOT NULL DEFAULT 'cron',
  status            TEXT        NOT NULL DEFAULT 'running',
  total_steps       INTEGER     NOT NULL DEFAULT 15,
  completed_steps   INTEGER     NOT NULL DEFAULT 0,
  successful_steps  INTEGER     NOT NULL DEFAULT 0,
  failed_steps      INTEGER     NOT NULL DEFAULT 0,
  total_upserted    INTEGER     NOT NULL DEFAULT 0,
  total_deactivated INTEGER     NOT NULL DEFAULT 0,
  error_message     TEXT
);

CREATE INDEX idx_compras_sync_log_started_at
  ON sisub.compras_sync_log(started_at DESC);

CREATE TABLE sisub.compras_sync_step (
  id                  BIGSERIAL   PRIMARY KEY,
  sync_id             BIGINT      NOT NULL REFERENCES sisub.compras_sync_log(id) ON DELETE CASCADE,
  step_name           TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  current_page        INTEGER     NOT NULL DEFAULT 0,
  total_pages         INTEGER,
  records_upserted    INTEGER     NOT NULL DEFAULT 0,
  records_deactivated INTEGER     NOT NULL DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  UNIQUE (sync_id, step_name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNÇÕES AUXILIARES (incrementos atômicos via RPC)
-- ─────────────────────────────────────────────────────────────────────────────

-- Incrementa completed_steps + successful_steps
CREATE FUNCTION sisub.compras_sync_step_success(p_sync_id BIGINT, p_upserted INTEGER)
RETURNS void LANGUAGE sql AS $$
  UPDATE sisub.compras_sync_log
  SET
    completed_steps  = completed_steps + 1,
    successful_steps = successful_steps + 1,
    total_upserted   = total_upserted + p_upserted
  WHERE id = p_sync_id;
$$;

-- Incrementa completed_steps + failed_steps
CREATE FUNCTION sisub.compras_sync_step_failure(p_sync_id BIGINT)
RETURNS void LANGUAGE sql AS $$
  UPDATE sisub.compras_sync_log
  SET
    completed_steps = completed_steps + 1,
    failed_steps    = failed_steps + 1
  WHERE id = p_sync_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VÍNCULO DA TABELA product COM O CATMAT
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sisub.product
  ADD COLUMN catmat_item_codigo INTEGER
    REFERENCES sisub.compras_material_item(codigo_item)
    ON DELETE SET NULL;

CREATE INDEX idx_product_catmat_item_codigo
  ON sisub.product(catmat_item_codigo)
  WHERE catmat_item_codigo IS NOT NULL;
