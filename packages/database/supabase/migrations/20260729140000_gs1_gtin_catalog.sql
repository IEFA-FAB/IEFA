-- ============================================================================
-- Fase 2b (estoque): catálogo GTIN + GPC + mapa fornecedor→insumo (GS1)
-- ============================================================================
-- Primeiras tabelas do schema gs1_integration (reservado vazio desde
-- 20260624120000). Objetivo: identidade comercial dos insumos por GTIN
-- validado, com hierarquia de embalagem, para recebimento por scanner e
-- correlação automática NF-e → insumo (openspec/changes/sisub-inventory-cycle).
--
--   gtin                  — entidade GTIN (14 dígitos normalizados). O check
--                           digit é validado na APLICAÇÃO (sisub-domain);
--                           o banco garante apenas formato.
--   gpc_brick             — classificação GPC da GS1 (segmento→família→classe
--                           →brick), importada de publicação (idempotente).
--   supplier_product_map  — (CNPJ, cProd) → insumo; cobre NF-e "SEM GTIN" e
--                           aprende com resoluções manuais do matching.
--
-- Também: kitchen.ingredient_item ganha coluna gtin (FK) + UNIQUE parcial, e
-- o backfill migra barcode legado com check digit VÁLIDO (validação one-shot
-- via função temporária desta migration). Inválidos ficam em barcode e
-- aparecem na fila de revisão (UI da Fase 2b). Migração não-destrutiva:
-- barcode é preservado sempre.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Classificação GPC (referência importada — sem FK dura a partir de gtin,
-- a publicação pode chegar depois dos primeiros GTINs)
-- ----------------------------------------------------------------------------
create table gs1_integration.gpc_brick (
  brick_code text primary key,
  brick_title text not null,
  class_code text not null,
  class_title text not null,
  family_code text not null,
  family_title text not null,
  segment_code text not null,
  segment_title text not null,
  synced_at timestamptz not null default now()
);

comment on table gs1_integration.gpc_brick is
  'Publicação GPC (GS1): hierarquia segmento→família→classe→brick, achatada por brick. Import idempotente (padrão TACO/IBGE/USDA).';

create index gpc_brick_class_idx on gs1_integration.gpc_brick (class_code);
create index gpc_brick_segment_idx on gs1_integration.gpc_brick (segment_code);

-- ----------------------------------------------------------------------------
-- Entidade GTIN
-- ----------------------------------------------------------------------------
create table gs1_integration.gtin (
  gtin text primary key
    check (gtin ~ '^[0-9]{14}$'),
  description text,
  brand text,
  net_content numeric(12,4)
    check (net_content is null or net_content > 0),
  net_content_unit text
    references core.measure_unit (code),
  ncm text,
  gpc_brick_code text,
  -- hierarquia de embalagem: caixa (DUN-14) → unidade interna
  parent_gtin text
    references gs1_integration.gtin (gtin),
  units_per_parent integer
    check (units_per_parent is null or units_per_parent > 0),
  source text not null
    check (source in ('nfe', 'vbg', 'manual')),
  raw_payload jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- parent e fator andam juntos
  constraint gtin_parent_pair check ((parent_gtin is null) = (units_per_parent is null)),
  constraint gtin_not_own_parent check (parent_gtin is distinct from gtin)
);

comment on table gs1_integration.gtin is
  'GTIN normalizado a 14 dígitos (pad de zeros à esquerda). Check digit validado na aplicação; banco garante só formato. source: nfe (visto em NF-e autorizada) | vbg (Verified by GS1) | manual.';
comment on column gs1_integration.gtin.parent_gtin is
  'GTIN da embalagem que CONTÉM este (este = filho). units_per_parent = quantas unidades deste cabem no pai. Resolve cEAN (caixa) vs cEANTrib (unidade) da NF-e.';

create index gtin_parent_idx on gs1_integration.gtin (parent_gtin)
  where parent_gtin is not null;
create index gtin_gpc_brick_idx on gs1_integration.gtin (gpc_brick_code)
  where gpc_brick_code is not null;
create index gtin_ncm_idx on gs1_integration.gtin (ncm)
  where ncm is not null;

-- ----------------------------------------------------------------------------
-- Mapa fornecedor→insumo (cobre NF-e "SEM GTIN"; alimentado pelo matching)
-- ----------------------------------------------------------------------------
create table gs1_integration.supplier_product_map (
  id uuid primary key default gen_random_uuid(),
  supplier_cnpj text not null
    check (supplier_cnpj ~ '^[0-9]{14}$'),
  supplier_code text not null
    check (supplier_code <> ''),
  purchase_item_id uuid
    references procurement.purchase_item (id) on delete cascade,
  ingredient_item_id uuid
    references kitchen.ingredient_item (id) on delete cascade,
  confidence text not null default 'manual'
    check (confidence in ('manual', 'auto')),
  created_at timestamptz not null default now(),
  constraint supplier_product_map_target
    check (num_nonnulls(purchase_item_id, ingredient_item_id) >= 1),
  constraint supplier_product_map_key unique (supplier_cnpj, supplier_code)
);

