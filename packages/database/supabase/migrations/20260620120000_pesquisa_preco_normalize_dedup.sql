-- ─── NORMALIZAÇÃO + DEDUPLICAÇÃO — MEMÓRIA DE CÁLCULO DA PESQUISA DE PREÇOS ──
--
-- Problema: `procurement_pesquisa_preco_amostra` armazenava o snapshot COMPLETO
-- de cada compra pública a CADA pesquisa. Como a pesquisa de preços é periódica
-- (Lei 14.133/2021, Art. 23), a mesma compra do Compras.gov.br era recopiada a
-- cada execução — ~61% das linhas eram re-armazenamento idêntico, com crescimento
-- O(pesquisas × amostras) sem teto.
--
-- Solução: separar FATO de PARTICIPAÇÃO.
--   • `compras_amostra`            → catálogo imutável de observações de compra,
--                                    deduplicado por fingerprint de CONTEÚDO.
--   • `procurement_pesquisa_preco_amostra` → ponte estreita
--                                    (research_item_id, amostra_id, sample_type, similarity).
--
-- Garantia de auditoria (ZERO perda): o fingerprint inclui TODOS os campos de
-- fato. Snapshots divergentes da mesma compra (ex.: correção de data na origem)
-- geram linhas distintas no catálogo → a memória de cálculo point-in-time de
-- cada pesquisa é preservada integralmente. `sample_type` e `similarity` são
-- por-pesquisa e permanecem na ponte.
--
-- Referência legal: Lei 14.133/2021 Art. 23; IN SEGES/ME 65/2021; TCU Acórdão 2471/2008.

-- ─── 1. Função IMMUTABLE de fingerprint de conteúdo ─────────────────────────
-- Usada tanto na coluna gerada do catálogo quanto no backfill da ponte,
-- garantindo cálculo idêntico nos dois lugares.

