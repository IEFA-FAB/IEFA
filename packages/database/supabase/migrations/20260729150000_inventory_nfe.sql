-- ============================================================================
-- Fase 2c (estoque): ingestão de NF-e — documento + itens + matching
-- ============================================================================
-- Primeiras tabelas do schema inventory (reservado vazio desde 20260624120000).
-- A entrada de estoque nasce do XML da NF-e (layout 4.0), nunca de digitação:
--   nfe_document — 1 por chave de acesso (44 dígitos), XML íntegro guardado
--                  para auditoria (MCASP).
--   nfe_item     — espelho de cada <det>: cProd/cEAN/cEANTrib/NCM/uCom/qCom
--                  + grupo rastro (lote/validade, raro em alimentos) +
--                  resultado do pipeline de matching (GTIN → supplier map →
--                  sugestão → manual), espelhando o padrão catmat_match_status.
--
-- Conversão de quantidade NUNCA usa uCom (texto livre do emissor): usa o
-- conteúdo líquido do GTIN ou unit_content_quantity do ingredient_item —
-- por isso matched_qty_base pode ficar nulo até haver vínculo com conversão.
-- ============================================================================

create table inventory.nfe_document (
  id uuid primary key default gen_random_uuid(),
  access_key text not null
    check (access_key ~ '^[0-9]{44}$'),
  supplier_cnpj text
    check (supplier_cnpj is null or supplier_cnpj ~ '^[0-9]{14}$'),
  supplier_name text,
  dest_cnpj text,
  issued_at timestamptz,
  total_value numeric(14,2),
  xml text not null,
  status text not null default 'imported'
    check (status in ('imported', 'matched', 'received', 'divergent', 'cancelled')),
  -- cozinha destino (opcional na importação; obrigatória no recebimento, Fase 4)
  kitchen_id bigint references core.kitchen (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint nfe_document_access_key_key unique (access_key)
);

comment on table inventory.nfe_document is
  'NF-e de entrada (layout 4.0). XML íntegro preservado para auditoria; status matched quando todos os itens resolvem, received após recebimento definitivo (Fase 4).';

create index nfe_document_kitchen_idx on inventory.nfe_document (kitchen_id, created_at desc);
create index nfe_document_supplier_idx on inventory.nfe_document (supplier_cnpj);

create table inventory.nfe_item (
  id uuid primary key default gen_random_uuid(),
  nfe_document_id uuid not null
    references inventory.nfe_document (id) on delete cascade,
  n_item smallint not null,
  supplier_code text,          -- det/prod/cProd
  description text,            -- det/prod/xProd
  gtin text                    -- det/prod/cEAN normalizado a 14 dígitos ("SEM GTIN" → null)
    check (gtin is null or gtin ~ '^[0-9]{14}$'),
  gtin_trib text               -- det/prod/cEANTrib (unidade tributável)
    check (gtin_trib is null or gtin_trib ~ '^[0-9]{14}$'),
  ncm text,
  cest text,
  cfop text,
  commercial_unit text,        -- uCom — informativo, NUNCA base de conversão
  commercial_qty numeric(14,4),
  unit_price numeric(12,4),
  -- grupo rastro (quando presente): pré-preenche a conferência do recebimento
  lot_code text,
  lot_qty numeric(14,4),
  mfg_date date,
  expiry_date date,
  -- pipeline de matching
  match_status text not null default 'pending'
    check (match_status in ('pending', 'matched', 'review', 'no_match')),
  ingredient_item_id uuid references kitchen.ingredient_item (id) on delete set null,
  purchase_item_id uuid references procurement.purchase_item (id) on delete set null,
  ingredient_id uuid references kitchen.ingredient (id) on delete set null,
  matched_qty_base numeric(14,4),  -- qCom convertida à unidade base do ingredient
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfe_item_document_n_item_key unique (nfe_document_id, n_item)
);

comment on table inventory.nfe_item is
  'Item (<det>) da NF-e com resultado do matching. matched exige conversão resolvível (GTIN com conteúdo líquido ou ingredient_item com unit_content_quantity) — item sem conversão fica review.';

create index nfe_item_match_status_idx on inventory.nfe_item (match_status);
create index nfe_item_gtin_idx on inventory.nfe_item (gtin) where gtin is not null;

-- ----------------------------------------------------------------------------
-- Sugestão de candidatos para a fila de revisão manual:
-- trigram na descrição (índice GIN trgm já existe em purchase_item) com boost
-- quando o brick GPC coincide. Executada via service_role pelas server fns.
-- ----------------------------------------------------------------------------
create function inventory.suggest_purchase_items(
  p_description text,
  p_gpc_brick text default null,
  p_limit int default 5
) returns table (purchase_item_id uuid, description text, score real)
language sql stable
set search_path = ''
as $$
  -- sisub.catmat_similarity resolve pg_trgm em runtime (extensions/public) —
  -- neste banco a extensão não vive em `extensions`, então nada de
  -- referenciar similarity()/operator % com schema fixo.
  select pi.id,
         pi.description,
         ((case when p_gpc_brick is not null and pi.gpc_brick_code = p_gpc_brick then 0.3 else 0 end)
          + coalesce(sisub.catmat_similarity(pi.description, p_description), 0))::real as score
    from procurement.purchase_item pi
    where pi.deleted_at is null
      and (sisub.catmat_similarity(pi.description, p_description) > 0.3
           or (p_gpc_brick is not null and pi.gpc_brick_code = p_gpc_brick))
    order by score desc
    limit greatest(p_limit, 1);
$$;

comment on function inventory.suggest_purchase_items is
  'Candidatos de purchase_item para um item de NF-e sem match exato: similaridade trigram na descrição + boost por brick GPC.';

-- ----------------------------------------------------------------------------
-- RLS: DENY-ALL para anon/authenticated (sem policies). Todo acesso passa
-- pelas server fns (service role), que aplicam o PBAC `storage` escopado por
-- cozinha — uma policy `using (true)` exporia XML, CNPJs e valores de toda
-- NF-e a qualquer sessão autenticada via PostgREST.
-- ----------------------------------------------------------------------------
alter table inventory.nfe_document enable row level security;
alter table inventory.nfe_item enable row level security;