comment on table gs1_integration.supplier_product_map is
  'Correlação (CNPJ emitente, det/prod/cProd) → insumo. Gravado a cada resolução manual do matching de NF-e: a próxima nota do mesmo fornecedor resolve sozinha.';

create index supplier_product_map_purchase_item_idx
  on gs1_integration.supplier_product_map (purchase_item_id);
create index supplier_product_map_ingredient_item_idx
  on gs1_integration.supplier_product_map (ingredient_item_id);

-- ----------------------------------------------------------------------------
-- RLS: leitura para authenticated (dados de referência/correlação);
-- escrita só via service_role (server fns) — sem policies de escrita.
-- ----------------------------------------------------------------------------
alter table gs1_integration.gpc_brick enable row level security;
alter table gs1_integration.gtin enable row level security;
alter table gs1_integration.supplier_product_map enable row level security;

create policy gpc_brick_read on gs1_integration.gpc_brick
  for select to authenticated using (true);
create policy gtin_read on gs1_integration.gtin
  for select to authenticated using (true);
create policy supplier_product_map_read on gs1_integration.supplier_product_map
  for select to authenticated using (true);

grant select on gs1_integration.gpc_brick, gs1_integration.gtin,
  gs1_integration.supplier_product_map to authenticated;

-- ----------------------------------------------------------------------------
-- kitchen.ingredient_item: coluna gtin + UNIQUE parcial
-- ----------------------------------------------------------------------------
alter table kitchen.ingredient_item
  add column gtin text references gs1_integration.gtin (gtin);

comment on column kitchen.ingredient_item.gtin is
  'GTIN validado (gs1_integration.gtin). Substitui gradualmente o barcode texto-livre; barcode permanece como legado até a fila de revisão zerar.';

create unique index ingredient_item_gtin_unique
  on kitchen.ingredient_item (gtin)
  where gtin is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- Backfill barcode → gtin (one-shot; check digit validado aqui via função
-- temporária — a validação permanente vive na aplicação)
-- ----------------------------------------------------------------------------
create or replace function pg_temp.gtin_normalize(raw text) returns text
language sql immutable as $$
  -- aceita GTIN-8/12/13/14; qualquer outra coisa → NULL
  select case
    when btrim(raw) ~ '^[0-9]{8}$' or btrim(raw) ~ '^[0-9]{12,14}$'
      then lpad(btrim(raw), 14, '0')
    else null
  end;
$$;

create or replace function pg_temp.gtin_check_digit_ok(g14 text) returns boolean
language sql immutable as $$
  -- GS1: sobre os 13 primeiros dígitos, pesos 3,1,3,1,... da esquerda;
  -- dígito verificador = (10 - soma mod 10) mod 10 = 14º dígito.
  select ((10 - (
    (select sum((substr(g14, i, 1))::int * case when i % 2 = 1 then 3 else 1 end)
       from generate_series(1, 13) i)
  ) % 10) % 10) = substr(g14, 14, 1)::int;
$$;

-- 1) cria as entidades GTIN dos barcodes válidos (source manual, descrição do item)
insert into gs1_integration.gtin (gtin, description, source)
select distinct on (pg_temp.gtin_normalize(ii.barcode))
       pg_temp.gtin_normalize(ii.barcode), ii.description, 'manual'
  from kitchen.ingredient_item ii
  where ii.barcode is not null
    and pg_temp.gtin_normalize(ii.barcode) is not null
    and pg_temp.gtin_check_digit_ok(pg_temp.gtin_normalize(ii.barcode))
on conflict (gtin) do nothing;

-- 2) vincula ao ingredient_item — apenas quando o barcode é único entre os
--    itens vivos (colisões ficam para a fila de revisão)
with candidates as (
  select ii.id,
         pg_temp.gtin_normalize(ii.barcode) as g14,
         count(*) over (partition by pg_temp.gtin_normalize(ii.barcode)) as n
    from kitchen.ingredient_item ii
    where ii.deleted_at is null
      and ii.barcode is not null
      and pg_temp.gtin_normalize(ii.barcode) is not null
      and pg_temp.gtin_check_digit_ok(pg_temp.gtin_normalize(ii.barcode))
)
update kitchen.ingredient_item t
   set gtin = c.g14
  from candidates c
 where t.id = c.id and c.n = 1;

-- ----------------------------------------------------------------------------
-- Fila de revisão: barcodes que não viraram gtin (inválidos ou colididos)
-- ----------------------------------------------------------------------------
create view gs1_integration.v_barcode_review
  with (security_invoker = true) as
select ii.id as ingredient_item_id,
       coalesce(ii.description, '') as description,
       ii.barcode as raw_barcode,
       ii.ingredient_id
  from kitchen.ingredient_item ii
  where ii.deleted_at is null
    and ii.barcode is not null
    and ii.gtin is null;

comment on view gs1_integration.v_barcode_review is
  'Barcodes legados que não migraram para GTIN (check digit inválido, formato estranho ou colisão entre itens vivos) — fila de revisão manual.';