CREATE OR REPLACE FUNCTION sisub.compras_amostra_fingerprint(
  p_id_compra                       text,
  p_id_item_compra                  integer,
  p_descricao_item                  text,
  p_preco_unitario                  numeric,
  p_capacidade_unidade_fornecimento numeric,
  p_sigla_unidade_fornecimento      text,
  p_sigla_unidade_medida            text,
  p_quantidade                      numeric,
  p_codigo_uasg                     text,
  p_nome_uasg                       text,
  p_municipio                       text,
  p_estado                          text,
  p_esfera                          text,
  p_marca                           text,
  p_normalized_price                numeric,
  p_reference_date                  date
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT md5(
    coalesce(p_id_compra, '')                             || E'\x1f' ||
    coalesce(p_id_item_compra::text, '')                  || E'\x1f' ||
    coalesce(p_descricao_item, '')                        || E'\x1f' ||
    coalesce(p_preco_unitario::text, '')                  || E'\x1f' ||
    coalesce(p_capacidade_unidade_fornecimento::text, '') || E'\x1f' ||
    coalesce(p_sigla_unidade_fornecimento, '')            || E'\x1f' ||
    coalesce(p_sigla_unidade_medida, '')                  || E'\x1f' ||
    coalesce(p_quantidade::text, '')                      || E'\x1f' ||
    coalesce(p_codigo_uasg, '')                           || E'\x1f' ||
    coalesce(p_nome_uasg, '')                             || E'\x1f' ||
    coalesce(p_municipio, '')                             || E'\x1f' ||
    coalesce(p_estado, '')                                || E'\x1f' ||
    coalesce(p_esfera, '')                                || E'\x1f' ||
    coalesce(p_marca, '')                                 || E'\x1f' ||
    coalesce(p_normalized_price::text, '')                || E'\x1f' ||
    coalesce(p_reference_date::text, '')
  )
$$;

-- ─── 2. Catálogo de observações de compra (fatos imutáveis, deduplicados) ────

CREATE TABLE IF NOT EXISTS sisub.compras_amostra (
  id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campos externos (nomes originais do Compras.gov.br)
  id_compra                       text    NOT NULL,
  id_item_compra                  integer,
  descricao_item                  text,
  preco_unitario                  numeric(12,4),
  capacidade_unidade_fornecimento numeric(12,4),
  sigla_unidade_fornecimento      text,
  sigla_unidade_medida            text,
  quantidade                      numeric(14,4),
  codigo_uasg                     text,
  nome_uasg                       text,
  municipio                       text,
  estado                          text,
  esfera                          text,
  marca                           text,

  -- Campos internos derivados (função dos campos externos → também imutáveis)
  normalized_price                numeric(12,4),
  reference_date                  date,

  -- Identidade de UMA observação de compra (fingerprint de conteúdo)
  fingerprint text GENERATED ALWAYS AS (
    sisub.compras_amostra_fingerprint(
      id_compra, id_item_compra, descricao_item, preco_unitario,
      capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
      sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
      municipio, estado, esfera, marca, normalized_price, reference_date
    )
  ) STORED,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_amostra_fingerprint
  ON sisub.compras_amostra (fingerprint);
CREATE INDEX IF NOT EXISTS idx_compras_amostra_compra
  ON sisub.compras_amostra (id_compra, id_item_compra);

ALTER TABLE sisub.compras_amostra ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON sisub.compras_amostra TO anon, authenticated, service_role;

-- ─── 3. Backfill: popular catálogo a partir das amostras existentes ──────────
-- ON CONFLICT (fingerprint) DO NOTHING deduplica via a coluna gerada.

INSERT INTO sisub.compras_amostra (
  id_compra, id_item_compra, descricao_item, preco_unitario,
  capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
  sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
  municipio, estado, esfera, marca, normalized_price, reference_date
)
SELECT
  id_compra, id_item_compra, descricao_item, preco_unitario,
  capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
  sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
  municipio, estado, esfera, marca, normalized_price, reference_date
FROM sisub.procurement_pesquisa_preco_amostra
ON CONFLICT (fingerprint) DO NOTHING;

-- ─── 4. Religar a ponte ao catálogo ─────────────────────────────────────────

ALTER TABLE sisub.procurement_pesquisa_preco_amostra
  ADD COLUMN IF NOT EXISTS amostra_id uuid;

UPDATE sisub.procurement_pesquisa_preco_amostra b
SET amostra_id = ca.id
FROM sisub.compras_amostra ca
WHERE b.amostra_id IS NULL
  AND ca.fingerprint = sisub.compras_amostra_fingerprint(
    b.id_compra, b.id_item_compra, b.descricao_item, b.preco_unitario,
    b.capacidade_unidade_fornecimento, b.sigla_unidade_fornecimento,
    b.sigla_unidade_medida, b.quantidade, b.codigo_uasg, b.nome_uasg,
    b.municipio, b.estado, b.esfera, b.marca, b.normalized_price, b.reference_date
  );

-- Trava de segurança: aborta se alguma amostra não mapeou (deve ser zero).
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n
  FROM sisub.procurement_pesquisa_preco_amostra
  WHERE amostra_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % amostra(s) sem amostra_id', n;
  END IF;
END $$;

-- Defensivo: colapsa eventuais duplicatas (research_item_id, amostra_id)
-- antes do índice único (dados atuais já têm zero — futuro-prova).
DELETE FROM sisub.procurement_pesquisa_preco_amostra a
USING sisub.procurement_pesquisa_preco_amostra b
WHERE a.ctid < b.ctid
  AND a.research_item_id = b.research_item_id
  AND a.amostra_id = b.amostra_id;

ALTER TABLE sisub.procurement_pesquisa_preco_amostra
  ALTER COLUMN amostra_id SET NOT NULL;

ALTER TABLE sisub.procurement_pesquisa_preco_amostra
  ADD CONSTRAINT procurement_pesquisa_preco_amostra_amostra_id_fkey
  FOREIGN KEY (amostra_id) REFERENCES sisub.compras_amostra(id) ON DELETE RESTRICT;

-- Idempotência de inserção dentro de uma mesma pesquisa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_amostra_research_item_amostra
  ON sisub.procurement_pesquisa_preco_amostra (research_item_id, amostra_id);

-- ─── 5. Remover os campos de fato da ponte (agora vivem no catálogo) ─────────

ALTER TABLE sisub.procurement_pesquisa_preco_amostra
  DROP COLUMN IF EXISTS id_compra,
  DROP COLUMN IF EXISTS id_item_compra,
  DROP COLUMN IF EXISTS descricao_item,
  DROP COLUMN IF EXISTS preco_unitario,
  DROP COLUMN IF EXISTS capacidade_unidade_fornecimento,
  DROP COLUMN IF EXISTS sigla_unidade_fornecimento,
  DROP COLUMN IF EXISTS sigla_unidade_medida,
  DROP COLUMN IF EXISTS quantidade,
  DROP COLUMN IF EXISTS codigo_uasg,
  DROP COLUMN IF EXISTS nome_uasg,
  DROP COLUMN IF EXISTS municipio,
  DROP COLUMN IF EXISTS estado,
  DROP COLUMN IF EXISTS esfera,
  DROP COLUMN IF EXISTS marca,
  DROP COLUMN IF EXISTS normalized_price,
  DROP COLUMN IF EXISTS reference_date;

-- ─── 6. Chave de idempotência no cabeçalho da pesquisa ──────────────────────
-- Evita criar pesquisas duplicadas (mesmo item/ATA + mesmos parâmetros + mesmo
-- dia). Linhas históricas ficam com NULL (índice parcial não as restringe).

ALTER TABLE sisub.procurement_pesquisa_preco
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pesquisa_preco_idempotency
  ON sisub.procurement_pesquisa_preco (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 7. RPC de upsert idempotente do catálogo ───────────────────────────────
-- Insere as observações de compra deduplicando por fingerprint e devolve os ids
-- na MESMA ordem do array de entrada (existentes ou recém-criados). A app só
-- precisa montar a ponte com os ids retornados. SECURITY DEFINER: lógica
-- controlada que ignora RLS no catálogo.

CREATE OR REPLACE FUNCTION sisub.upsert_compras_amostras(p_samples jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sisub, public
AS $$
DECLARE
  r    jsonb;
  v_id uuid;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(p_samples) LOOP
    INSERT INTO sisub.compras_amostra (
      id_compra, id_item_compra, descricao_item, preco_unitario,
      capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
      sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
      municipio, estado, esfera, marca, normalized_price, reference_date
    )
    VALUES (
      r->>'id_compra',
      (r->>'id_item_compra')::integer,
      r->>'descricao_item',
      (r->>'preco_unitario')::numeric,
      (r->>'capacidade_unidade_fornecimento')::numeric,
      r->>'sigla_unidade_fornecimento',
      r->>'sigla_unidade_medida',
      (r->>'quantidade')::numeric,
      r->>'codigo_uasg',
      r->>'nome_uasg',
      r->>'municipio',
      r->>'estado',
      r->>'esfera',
      r->>'marca',
      (r->>'normalized_price')::numeric,
      (r->>'reference_date')::date
    )
    -- no-op update força RETURNING também na linha pré-existente
    ON CONFLICT (fingerprint) DO UPDATE
      SET id_compra = sisub.compras_amostra.id_compra
    RETURNING id INTO v_id;

    RETURN NEXT v_id;
  END LOOP;
END;
$$;

-- Segurança: a função é SECURITY DEFINER e ignora a RLS de compras_amostra.
-- O Postgres concede EXECUTE a PUBLIC por padrão na criação — revogamos e
-- liberamos apenas para service_role (único papel usado pelos escritores
-- server-side), impedindo "catalog poisoning" via REST anônimo/autenticado.
REVOKE ALL ON FUNCTION sisub.upsert_compras_amostras(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sisub.upsert_compras_amostras(jsonb) TO service_role;

-- Recarrega o cache do PostgREST (novo schema de tabela/coluna/função).
NOTIFY pgrst, 'reload schema';
