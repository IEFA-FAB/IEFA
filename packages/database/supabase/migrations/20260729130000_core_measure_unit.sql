-- ============================================================================
-- Fase 2a (estoque): catálogo canônico de unidades de medida + normalização
-- ============================================================================
-- `measure_unit` hoje é texto livre com caixa inconsistente ('KG' vs 'kg') em
-- ~10 tabelas — a view kitchen.v_ingredient_kg_lt_items já compara com upper().
-- Um ledger de estoque não sobrevive a isso: este é o pré-requisito do módulo
-- inventory (openspec/changes/sisub-inventory-cycle).
--
-- O que esta migration faz (ADITIVA sobre dados vivos):
--   1. Cria core.measure_unit (catálogo canônico, código maiúsculo + dimensão).
--   2. Normaliza in-place as colunas de unidade das tabelas VIVAS via
--      upper(trim()) + mapa de sinônimos. Valores não-mapeáveis são
--      PRESERVADOS como estão (fila de revisão, item 3).
--   3. Cria core.v_measure_unit_review — fila de revisão dos valores que não
--      casaram com o catálogo (consumida pela UI admin).
--
-- Fora do escopo, de propósito:
--   - Snapshots congelados (procurement_list_snapshot_component e afins):
--     são registro histórico publicado, não se reescreve.
--   - CHECK/FK nas tabelas antigas: adoção gradual; só as tabelas novas do
--     módulo inventory nascem validando contra o catálogo.
-- ============================================================================

create table core.measure_unit (
  code text primary key
    check (code = upper(btrim(code)) and code <> ''),
  description text not null,
  -- 'mass' | 'volume' | 'count' são unidades-base de estoque;
  -- 'package' são unidades de fornecimento/embalagem (CX, FD, ...), válidas em
  -- compra mas nunca como unidade-base do ledger.
  dimension text not null
    check (dimension in ('mass', 'volume', 'count', 'package')),
  created_at timestamptz not null default now()
);

comment on table core.measure_unit is
  'Catálogo canônico de unidades de medida. Fonte de verdade para o módulo inventory; tabelas legadas migram gradualmente.';
comment on column core.measure_unit.dimension is
  'mass/volume/count = unidade-base de estoque; package = embalagem de compra (nunca unidade-base do ledger).';

alter table core.measure_unit enable row level security;

-- Catálogo é dado de referência: leitura aberta, escrita só via service_role.
create policy measure_unit_read on core.measure_unit
  for select to anon, authenticated using (true);

insert into core.measure_unit (code, description, dimension) values
  ('KG',   'Quilograma', 'mass'),
  ('G',    'Grama',      'mass'),
  ('LT',   'Litro',      'volume'),
  ('ML',   'Mililitro',  'volume'),
  ('UN',   'Unidade',    'count'),
  ('DZ',   'Dúzia',      'count'),
  ('CX',   'Caixa',      'package'),
  ('FD',   'Fardo',      'package'),
  ('SC',   'Saco',       'package'),
  ('PCT',  'Pacote',     'package'),
  ('LATA', 'Lata',       'package'),
  ('BDJ',  'Bandeja',    'package'),
  ('GL',   'Galão',      'package')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Normalização das tabelas vivas
-- ----------------------------------------------------------------------------
-- Resolução por valor: sinônimo → canônico; senão upper(trim()) se já for
-- código do catálogo; senão NULL (= preserva o valor original, vai pra fila).

create temporary table _unit_synonym (syn text primary key, canonical text not null)
  on commit drop;

