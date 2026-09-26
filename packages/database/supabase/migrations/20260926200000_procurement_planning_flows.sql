-- ============================================================================
-- Planejamento da contratação guiado (change `sisub-procurement-planning-flows`)
-- ============================================================================
-- 1. Segmentação: a OM monta as próprias contratações ("Carnes", "Estocáveis"),
--    cada uma no calendário de contratação (Decreto 10.947/2022, art. 11, III),
--    por regra de pasta do catálogo ou de item de compra.
-- 2. O anexo quantitativo passa a ser de uma contratação, com orçamento
--    sigiloso opcional e quantidade mínima a ser cotada (Lei 14.133, art. 82, II).
-- 3. A previsão de demanda da cozinha registra cada anexo em que entrou.
-- 4. A pesquisa de preços grava o agente responsável, o fornecedor e a conversão
--    de cada amostra; o relatório vira emissão registrada, reproduzível.
--
-- Tudo só do servidor (service_role): RLS ligada, sem policy, sem grant a
-- cliente. `procurement_segment` tem `unit_id` e já está declarada no guard de
-- reset de treino (PR #456).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Segmentação das contratações
-- ----------------------------------------------------------------------------
create table procurement.procurement_segment (
  id uuid primary key default gen_random_uuid(),
  unit_id integer not null references core.units (id),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  -- Mês previsto de início do processo no calendário de contratação.
  planned_month smallint check (planned_month between 1 and 12),
  -- Antecedência, em meses, com que o fluxo passa a lembrar da contratação.
  lead_time_months smallint not null default 5 check (lead_time_months between 0 and 12),
  -- Vigência padrão do anexo desta contratação (a ata de registro de preços).
  validity_months smallint not null default 12 check (validity_months between 1 and 120),
  -- Identificador da futura contratação no PCA (digitado; não há integração com o PGC).
  pca_identifier text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table procurement.procurement_segment is
  'Contratação (segmento) montada pela OM: recorte do que ela compra num mesmo processo, no calendário de contratação. "Grupo" e "lote" ficam reservados ao sentido da Lei 14.133.';

create unique index procurement_segment_unit_name_uq
  on procurement.procurement_segment (unit_id, lower(btrim(name)))
  where deleted_at is null;

alter table procurement.procurement_segment enable row level security;

create table procurement.procurement_segment_rule (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references procurement.procurement_segment (id) on delete cascade,
  mode text not null check (mode in ('include', 'exclude')),
  folder_id uuid references kitchen.folder (id),
  purchase_item_id uuid references procurement.purchase_item (id),
  created_at timestamptz not null default now(),
  constraint procurement_segment_rule_target_ck check (num_nonnulls(folder_id, purchase_item_id) = 1)
);

comment on table procurement.procurement_segment_rule is
  'Regra de uma contratação: inclui ou exclui uma pasta do catálogo (com as subpastas) ou um item de compra. A mais específica vence.';

create unique index procurement_segment_rule_folder_uq
  on procurement.procurement_segment_rule (segment_id, folder_id) where folder_id is not null;
create unique index procurement_segment_rule_item_uq
  on procurement.procurement_segment_rule (segment_id, purchase_item_id) where purchase_item_id is not null;

alter table procurement.procurement_segment_rule enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Anexo quantitativo de uma contratação
-- ----------------------------------------------------------------------------
-- Sem ação de delete: a contratação sai por soft delete e o anexo guarda a referência.
alter table procurement.procurement_list
  add column segment_id uuid references procurement.procurement_segment (id),
  add column is_budget_confidential boolean not null default false,
  add column min_quote_percent numeric(5,2) not null default 100
    check (min_quote_percent > 0 and min_quote_percent <= 100);

comment on column procurement.procurement_list.is_budget_confidential is
  'Orçamento sigiloso (Lei 14.133, art. 24; IN SEGES/ME 65/2021, art. 10): a tabela do anexo copiada para o TR sai sem preço e valor.';
comment on column procurement.procurement_list.min_quote_percent is
  'Quantidade mínima a ser cotada (Lei 14.133, art. 82, II), em % da quantidade máxima de cada item. 100 = o licitante cota a máxima inteira.';

create index procurement_list_segment_idx on procurement.procurement_list (segment_id) where segment_id is not null;

alter table procurement.procurement_list_snapshot_component
  add column min_quote_quantity numeric(14,4);

-- ----------------------------------------------------------------------------
-- 3. Previsão de demanda: cada anexo em que entrou
-- ----------------------------------------------------------------------------
alter table procurement.kitchen_ata_draft
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id);

create table procurement.kitchen_ata_draft_import (
  draft_id uuid not null references procurement.kitchen_ata_draft (id) on delete cascade,
  list_id uuid not null references procurement.procurement_list (id) on delete cascade,
  imported_by uuid references auth.users (id),
  imported_at timestamptz not null default now(),
  primary key (draft_id, list_id)
);

comment on table procurement.kitchen_ata_draft_import is
  'Importação de uma previsão de demanda da cozinha num anexo quantitativo. Uma previsão entra em vários anexos, um por contratação.';

create index kitchen_ata_draft_import_list_idx on procurement.kitchen_ata_draft_import (list_id);

alter table procurement.kitchen_ata_draft_import enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Pesquisa de preços auditável
-- ----------------------------------------------------------------------------
-- Agente responsável (IN SEGES/ME 65/2021, art. 3º, II).
alter table procurement.procurement_pesquisa_preco
  add column created_by uuid references auth.users (id);

-- Conversão para a unidade do item, por item pesquisado (a ponte é por pesquisa;
-- o catálogo `compras_amostra` é compartilhado entre itens de unidades diferentes).
alter table procurement.procurement_pesquisa_preco_amostra
  add column converted_price numeric(14,6),
  add column content_in_unit numeric(14,6),
  add column conversion text;

-- Fornecedor da observação. FORA do fingerprint (coluna gerada que deduplica):
-- a mesma compra com e sem fornecedor tem de ser a MESMA linha.
alter table procurement.compras_amostra
  add column ni_fornecedor text,
  add column nome_fornecedor text;

create or replace function procurement.upsert_compras_amostras(p_samples jsonb)
returns setof uuid
language plpgsql
security definer
set search_path to 'procurement', 'public'
as $function$
declare
  r    jsonb;
  v_id uuid;
begin
  for r in select value from jsonb_array_elements(p_samples) loop
    insert into procurement.compras_amostra (
      id_compra, id_item_compra, descricao_item, preco_unitario,
      capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
      sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
      municipio, estado, esfera, marca, normalized_price, reference_date,
      ni_fornecedor, nome_fornecedor
    )
    values (
      r->>'id_compra', (r->>'id_item_compra')::integer, r->>'descricao_item', (r->>'preco_unitario')::numeric,
      (r->>'capacidade_unidade_fornecimento')::numeric, r->>'sigla_unidade_fornecimento',
      r->>'sigla_unidade_medida', (r->>'quantidade')::numeric, r->>'codigo_uasg', r->>'nome_uasg',
      r->>'municipio', r->>'estado', r->>'esfera', r->>'marca', (r->>'normalized_price')::numeric, (r->>'reference_date')::date,
      r->>'ni_fornecedor', r->>'nome_fornecedor'
    )
    -- Linha pré-existente: devolve o id (RETURNING) e completa o fornecedor que faltava,
    -- sem nunca sobrescrever um já gravado.
    on conflict (fingerprint) do update set
      ni_fornecedor = coalesce(procurement.compras_amostra.ni_fornecedor, excluded.ni_fornecedor),
      nome_fornecedor = coalesce(procurement.compras_amostra.nome_fornecedor, excluded.nome_fornecedor)
    returning id into v_id;
    return next v_id;
  end loop;
end;
$function$;

-- `create or replace` preserva os privilégios; reafirmados para ficar explícito.
revoke all on function procurement.upsert_compras_amostras(jsonb) from public;
grant execute on function procurement.upsert_compras_amostras(jsonb) to service_role;

-- Emissão do relatório de pesquisa de preços: o preço do anexo segue vivo, então o
-- documento guarda o que usou. Linha nova por emissão, nunca UPDATE.
create table procurement.price_research_emission (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references procurement.procurement_list (id) on delete cascade,
  -- Número sequencial dentro do anexo (1, 2, 3…), impresso no relatório.
  sequence integer not null check (sequence > 0),
  emitted_by uuid references auth.users (id),
  emitted_at timestamptz not null default now(),
  -- SHA-256 (hex) do CSV da série, calculado no servidor.
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- [{ "list_item_id", "research_item_id" | null, "unit_price" | null }], na ordem do anexo.
  items jsonb not null,
  unique (list_id, sequence)
);

comment on table procurement.price_research_emission is
  'Emissão registrada do relatório de pesquisa de preços (IN SEGES/ME 65/2021, art. 3º): pesquisas e preços usados, e o SHA-256 da série. Reabrir a emissão regenera os mesmos bytes.';

alter table procurement.price_research_emission enable row level security;

create or replace function procurement.price_research_emission_immutable()
returns trigger
language plpgsql
set search_path to 'procurement', 'public'
as $$
begin
  raise exception 'price_research_emission é apenas-inserção: gere uma nova emissão';
end;
$$;

create trigger price_research_emission_no_update
  before update on procurement.price_research_emission
  for each row execute function procurement.price_research_emission_immutable();

notify pgrst, 'reload schema';