insert into _unit_synonym (syn, canonical) values
  ('KILO', 'KG'), ('QUILO', 'KG'), ('KILOGRAMA', 'KG'), ('QUILOGRAMA', 'KG'),
  ('KGS', 'KG'), ('KG.', 'KG'),
  ('GR', 'G'), ('GRAMA', 'G'), ('GRAMAS', 'G'),
  ('L', 'LT'), ('LITRO', 'LT'), ('LITROS', 'LT'), ('LTS', 'LT'), ('LT.', 'LT'),
  ('MILILITRO', 'ML'), ('MILILITROS', 'ML'),
  ('UND', 'UN'), ('UNID', 'UN'), ('UNI', 'UN'), ('UNIDADE', 'UN'), ('UNIDADES', 'UN'),
  ('DUZIA', 'DZ'), ('DÚZIA', 'DZ'),
  ('CAIXA', 'CX'), ('CAIXAS', 'CX'),
  ('FARDO', 'FD'), ('FARDOS', 'FD'),
  ('SACO', 'SC'), ('SACOS', 'SC'),
  ('PACOTE', 'PCT'), ('PACOTES', 'PCT'),
  ('GALAO', 'GL'), ('GALÃO', 'GL'),
  ('BANDEJA', 'BDJ');

create or replace function pg_temp.resolve_unit(raw text) returns text
language sql stable as $$
  select coalesce(
    (select canonical from _unit_synonym where syn = upper(btrim(raw))),
    (select code from core.measure_unit where code = upper(btrim(raw)))
  );
$$;

update kitchen.ingredient t
  set measure_unit = pg_temp.resolve_unit(t.measure_unit)
  where t.measure_unit is not null
    and pg_temp.resolve_unit(t.measure_unit) is not null
    and pg_temp.resolve_unit(t.measure_unit) is distinct from t.measure_unit;

update kitchen.ingredient_item t
  set purchase_measure_unit = pg_temp.resolve_unit(t.purchase_measure_unit)
  where t.purchase_measure_unit is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is distinct from t.purchase_measure_unit;

update procurement.purchase_item t
  set purchase_measure_unit = pg_temp.resolve_unit(t.purchase_measure_unit)
  where t.purchase_measure_unit is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is distinct from t.purchase_measure_unit;

update procurement.procurement_list_item t
  set measure_unit = pg_temp.resolve_unit(t.measure_unit)
  where t.measure_unit is not null
    and pg_temp.resolve_unit(t.measure_unit) is not null
    and pg_temp.resolve_unit(t.measure_unit) is distinct from t.measure_unit;

update procurement.procurement_list_item t
  set purchase_measure_unit = pg_temp.resolve_unit(t.purchase_measure_unit)
  where t.purchase_measure_unit is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is not null
    and pg_temp.resolve_unit(t.purchase_measure_unit) is distinct from t.purchase_measure_unit;

-- ----------------------------------------------------------------------------
-- Fila de revisão: tudo que sobrou fora do catálogo nas tabelas vivas
-- ----------------------------------------------------------------------------
create view core.v_measure_unit_review
  with (security_invoker = true) as
select 'kitchen.ingredient' as source_table, id::text as source_id,
       coalesce(description, '') as source_description, measure_unit as raw_value
  from kitchen.ingredient
  where deleted_at is null and measure_unit is not null
    and measure_unit not in (select code from core.measure_unit)
union all
select 'kitchen.ingredient_item', id::text,
       coalesce(description, ''), purchase_measure_unit
  from kitchen.ingredient_item
  where deleted_at is null and purchase_measure_unit is not null
    and purchase_measure_unit not in (select code from core.measure_unit)
union all
select 'procurement.purchase_item', id::text,
       description, purchase_measure_unit
  from procurement.purchase_item
  where deleted_at is null and purchase_measure_unit is not null
    and purchase_measure_unit not in (select code from core.measure_unit)
union all
select 'procurement.procurement_list_item', id::text,
       ingredient_name, measure_unit
  from procurement.procurement_list_item
  where measure_unit is not null
    and measure_unit not in (select code from core.measure_unit)
union all
select 'procurement.procurement_list_item (compra)', id::text,
       ingredient_name, purchase_measure_unit
  from procurement.procurement_list_item
  where purchase_measure_unit is not null
    and purchase_measure_unit not in (select code from core.measure_unit);

comment on view core.v_measure_unit_review is
  'Unidades fora do catálogo canônico nas tabelas vivas — fila de revisão manual (UI admin). Ingrediente aqui listado fica bloqueado para movimentos de estoque.';
