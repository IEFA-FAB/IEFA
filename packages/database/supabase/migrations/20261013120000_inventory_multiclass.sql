-- ============================================================================
-- Estoque multiclasse: o SISPROV como dono de todo estoque
-- ============================================================================
-- Decisão do mantenedor em 13/10/2026 (openspec/changes/sisprov-foundation, D1 e D10 a D16):
-- o estoque de toda classe de suprimento vive em `inventory` e é regido pelo SISPROV; a
-- alimentação do sisub é uma classe dele, operada pela mesma tela de sempre.
--
-- Até aqui o ledger só conhecia alimentação: todo item era `ingredient_id` XOR
-- `frozen_preparation_id` e todo local era `kitchen_id`. Esta migration troca a chave para
-- (local, item):
--   (1) `core.item.catalog_scope` é a classe de suprimento e ganha `fardamento`;
--   (2) `kitchen.frozen_preparation` vira subtipo de `core.item`, como o ingrediente já é;
--   (3) `inventory.stock_location`: o local de estoque, um por cozinha no backfill e por
--       trigger no cadastro de cozinha;
--   (4) `kitchen_id` → `location_id` e `ingredient_id`/`frozen_preparation_id` → `item_id` em
--       toda tabela do `inventory` e em `procurement.supply_order`;
--   (5) trava de classe: item só entra em local que guarda a classe dele;
--   (6) funções e views recriadas sobre (local, item).
--
-- Feita com o ledger VAZIO em produção (piloto travado): as atualizações abaixo convertem o
-- que houver, mas o caso real é zero linha. Depois do primeiro movimento, esta migration não
-- tem inversa barata (design, Rollback).
--
-- O id do local NÃO é o id da cozinha: cada um tem a sua sequência. Quem chega pela cozinha
-- resolve o local por `stock_location.kitchen_id` (`inventory.kitchen_location`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Classe de suprimento
-- ----------------------------------------------------------------------------
alter table core.item drop constraint if exists item_catalog_scope_check;
alter table core.item add constraint item_catalog_scope_check
  check (catalog_scope in ('alimentacao', 'auxiliar', 'permanente', 'fardamento'));

comment on column core.item.catalog_scope is
  'Classe de suprimento do item. É o eixo que segrega o estoque por domínio: o local de estoque guarda um conjunto de classes (inventory.stock_location.supply_classes) e a tela de cada app mostra as suas.';

-- ----------------------------------------------------------------------------
-- (2) Preparação congelada como subtipo de core.item
-- ----------------------------------------------------------------------------
insert into core.item (id, kind, description, catalog_scope, measure_unit, created_at, deleted_at)
select
  fp.id,
  'insumo',
  coalesce(nullif(btrim(fp.description), ''), '(sem descrição — id ' || left(fp.id::text, 8) || ')'),
  'alimentacao',
  (select mu.code from core.measure_unit mu where mu.code = upper(btrim(fp.measure_unit))),
  fp.created_at,
  fp.deleted_at
from kitchen.frozen_preparation fp
on conflict (id) do nothing;

create function kitchen.frozen_preparation_sync_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into core.item (id, kind, description, catalog_scope, measure_unit, created_at, deleted_at)
    values (
      new.id,
      'insumo',
      coalesce(nullif(btrim(new.description), ''), '(sem descrição — id ' || left(new.id::text, 8) || ')'),
      'alimentacao',
      (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
      new.created_at,
      new.deleted_at
    )
    on conflict (id) do nothing;
    return new;
  end if;

  update core.item set
    description = coalesce(nullif(btrim(new.description), ''), description),
    measure_unit = (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
    deleted_at = new.deleted_at,
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger frozen_preparation_sync_item_ins
  before insert on kitchen.frozen_preparation
  for each row execute function kitchen.frozen_preparation_sync_item();
create trigger frozen_preparation_sync_item_upd
  after update on kitchen.frozen_preparation
  for each row execute function kitchen.frozen_preparation_sync_item();

alter table kitchen.frozen_preparation
  add constraint frozen_preparation_is_item foreign key (id) references core.item (id);

-- ----------------------------------------------------------------------------
-- (3) Local de estoque, com nível e abastecedor (design D11 e D17)
-- ----------------------------------------------------------------------------
-- Chave GS1 (GLN, SSCC…): só dígitos, com o dígito verificador de módulo 10 (pesos 3 e 1 da
-- direita para a esquerda, sem contar o próprio verificador). Imutável: serve a CHECK.
create function inventory.is_valid_gs1_key(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_code ~ '^[0-9]{8,18}$'
    and (
      10 - (
        select sum(substr(p_code, length(p_code) - 1 - i, 1)::int * case when i % 2 = 0 then 3 else 1 end)
        from generate_series(0, length(p_code) - 2) as i
      ) % 10
    ) % 10 = substr(p_code, length(p_code), 1)::int;
$$;

create table inventory.stock_location (
  id bigint generated always as identity primary key,
  -- OM dona do local: é o que o escopo `unit` do PBAC e o reset de treino leem
  unit_id bigint not null references core.units (id),
  -- só o local da cozinha; o sisub chega por aqui
  kitchen_id bigint unique references kitchen.kitchen (id),
  -- 1 depósito central · 2 distribuidor regional · 3 consumo e distribuição final (D17)
  level smallint not null check (level in (1, 2, 3)),
  -- quem abastece este local (a "distribuidora" do legado); nível estritamente menor, por trigger
  supplied_by_location_id bigint references inventory.stock_location (id),
  -- recebe do fornecedor sem passar pelo nível de cima ("receber direto" do legado)
  receives_direct boolean not null default false,
  -- GS1 Global Location Number, para etiqueta e EDI
  gln text unique check (gln is null or (length(gln) = 13 and inventory.is_valid_gs1_key(gln))),
  -- local endereçado (D18): posições, unidades de movimentação, separação
  uses_positions boolean not null default false,
  name text not null check (btrim(name) <> ''),
  -- classes (core.item.catalog_scope) que o local guarda
  supply_classes text[] not null check (
    cardinality(supply_classes) > 0
    and supply_classes <@ array['alimentacao', 'auxiliar', 'permanente', 'fardamento']::text[]
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint stock_location_kitchen_level check (kitchen_id is null or level = 3),
  -- a cozinha opera pelo texto de `stock_lot.location`; endereçamento é de depósito e almoxarifado
  constraint stock_location_kitchen_not_addressed check (kitchen_id is null or not uses_positions),
  constraint stock_location_level1_no_supplier check (level <> 1 or supplied_by_location_id is null),
  constraint stock_location_not_self_supplied check (supplied_by_location_id is distinct from id)
);

comment on table inventory.stock_location is
  'Local de estoque do SISPROV (depósito central, almoxarifado da OM, cozinha). Todo movimento, lote, contagem e OF é de um local. Nível 1/2/3 e abastecedor formam a árvore de abastecimento. A cozinha tem exatamente um, de nível 3, criado e mantido por trigger em kitchen.kitchen.';

create index stock_location_unit_idx on inventory.stock_location (unit_id);
create index stock_location_supplied_by_idx on inventory.stock_location (supplied_by_location_id);

-- Abastecedor: ativo e de nível ESTRITAMENTE menor. Nível decrescente na aresta já impede ciclo.
-- O nível do próprio local também não pode subir acima do de quem ele abastece.
create function inventory.stock_location_supply_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_supplier inventory.stock_location;
  v_conflict text;
begin
  if new.supplied_by_location_id is not null then
    select * into v_supplier from inventory.stock_location where id = new.supplied_by_location_id;
    if v_supplier.id is null or v_supplier.deleted_at is not null then
      raise exception 'STOCK_SUPPLIER_INVALID: o abastecedor % não existe ou está desativado', new.supplied_by_location_id
        using errcode = '23503';
    end if;
    if v_supplier.level >= new.level then
      raise exception 'STOCK_SUPPLIER_LEVEL: o local de nível % só pode ser abastecido por nível menor (o abastecedor é nível %)',
        new.level, v_supplier.level
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.uses_positions and not new.uses_positions
     and exists (select 1 from inventory.storage_position p where p.location_id = new.id and p.deleted_at is null) then
    raise exception 'STOCK_LOCATION_ADDRESSED: desative os endereços do local antes de desligar o endereçamento'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.level is distinct from old.level then
    select string_agg(c.name, ', ') into v_conflict
      from inventory.stock_location c
     where c.supplied_by_location_id = new.id and c.deleted_at is null and c.level <= new.level;
    if v_conflict is not null then
      raise exception 'STOCK_SUPPLIER_LEVEL: o local passa a nível % e abastece locais de nível igual ou menor (%)', new.level, v_conflict
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_location_supply_guard
  before insert or update of level, supplied_by_location_id, uses_positions on inventory.stock_location
  for each row execute function inventory.stock_location_supply_guard();

alter table inventory.stock_location enable row level security;
revoke all on inventory.stock_location from anon, authenticated;

create trigger stock_location_set_updated_at
  before update on inventory.stock_location
  for each row execute function sisub.set_updated_at();

insert into inventory.stock_location (unit_id, kitchen_id, level, receives_direct, name, supply_classes, created_at)
select
  k.unit_id,
  k.id,
  3,
  -- a cozinha recebe a NF-e do fornecedor hoje
  true,
  coalesce(nullif(btrim(k.display_name), ''), 'Cozinha ' || k.id),
  array['alimentacao', 'auxiliar'],
  k.created_at
from kitchen.kitchen k
where k.unit_id is not null
order by k.id;

-- Cozinha nova ganha o seu local; troca de OM ou de nome acompanha. Assim o cadastro de
-- cozinha do sisub não precisa saber que o estoque mudou de dono. Cozinha sem OM (`unit_id` é
-- anulável em kitchen.kitchen) fica sem local até ganhar uma: o local exige OM, e recusar aqui
-- quebraria o cadastro e a renomeação da cozinha, que não têm nada a ver com estoque.
create function kitchen.kitchen_sync_stock_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_id is null then
    return new;
  end if;

  insert into inventory.stock_location (unit_id, kitchen_id, level, receives_direct, name, supply_classes)
  values (
    new.unit_id,
    new.id,
    3,
    true,
    coalesce(nullif(btrim(new.display_name), ''), 'Cozinha ' || new.id),
    array['alimentacao', 'auxiliar']
  )
  on conflict (kitchen_id) do update set
    unit_id = excluded.unit_id,
    name = excluded.name;
  return new;
end;
$$;

create trigger kitchen_sync_stock_location
  after insert or update of unit_id, display_name on kitchen.kitchen
  for each row execute function kitchen.kitchen_sync_stock_location();

-- Resolve o local da cozinha. É o caminho de quem chega pela URL do sisub (`/storage/$kitchenId`).
create function inventory.kitchen_location(p_kitchen_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select l.id from inventory.stock_location l where l.kitchen_id = p_kitchen_id and l.deleted_at is null;
$$;

-- ----------------------------------------------------------------------------
-- (4) Troca da chave: views que dependem das colunas saem e voltam no fim
-- ----------------------------------------------------------------------------
drop view if exists inventory.v_lot_expiry;
drop view if exists inventory.v_stock_balance;
drop view if exists finance.v_physical_accounting_reconciliation;

-- Funções auxiliares SÓ desta migration (pg_temp some no fim da sessão). Cada tabela recebe a
-- coluna nova, preenchida a partir da antiga, e perde a antiga; índices e constraints que
-- citavam a antiga caem junto e são recriados explicitamente abaixo. Os triggers de usuário
-- ficam desligados durante o UPDATE: o ledger é append-only e o recebimento fechado é imutável,
-- e aqui não há operação de negócio, só a troca de chave.
create function pg_temp.kitchen_to_location(p_table regclass, p_not_null boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s add column location_id bigint references inventory.stock_location (id)', p_table);
  execute format('alter table %s disable trigger user', p_table);
  execute format(
    'update %s t set location_id = l.id from inventory.stock_location l where l.kitchen_id = t.kitchen_id',
    p_table
  );
  execute format('alter table %s enable trigger user', p_table);
  if p_not_null then
    execute format('alter table %s alter column location_id set not null', p_table);
  end if;
  execute format('alter table %s drop column kitchen_id', p_table);
end;
$$;

create function pg_temp.to_item(p_table regclass, p_has_frozen boolean, p_not_null boolean, p_on_delete text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'alter table %s add column item_id uuid references core.item (id) on delete %s',
    p_table,
    p_on_delete
  );
  execute format('alter table %s disable trigger user', p_table);
  if p_has_frozen then
    execute format('update %s set item_id = coalesce(ingredient_id, frozen_preparation_id)', p_table);
  else
    execute format('update %s set item_id = ingredient_id', p_table);
  end if;
  execute format('alter table %s enable trigger user', p_table);
  if p_not_null then
    execute format('alter table %s alter column item_id set not null', p_table);
  end if;
  execute format('alter table %s drop column ingredient_id', p_table);
  if p_has_frozen then
    execute format('alter table %s drop column frozen_preparation_id', p_table);
  end if;
end;
$$;

-- Local
select pg_temp.kitchen_to_location('inventory.stock_movement', true);
select pg_temp.kitchen_to_location('inventory.stock_lot', true);
select pg_temp.kitchen_to_location('inventory.stock_cost', true);
select pg_temp.kitchen_to_location('inventory.goods_receipt', true);
select pg_temp.kitchen_to_location('inventory.inventory_count', true);
select pg_temp.kitchen_to_location('inventory.count_scope_item', true);
select pg_temp.kitchen_to_location('inventory.monthly_closing', true);
select pg_temp.kitchen_to_location('inventory.opening_balance', true);
select pg_temp.kitchen_to_location('inventory.stock_adjustment', true);
select pg_temp.kitchen_to_location('inventory.stock_issue_request', true);
select pg_temp.kitchen_to_location('inventory.stock_policy', true);
select pg_temp.kitchen_to_location('inventory.scanner_profile', true);
select pg_temp.kitchen_to_location('inventory.kitchen_stock_settings', true);
-- nulo = política padrão de todas as cozinhas / NF-e ainda sem destino
select pg_temp.kitchen_to_location('inventory.expiry_alert_policy', false);
select pg_temp.kitchen_to_location('inventory.nfe_document', false);
select pg_temp.kitchen_to_location('procurement.supply_order', true);

-- Item
select pg_temp.to_item('inventory.stock_movement', true, true, 'restrict');
select pg_temp.to_item('inventory.stock_lot', true, true, 'restrict');
select pg_temp.to_item('inventory.stock_cost', true, true, 'restrict');
select pg_temp.to_item('inventory.goods_receipt_item', true, true, 'restrict');
select pg_temp.to_item('inventory.count_scope_item', true, true, 'restrict');
select pg_temp.to_item('inventory.inventory_count_entry', true, false, 'restrict');
select pg_temp.to_item('inventory.stock_adjustment_item', true, false, 'restrict');
select pg_temp.to_item('inventory.opening_balance_item', false, true, 'restrict');
select pg_temp.to_item('inventory.stock_issue_request_item', false, true, 'restrict');
select pg_temp.to_item('inventory.stock_policy', false, true, 'cascade');
select pg_temp.to_item('inventory.expiry_alert_policy', false, false, 'cascade');
select pg_temp.to_item('inventory.nfe_item', false, false, 'set null');

-- Configuração por local (era por cozinha). O nome da tabela segue a chave.
alter table inventory.kitchen_stock_settings rename to stock_location_settings;
alter table inventory.stock_location_settings add primary key (location_id);
comment on table inventory.stock_location_settings is
  'Tolerâncias, alçada e regime de segregação por local de estoque. Sem linha, valem os defaults (inventory.location_settings resolve).';

alter table inventory.scanner_profile add primary key (user_id, location_id);

-- ----------------------------------------------------------------------------
-- Constraints e índices no eixo novo (os que citavam as colunas antigas caíram com elas)
-- ----------------------------------------------------------------------------
-- Alvo "lote OU item": a contagem conta um lote ou um item sem lote; o ajuste mira um lote,
-- um item, ou os dois.
alter table inventory.inventory_count_entry
  add constraint count_entry_target check (num_nonnulls(lot_id, item_id) = 1);
alter table inventory.stock_adjustment_item
  add constraint stock_adjustment_item_target check (num_nonnulls(lot_id, item_id) >= 1);
alter table inventory.expiry_alert_policy
  add constraint expiry_alert_policy_target check ((item_id is null) <> (conservation_class is null));

alter table inventory.monthly_closing
  add constraint monthly_closing_location_competencia_key unique (location_id, competencia);
alter table inventory.stock_policy
  add constraint stock_policy_location_item_key unique (location_id, item_id);
alter table inventory.stock_issue_request_item
  add constraint stock_issue_request_item_key unique (request_id, item_id);
alter table inventory.stock_cost
  add constraint stock_cost_location_item_key unique (location_id, item_id);

create unique index count_scope_item_key on inventory.count_scope_item (count_id, item_id);
create unique index count_scope_item_open_key on inventory.count_scope_item (location_id, item_id) where open;
create index count_scope_item_location_id_fk_idx on inventory.count_scope_item (location_id);
create index count_scope_item_item_id_fk_idx on inventory.count_scope_item (item_id);

create unique index expiry_alert_policy_class_key
  on inventory.expiry_alert_policy (coalesce(location_id, 0::bigint), conservation_class)
  where conservation_class is not null;
create unique index expiry_alert_policy_item_key
  on inventory.expiry_alert_policy (coalesce(location_id, 0::bigint), item_id)
  where item_id is not null;
create index expiry_alert_policy_location_id_fk_idx on inventory.expiry_alert_policy (location_id);
create index expiry_alert_policy_item_id_fk_idx on inventory.expiry_alert_policy (item_id);

create index goods_receipt_location_idx on inventory.goods_receipt (location_id, status);
create index goods_receipt_item_item_id_fk_idx on inventory.goods_receipt_item (item_id);
create index inventory_count_location_id_fk_idx on inventory.inventory_count (location_id);
create index inventory_count_entry_item_id_fk_idx on inventory.inventory_count_entry (item_id);
create index nfe_document_location_idx on inventory.nfe_document (location_id, created_at desc);
create index nfe_item_item_id_fk_idx on inventory.nfe_item (item_id);
create index opening_balance_location_idx on inventory.opening_balance (location_id, created_at desc);
create unique index opening_balance_one_draft_per_location
  on inventory.opening_balance (location_id) where status = 'draft';
create index opening_balance_item_item_id_fk_idx on inventory.opening_balance_item (item_id);
create unique index opening_balance_item_unique_lot
  on inventory.opening_balance_item (opening_balance_id, item_id, coalesce(lot_code, ''), coalesce(expiry_date, 'infinity'::date));
create index scanner_profile_location_id_fk_idx on inventory.scanner_profile (location_id);
create index stock_adjustment_location_idx on inventory.stock_adjustment (location_id, created_at desc);
create index stock_adjustment_pending_idx on inventory.stock_adjustment (location_id) where status = 'pending_approval';
create index stock_adjustment_item_item_id_fk_idx on inventory.stock_adjustment_item (item_id);
create index stock_cost_item_id_fk_idx on inventory.stock_cost (item_id);
create index stock_issue_request_location_idx on inventory.stock_issue_request (location_id, issue_date desc);
create unique index stock_issue_request_production_day_key
  on inventory.stock_issue_request (location_id, issue_date) where origin = 'production';
create index stock_issue_request_item_item_id_fk_idx on inventory.stock_issue_request_item (item_id);
create index stock_lot_conservation_idx on inventory.stock_lot (location_id, conservation_class) where conservation_class is not null;
create index stock_lot_location_item_idx on inventory.stock_lot (location_id, item_id);
create index stock_lot_item_id_fk_idx on inventory.stock_lot (item_id);
create index stock_lot_quarantine_idx on inventory.stock_lot (location_id) where quarantined_at is not null;
create index stock_movement_location_item_idx on inventory.stock_movement (location_id, item_id);
create index stock_movement_item_id_fk_idx on inventory.stock_movement (item_id);
create index stock_movement_occurred_idx on inventory.stock_movement (location_id, occurred_at desc);
create index stock_policy_item_id_fk_idx on inventory.stock_policy (item_id);
create index supply_order_location_idx on procurement.supply_order (location_id, status);

-- ----------------------------------------------------------------------------
-- (5) Trava de classe: o item só entra em local que guarda a classe dele
-- ----------------------------------------------------------------------------
create function inventory.stock_class_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_class text;
  v_classes text[];
begin
  select i.catalog_scope into v_class from core.item i where i.id = new.item_id;
  select l.supply_classes into v_classes from inventory.stock_location l where l.id = new.location_id;
  if v_class is null or v_classes is null or not (v_class = any (v_classes)) then
    raise exception 'STOCK_CLASS_NOT_ALLOWED: o item % (classe %) não pode entrar no local % (guarda %)',
      new.item_id, coalesce(v_class, '?'), new.location_id, coalesce(array_to_string(v_classes, ', '), '?')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stock_movement_class_guard
  before insert on inventory.stock_movement
  for each row execute function inventory.stock_class_guard();
create trigger stock_lot_class_guard
  before insert or update of item_id, location_id on inventory.stock_lot
  for each row execute function inventory.stock_class_guard();

-- ----------------------------------------------------------------------------
-- (5b) Endereçamento (design D18): posições, lote endereçado, unidades de movimentação,
--      movimentação entre posições e lista de separação. Opcional por local
--      (`stock_location.uses_positions`): a cozinha continua com o texto de `stock_lot.location`.
-- ----------------------------------------------------------------------------

-- Profundidade do tipo de posição: a filha é sempre mais funda que a mãe.
create function inventory.position_kind_rank(p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'building' then 1 when 'sector' then 2 when 'rack' then 3 when 'shelf' then 4 when 'bin' then 5 end;
$$;

-- Saldo de um lote pelo ledger (o mesmo sinal da v_stock_balance).
create function inventory.lot_balance(p_lot_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(
    case
      when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then m.quantity
      else - m.quantity
    end
  ), 0)
  from inventory.stock_movement m
  where m.lot_id = p_lot_id;
$$;

create table inventory.storage_position (
  id bigint generated always as identity primary key,
  location_id bigint not null references inventory.stock_location (id),
  parent_id bigint references inventory.storage_position (id),
  kind text not null check (kind in ('building', 'sector', 'rack', 'shelf', 'bin')),
  -- segmento do endereço ("E05"); o endereço inteiro é derivado
  code text not null check (code ~ '^[A-Za-z0-9]{1,12}$'),
  -- caminho completo ("D1-S2-E05-P3"), mantido pelo trigger: é o que vai na etiqueta e na separação
  address text not null,
  -- corredor e tipo valem para a estante, como no legado
  aisle integer check (aisle is null or aisle > 0),
  rack_type text check (rack_type is null or btrim(rack_type) <> ''),
  -- ordem de separação: a lista de separação percorre as posições nesta ordem
  picking_sequence integer check (picking_sequence is null or picking_sequence >= 0),
  holds_stock boolean generated always as (kind in ('shelf', 'bin')) stored,
  -- última conferência física, gravada quando a contagem que a cobriu é aprovada
  last_counted_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint storage_position_not_self_parent check (parent_id is distinct from id),
  constraint storage_position_rack_fields check ((aisle is null and rack_type is null) or kind = 'rack')
);

comment on table inventory.storage_position is
  'Endereçamento do local de estoque (depósito > setor > estante > prateleira > escaninho). Só prateleira e escaninho guardam estoque. O endereço é derivado do caminho e único no local entre as posições ativas.';

create unique index storage_position_address_key on inventory.storage_position (location_id, address) where deleted_at is null;
create index storage_position_location_idx on inventory.storage_position (location_id);
create index storage_position_parent_idx on inventory.storage_position (parent_id);

alter table inventory.storage_position enable row level security;
revoke all on inventory.storage_position from anon, authenticated;

create trigger storage_position_set_updated_at
  before update on inventory.storage_position
  for each row execute function sisub.set_updated_at();

alter table inventory.stock_lot add column position_id bigint references inventory.storage_position (id);
comment on column inventory.stock_lot.position_id is
  'Posição onde o lote está guardado, num local endereçado. Nulo num local endereçado = pendente de endereçamento. Num local sem endereçamento, vale o texto de `location`.';
create index stock_lot_position_idx on inventory.stock_lot (position_id) where position_id is not null;

create table inventory.handling_unit (
  id uuid primary key default gen_random_uuid(),
  location_id bigint not null references inventory.stock_location (id),
  kind text not null check (kind in ('pallet', 'box')),
  -- caixa: SSCC (18 dígitos GS1); pallet: GIAI (até 30 caracteres)
  code text not null,
  -- caixa num pallet: a posição é a do pallet
  parent_id uuid references inventory.handling_unit (id),
  -- a caixa é de um lote; o pallet não
  lot_id uuid references inventory.stock_lot (id),
  position_id bigint references inventory.storage_position (id),
  quantity numeric(14, 4) check (quantity is null or quantity > 0),
  weight_kg numeric(12, 3) check (weight_kg is null or weight_kg > 0),
  box_category text check (box_category is null or btrim(box_category) <> ''),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint handling_unit_code_format check (
    (kind = 'box' and length(code) = 18 and inventory.is_valid_gs1_key(code))
    or (kind = 'pallet' and code ~ '^[0-9A-Za-z./:-]{4,30}$')
  ),
  constraint handling_unit_box_lot check ((kind = 'box') = (lot_id is not null)),
  constraint handling_unit_pallet_fields check (kind = 'box' or (parent_id is null and quantity is null and box_category is null)),
  constraint handling_unit_on_pallet_no_position check (parent_id is null or position_id is null),
  constraint handling_unit_not_self_parent check (parent_id is distinct from id)
);

comment on table inventory.handling_unit is
  'Unidade de movimentação de um local endereçado: pallet (GIAI) ou caixa/volume (SSCC) de um lote. A caixa num pallet acompanha a posição do pallet.';

create unique index handling_unit_code_open_key on inventory.handling_unit (kind, code) where closed_at is null;
create index handling_unit_location_idx on inventory.handling_unit (location_id);
create index handling_unit_lot_idx on inventory.handling_unit (lot_id);
create index handling_unit_parent_idx on inventory.handling_unit (parent_id);
create index handling_unit_position_idx on inventory.handling_unit (position_id);

alter table inventory.handling_unit enable row level security;
revoke all on inventory.handling_unit from anon, authenticated;

create table inventory.position_move (
  id uuid primary key default gen_random_uuid(),
  location_id bigint not null references inventory.stock_location (id),
  lot_id uuid references inventory.stock_lot (id),
  handling_unit_id uuid references inventory.handling_unit (id),
  from_position_id bigint references inventory.storage_position (id),
  to_position_id bigint references inventory.storage_position (id),
  -- caixa que entra ou sai de um pallet
  from_pallet_id uuid references inventory.handling_unit (id),
  to_pallet_id uuid references inventory.handling_unit (id),
  reason text check (reason is null or btrim(reason) <> ''),
  moved_by uuid references auth.users (id),
  moved_at timestamptz not null default now(),
  constraint position_move_target check (num_nonnulls(lot_id, handling_unit_id) = 1)
);

comment on table inventory.position_move is
  'Log append-only de quem guardou ou moveu lote ou unidade de movimentação entre posições. Não é movimento de estoque: saldo, custo e fechamento não mudam.';

create index position_move_location_idx on inventory.position_move (location_id, moved_at desc);
create index position_move_lot_idx on inventory.position_move (lot_id);
create index position_move_handling_unit_idx on inventory.position_move (handling_unit_id);

alter table inventory.position_move enable row level security;
revoke all on inventory.position_move from anon, authenticated;

create table inventory.picking_list (
  id uuid primary key default gen_random_uuid(),
  location_id bigint not null references inventory.stock_location (id),
  year integer not null,
  number integer not null check (number > 0),
  status text not null default 'open' check (status in ('open', 'picked', 'cancelled')),
  -- documento que a separação atende (OF, requisição, guia de remessa)
  reference text check (reference is null or btrim(reference) <> ''),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  constraint picking_list_number_key unique (location_id, year, number),
  constraint picking_list_closed check ((status = 'open') = (closed_at is null))
);

create table inventory.picking_list_line (
  id uuid primary key default gen_random_uuid(),
  picking_list_id uuid not null references inventory.picking_list (id) on delete cascade,
  line_number integer not null check (line_number > 0),
  item_id uuid not null references core.item (id),
  lot_id uuid references inventory.stock_lot (id),
  position_id bigint references inventory.storage_position (id),
  quantity numeric(14, 4) not null check (quantity > 0),
  -- linha de falta: o que foi pedido e não havia alocável (sem lote nem posição)
  shortage boolean not null default false,
  constraint picking_list_line_number_key unique (picking_list_id, line_number),
  constraint picking_list_line_shortage check (shortage = (lot_id is null))
);

comment on table inventory.picking_list is
  'Lista de separação numerada por local e ano: o roteiro de quem separa, em FEFO e na ordem de separação das posições. Não move estoque; a saída ou a transferência que ela sustenta é que move.';

create index picking_list_location_idx on inventory.picking_list (location_id, created_at desc);
create index picking_list_line_list_idx on inventory.picking_list_line (picking_list_id);
create index picking_list_line_item_idx on inventory.picking_list_line (item_id);
create index picking_list_line_lot_idx on inventory.picking_list_line (lot_id);
create index picking_list_line_position_idx on inventory.picking_list_line (position_id);

alter table inventory.picking_list enable row level security;
alter table inventory.picking_list_line enable row level security;
revoke all on inventory.picking_list, inventory.picking_list_line from anon, authenticated;

-- Posição: local endereçado e ativo, mãe do mesmo local e menos funda, endereço derivado.
-- Desativar exige não ter filha ativa nem estoque guardado.
create function inventory.storage_position_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_location inventory.stock_location;
  v_parent inventory.storage_position;
begin
  -- só a última conferência (ou o carimbo) mudou: nada a revalidar. A aprovação da contagem grava
  -- `last_counted_at` e não pode cair porque a mãe foi desativada depois.
  if tg_op = 'UPDATE'
     and (new.parent_id, new.kind, new.code, new.location_id, new.deleted_at, new.aisle, new.rack_type, new.picking_sequence)
         is not distinct from (old.parent_id, old.kind, old.code, old.location_id, old.deleted_at, old.aisle, old.rack_type, old.picking_sequence)
     and new.address is not distinct from old.address then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.location_id <> old.location_id then
    raise exception 'POSITION_LOCATION_IMMUTABLE: a posição não muda de local de estoque' using errcode = '23514';
  end if;

  select * into v_location from inventory.stock_location where id = new.location_id;
  if v_location.id is null or v_location.deleted_at is not null or not v_location.uses_positions then
    raise exception 'POSITION_LOCATION_NOT_ADDRESSED: o local % não é endereçado', new.location_id using errcode = '23514';
  end if;

  if new.parent_id is null then
    new.address := new.code;
  else
    select * into v_parent from inventory.storage_position where id = new.parent_id;
    if v_parent.id is null or v_parent.deleted_at is not null or v_parent.location_id <> new.location_id then
      raise exception 'POSITION_PARENT_INVALID: a posição mãe não existe, está desativada ou é de outro local' using errcode = '23514';
    end if;
    if inventory.position_kind_rank(v_parent.kind) >= inventory.position_kind_rank(new.kind) then
      raise exception 'POSITION_KIND_ORDER: % não pode ficar dentro de %', new.kind, v_parent.kind using errcode = '23514';
    end if;
    new.address := v_parent.address || '-' || new.code;
  end if;

  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    if exists (select 1 from inventory.storage_position c where c.parent_id = new.id and c.deleted_at is null) then
      raise exception 'POSITION_HAS_CHILDREN: desative antes as posições de dentro de %', new.address using errcode = '23514';
    end if;
    if exists (select 1 from inventory.stock_lot l where l.position_id = new.id and inventory.lot_balance(l.id) > 0)
       or exists (select 1 from inventory.handling_unit u where u.position_id = new.id and u.closed_at is null) then
      raise exception 'POSITION_HAS_STOCK: % guarda estoque; mova antes de desativar', new.address using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.holds_stock and new.kind not in ('shelf', 'bin')
     and exists (select 1 from inventory.stock_lot l where l.position_id = new.id) then
    raise exception 'POSITION_HAS_STOCK: % tem lote guardado e não pode deixar de guardar estoque', new.address using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger storage_position_guard
  before insert or update on inventory.storage_position
  for each row execute function inventory.storage_position_guard();

-- Endereço mudou (código ou mãe): as filhas recalculam o delas, em cascata.
create function inventory.storage_position_cascade_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- `address = ''`: força o guard a recalcular o endereço da filha a partir da mãe; `code = code`
  -- dispara o gatilho de cascata dela, que desce até a folha
  update inventory.storage_position
     set address = '', code = code
   where parent_id = new.id and deleted_at is null;
  return null;
end;
$$;

create trigger storage_position_cascade_address
  after update of code, parent_id on inventory.storage_position
  for each row when (old.address is distinct from new.address)
  execute function inventory.storage_position_cascade_address();

-- Lote guardado: posição ativa, que guarda estoque, do mesmo local.
create function inventory.stock_lot_position_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_position inventory.storage_position;
begin
  if new.position_id is null then
    return new;
  end if;
  select * into v_position from inventory.storage_position where id = new.position_id;
  if v_position.id is null or v_position.deleted_at is not null or v_position.location_id <> new.location_id then
    raise exception 'LOT_POSITION_INVALID: a posição % não existe, está desativada ou é de outro local', new.position_id
      using errcode = '23514';
  end if;
  if not v_position.holds_stock then
    raise exception 'LOT_POSITION_NOT_STORAGE: % é % e não guarda estoque (só prateleira e escaninho)', v_position.address, v_position.kind
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stock_lot_position_guard
  before insert or update of position_id, location_id on inventory.stock_lot
  for each row execute function inventory.stock_lot_position_guard();

-- Unidade de movimentação: local endereçado; lote, pallet e posição do mesmo local.
create function inventory.handling_unit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_location inventory.stock_location;
  v_parent inventory.handling_unit;
  v_position inventory.storage_position;
  v_lot_location bigint;
begin
  if tg_op = 'UPDATE' and new.location_id <> old.location_id then
    raise exception 'HANDLING_UNIT_LOCATION_IMMUTABLE: a unidade não muda de local; transfira o lote' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.lot_id is distinct from old.lot_id then
    raise exception 'HANDLING_UNIT_LOT_IMMUTABLE: a caixa não troca de lote; feche e cadastre outra' using errcode = '23514';
  end if;
  select * into v_location from inventory.stock_location where id = new.location_id;
  if v_location.id is null or not v_location.uses_positions then
    raise exception 'HANDLING_UNIT_LOCATION_NOT_ADDRESSED: o local % não é endereçado', new.location_id using errcode = '23514';
  end if;
  if new.lot_id is not null then
    select l.location_id into v_lot_location from inventory.stock_lot l where l.id = new.lot_id;
    if v_lot_location is distinct from new.location_id then
      raise exception 'HANDLING_UNIT_LOT_INVALID: o lote da caixa é de outro local' using errcode = '23514';
    end if;
  end if;
  if new.parent_id is not null then
    select * into v_parent from inventory.handling_unit where id = new.parent_id;
    if v_parent.id is null or v_parent.kind <> 'pallet' or v_parent.closed_at is not null or v_parent.location_id <> new.location_id then
      raise exception 'HANDLING_UNIT_PALLET_INVALID: a caixa só entra em pallet aberto do mesmo local' using errcode = '23514';
    end if;
  end if;
  if new.position_id is not null then
    select * into v_position from inventory.storage_position where id = new.position_id;
    if v_position.id is null or v_position.deleted_at is not null or v_position.location_id <> new.location_id or not v_position.holds_stock then
      raise exception 'HANDLING_UNIT_POSITION_INVALID: a posição não guarda estoque, está desativada ou é de outro local' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.closed_at is not null and old.closed_at is null and new.kind = 'pallet'
     and exists (select 1 from inventory.handling_unit c where c.parent_id = new.id and c.closed_at is null) then
    raise exception 'HANDLING_UNIT_PALLET_NOT_EMPTY: tire as caixas antes de fechar o pallet %', new.code using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger handling_unit_guard
  before insert or update on inventory.handling_unit
  for each row execute function inventory.handling_unit_guard();

-- O log de movimentação é append-only, como o ledger; só o reset de treino apaga.
create function inventory.position_move_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and inventory.training_reset_allows(old.location_id) then
    return old;
  end if;
  raise exception 'POSITION_MOVE_IMMUTABLE: a movimentação entre posições é registro; corrija com outra movimentação'
    using errcode = '42501';
end;
$$;

create trigger position_move_no_update_delete
  before update or delete on inventory.position_move
  for each row execute function inventory.position_move_immutable();

-- Guardar ou mover lote ou unidade: confere, atualiza e registra na mesma transação.
-- Lote e unidade solta vão para POSIÇÃO; caixa pode ir para um PALLET (e passa a seguir a posição dele).
create function inventory.move_to_position(
  p_lot_id uuid,
  p_handling_unit_id uuid,
  p_to_position_id bigint,
  p_to_pallet_id uuid,
  p_reason text,
  p_user uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lot inventory.stock_lot;
  v_unit inventory.handling_unit;
  v_move_id uuid;
begin
  if num_nonnulls(p_lot_id, p_handling_unit_id) <> 1 then
    raise exception 'MOVE_TARGET: informe o lote OU a unidade de movimentação' using errcode = '22023';
  end if;
  if num_nonnulls(p_to_position_id, p_to_pallet_id) <> 1 then
    raise exception 'MOVE_DESTINATION: informe a posição OU o pallet de destino' using errcode = '22023';
  end if;

  if p_lot_id is not null then
    if p_to_pallet_id is not null then
      raise exception 'MOVE_DESTINATION: lote vai para posição; para pôr no pallet, use a caixa do lote' using errcode = '22023';
    end if;
    select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
    if v_lot.id is null then
      raise exception 'Lote não encontrado' using errcode = 'P0002';
    end if;
    -- lote encaixotado é localizado pelas caixas: mover o lote deixaria as caixas para trás
    if exists (select 1 from inventory.handling_unit u where u.lot_id = p_lot_id and u.closed_at is null) then
      raise exception 'MOVE_LOT_IN_BOXES: o lote está em caixas; mova as caixas ou o pallet' using errcode = '22023';
    end if;
    if v_lot.position_id is not distinct from p_to_position_id then
      raise exception 'MOVE_SAME_POSITION: o lote já está nesta posição' using errcode = '22023';
    end if;
    update inventory.stock_lot set position_id = p_to_position_id where id = p_lot_id;
    insert into inventory.position_move (location_id, lot_id, from_position_id, to_position_id, reason, moved_by)
    values (v_lot.location_id, p_lot_id, v_lot.position_id, p_to_position_id, nullif(btrim(coalesce(p_reason, '')), ''), p_user)
    returning id into v_move_id;
    return v_move_id;
  end if;

  select * into v_unit from inventory.handling_unit where id = p_handling_unit_id for update;
  if v_unit.id is null or v_unit.closed_at is not null then
    raise exception 'Unidade de movimentação não encontrada ou fechada' using errcode = 'P0002';
  end if;
  if p_to_pallet_id is not null and v_unit.kind <> 'box' then
    raise exception 'MOVE_DESTINATION: só caixa entra em pallet' using errcode = '22023';
  end if;
  if p_to_pallet_id is not null then
    update inventory.handling_unit set parent_id = p_to_pallet_id, position_id = null where id = p_handling_unit_id;
  else
    update inventory.handling_unit set parent_id = null, position_id = p_to_position_id where id = p_handling_unit_id;
  end if;
  insert into inventory.position_move (
    location_id, handling_unit_id, from_position_id, to_position_id, from_pallet_id, to_pallet_id, reason, moved_by
  )
  values (
    v_unit.location_id, p_handling_unit_id, v_unit.position_id, p_to_position_id, v_unit.parent_id, p_to_pallet_id,
    nullif(btrim(coalesce(p_reason, '')), ''), p_user
  )
  returning id into v_move_id;
  return v_move_id;
end;
$$;

-- Lote encaixotado: a posição dele acompanha as caixas abertas (a da caixa, ou a do pallet em que
-- ela está). Caixas espalhadas em mais de uma posição: vale a primeira da rota de separação, onde
-- quem separa começa; a aba de pallets e caixas mostra o resto. Sem caixa posicionada, o lote fica
-- como está. Uma fonte só para a separação: `stock_lot.position_id`.
create function inventory.sync_lot_position_from_boxes(p_lot_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_position bigint;
begin
  select p.id into v_position
    from inventory.handling_unit b
    left join inventory.handling_unit pallet on pallet.id = b.parent_id
    join inventory.storage_position p on p.id = coalesce(b.position_id, pallet.position_id)
   where b.lot_id = p_lot_id and b.kind = 'box' and b.closed_at is null and p.deleted_at is null
   order by p.picking_sequence nulls last, p.address
   limit 1;
  if v_position is not null then
    update inventory.stock_lot set position_id = v_position where id = p_lot_id and position_id is distinct from v_position;
  end if;
end;
$$;

create function inventory.handling_unit_sync_lot_position()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lot uuid;
begin
  if new.kind = 'box' then
    perform inventory.sync_lot_position_from_boxes(new.lot_id);
  else
    for v_lot in select distinct b.lot_id from inventory.handling_unit b where b.parent_id = new.id and b.closed_at is null loop
      perform inventory.sync_lot_position_from_boxes(v_lot);
    end loop;
  end if;
  return null;
end;
$$;

create trigger handling_unit_sync_lot_position
  after insert or update of position_id, parent_id, closed_at on inventory.handling_unit
  for each row execute function inventory.handling_unit_sync_lot_position();

-- Lista de separação: FEFO entre os lotes alocáveis (fora de quarentena, dentro da validade,
-- com saldo), linhas na ordem de separação das posições; o que não há vira linha de falta.
create function inventory.create_picking_list(p_location_id bigint, p_lines jsonb, p_reference text, p_user uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_location inventory.stock_location;
  v_year integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_number integer;
  v_list_id uuid;
  v_line jsonb;
  v_item uuid;
  v_wanted numeric;
  v_take numeric;
  v_lot record;
  v_alloc jsonb := '[]'::jsonb;
begin
  select * into v_location from inventory.stock_location where id = p_location_id;
  if v_location.id is null or v_location.deleted_at is not null then
    raise exception 'Local de estoque não encontrado' using errcode = 'P0002';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'PICKING_EMPTY: informe ao menos um item' using errcode = '22023';
  end if;

  -- numeração por local e ano, sem buraco nem corrida
  perform pg_advisory_xact_lock(hashtextextended('picking:' || p_location_id || ':' || v_year, 42));
  select coalesce(max(number), 0) + 1 into v_number
    from inventory.picking_list where location_id = p_location_id and year = v_year;

  insert into inventory.picking_list (location_id, year, number, reference, created_by)
  values (p_location_id, v_year, v_number, nullif(btrim(coalesce(p_reference, '')), ''), p_user)
  returning id into v_list_id;

  if exists (
    select 1 from jsonb_array_elements(p_lines) as x
     where (x->>'item_id') is null or (x->>'quantity') is null or (x->>'quantity')::numeric <= 0
  ) then
    raise exception 'PICKING_LINE_INVALID: cada linha precisa de item_id e quantidade positiva' using errcode = '22023';
  end if;

  -- o mesmo item pedido em duas linhas soma: alocar as duas contra o saldo inteiro do lote
  -- prometeria duas vezes a mesma mercadoria
  for v_line in
    select jsonb_build_object('item_id', x->>'item_id', 'quantity', sum((x->>'quantity')::numeric))
      from jsonb_array_elements(p_lines) as x
     group by x->>'item_id'
     order by min(x->>'item_id')
  loop
    v_item := (v_line->>'item_id')::uuid;
    v_wanted := (v_line->>'quantity')::numeric;
    for v_lot in
      select l.id, l.position_id, inventory.lot_balance(l.id) as balance
        from inventory.stock_lot l
        left join inventory.storage_position p on p.id = l.position_id
       where l.location_id = p_location_id
         and l.item_id = v_item
         and l.quarantined_at is null
         and (l.expiry_date is null or l.expiry_date >= v_today)
       -- a mesma ordem da saída (`issue_stock`): "usar primeiro", validade, entrada; depois a rota
       order by l.use_first desc,
                coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
                l.received_at asc,
                p.picking_sequence nulls last,
                p.address nulls last,
                l.id
    loop
      exit when v_wanted <= 0;
      continue when v_lot.balance <= 0;
      v_take := least(v_wanted, v_lot.balance);
      v_alloc := v_alloc || jsonb_build_object(
        'item_id', v_item, 'lot_id', v_lot.id, 'position_id', v_lot.position_id, 'quantity', v_take, 'shortage', false
      );
      v_wanted := v_wanted - v_take;
    end loop;
    if v_wanted > 0 then
      v_alloc := v_alloc || jsonb_build_object(
        'item_id', v_item, 'lot_id', null, 'position_id', null, 'quantity', v_wanted, 'shortage', true
      );
    end if;
  end loop;

  insert into inventory.picking_list_line (picking_list_id, line_number, item_id, lot_id, position_id, quantity, shortage)
  select v_list_id,
         row_number() over (order by a.shortage, p.picking_sequence nulls last, p.address nulls last, a.item_id, a.lot_id),
         a.item_id, a.lot_id, a.position_id, a.quantity, a.shortage
    from jsonb_to_recordset(v_alloc) as a(item_id uuid, lot_id uuid, position_id bigint, quantity numeric, shortage boolean)
    left join inventory.storage_position p on p.id = a.position_id;

  return v_list_id;
end;
$$;

create function inventory.close_picking_list(p_list_id uuid, p_status text, p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_status not in ('picked', 'cancelled') then
    raise exception 'PICKING_STATUS: a lista fecha como separada ou cancelada' using errcode = '22023';
  end if;
  update inventory.picking_list
     set status = p_status, closed_by = p_user, closed_at = now()
   where id = p_list_id and status = 'open';
  if not found then
    raise exception 'PICKING_NOT_OPEN: a lista não existe ou já foi fechada' using errcode = 'P0002';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (6) Funções recriadas sobre (local, item), a partir das definições vigentes em 13/10/2026.
--     Mudou só o eixo: colunas, parâmetros, chaves JSONB e mensagens que citavam a cozinha
--     como local. Assinatura que mudou é DROP + CREATE (o EXECUTE do service_role vem do
--     default do schema).
-- ----------------------------------------------------------------------------

-- add_found_item: par ingrediente/preparação vira p_item_id; escopo grava location_id/item_id; mensagem cita local de estoque
drop function if exists inventory.add_found_item(uuid, uuid, uuid);
create function inventory.add_found_item(p_count_id uuid, p_item_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $function$
declare
  v_count inventory.inventory_count%rowtype;
begin
  if p_item_id is null then
    raise exception 'Informe o insumo OU a preparação';
  end if;
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('draft', 'counting') then
    raise exception 'Contagem em "%" não aceita achado', v_count.status;
  end if;

  if exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = p_count_id
       and s.item_id = p_item_id
  ) then
    return false;
  end if;

  begin
    insert into inventory.count_scope_item (count_id, location_id, item_id, found)
      values (p_count_id, v_count.location_id, p_item_id, true);
  exception when unique_violation then
    -- é o índice de sobreposição: o item está em OUTRA contagem aberta
    raise exception 'Este item está em outra contagem aberta neste local de estoque — conte-o lá';
  end;
  return true;
end;
$function$;

-- adjustment_requires_approval: kitchen_settings → location_settings; janela de 24 h por location_id
create or replace function inventory.adjustment_requires_approval(p_adjustment_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_doc inventory.stock_adjustment%rowtype;
  v_settings inventory.stock_location_settings;
  v_value numeric;
  v_window numeric;
begin
  select * into v_doc from inventory.stock_adjustment where id = p_adjustment_id;
  if not found then raise exception 'Ajuste não encontrado'; end if;
  v_settings := inventory.location_settings(v_doc.location_id);

  if exists (
    select 1 from inventory.stock_adjustment_item i
    where i.adjustment_id = p_adjustment_id
      and inventory.reason_always_requires_approval(i.reason_code)
  ) then
    return true;
  end if;

  v_value := inventory.adjustment_value(p_adjustment_id);

  select coalesce(sum(inventory.adjustment_value(a.id)), 0) into v_window
    from inventory.stock_adjustment a
    where a.location_id = v_doc.location_id
      and a.created_by is not distinct from v_doc.created_by
      and a.status = 'posted'
      and a.decided_at > now() - interval '24 hours';

  return (v_value + v_window) > v_settings.adjustment_approval_value;
end;
$function$;

-- adjustment_value: custo médio casado por (location_id, item_id)
create or replace function inventory.adjustment_value(p_adjustment_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select coalesce(sum(i.quantity * coalesce(i.unit_cost, c.avg_unit_cost, 0)), 0)
    from inventory.stock_adjustment_item i
    join inventory.stock_adjustment a on a.id = i.adjustment_id
    left join inventory.stock_lot l on l.id = i.lot_id
    left join inventory.stock_cost c
      on c.location_id = a.location_id
     and c.item_id = coalesce(i.item_id, l.item_id)
   where i.adjustment_id = p_adjustment_id;
$function$;

-- approve_inventory_count: eixo (local, item); produção pela cozinha do local; location_settings; count_lines.item_id; mensagem cita local de estoque
create or replace function inventory.approve_inventory_count(p_count_id uuid, p_actor uuid, p_exception_reason text default null::text)
returns table(adjustment_id uuid, lines integer, difference_value numeric)
language plpgsql
set search_path = ''
as $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_settings record;
  v_pending record;
  v_line record;
  v_lot record;
  v_adjustment_id uuid;
  v_lines int := 0;
  v_value numeric(14, 4) := 0;
  v_diff numeric(14, 4);
  v_remaining numeric(14, 4);
  v_take numeric(14, 4);
  v_counted_by_actor boolean;
  v_opened_by_actor boolean;
  v_first_opened timestamptz;
  v_chain uuid[];
  v_waiver text := nullif(btrim(coalesce(current_setting('inventory.pending_production_waiver', true), '')), '');
  v_waiver_note text;
  v_pending_days date[];
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  -- Só a coleta ENCERRADA se aprova. Aprovar em `counting` deixava lançamento
  -- chegando no meio cair numa contagem aprovada, fora do ajuste; e aprovar a
  -- rodada anterior, em `recount`, lançava o mesmo item duas vezes.
  if v_count.status <> 'review' then
    raise exception 'Contagem em "%" não está aguardando aprovação — encerre a coleta antes', v_count.status;
  end if;

  -- a cadeia de rodadas, desta até a primeira, travada na mesma ordem
  with recursive chain as (
    select c.id, c.parent_count_id from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  )
  select array_agg(id) into v_chain from chain;
  perform 1 from inventory.inventory_count where id = any (v_chain) order by id for update;
  -- As rodadas ANTERIORES têm de estar esperando por esta (`recount`). Uma que
  -- venceu soltou o escopo dela: outra contagem pode ter pegado os itens, e
  -- aprovar aqui os ajustaria duas vezes — além de ressuscitar a vencida.
  if exists (
    select 1 from inventory.inventory_count c
     where c.id = any (v_chain) and c.id <> p_count_id and c.status <> 'recount'
  ) then
    raise exception 'Uma rodada anterior desta contagem não está mais aguardando (venceu ou foi encerrada): a cadeia não pode ser aprovada';
  end if;
  select min(created_at) into v_first_opened from inventory.inventory_count where id = any (v_chain);

  -- ── pré-condição: baixa de produção ainda não lançada ──────────────────────
  -- A data da abertura é a CIVIL de Brasília: `created_at::date` casta em UTC,
  -- e a contagem aberta depois das 21h pulava o dia anterior.
  -- Tarefa com saída ligada a ela (Baixa por Produção, lançamento tardio) já
  -- está no saldo: contá-la travava a contagem de quem baixa pela produção.
  -- TODOS os dias pendentes, não só o primeiro: a ressalva registra cada um.
  -- A produção é da cozinha do local; local sem cozinha não tem produção.
  select array_agg(distinct t.production_date order by t.production_date) into v_pending_days
    from kitchen.production_task t
   where t.kitchen_id = (select sl.kitchen_id from inventory.stock_location sl where sl.id = v_count.location_id)
     and t.status = 'DONE'
     and t.production_date >= (v_first_opened at time zone 'America/Sao_Paulo')::date - 1
     and not exists (
       select 1 from inventory.stock_issue_request r
        where r.location_id = v_count.location_id
          and r.issue_date = coalesce(t.issue_date, t.production_date)
          and r.origin = 'production'
          and r.status <> 'open'
     )
     and not exists (
       select 1 from inventory.stock_movement m
        where m.production_task_id = t.id and m.type = 'production_issue' and not m.is_late_issue
     );
  if v_pending_days is not null then
    if v_waiver is null then
      -- Código próprio (P0W01) e os dias em ISO no HINT: a tela decide oferecer a
      -- ressalva pelo código, não pelo texto — reescrever a mensagem não a desliga.
      raise exception 'Há produção concluída em % sem a requisição do dia fechada: a contagem acusaria falta do que já saiu. Feche a requisição, lance a saída tardia, ou aprove com ressalva registrada',
        (select string_agg(to_char(d, 'DD/MM'), ', ' order by d) from unnest(v_pending_days) d)
        using errcode = 'P0W01',
              hint = (select string_agg(to_char(d, 'YYYY-MM-DD'), ',' order by d) from unnest(v_pending_days) d);
    end if;
    v_waiver_note := 'Produção de ' || (select string_agg(to_char(d, 'DD/MM/YYYY'), ', ' order by d) from unnest(v_pending_days) d)
      || ' sem saída lançada: ' || v_waiver;
  end if;

  -- ── pré-condição: recebimento provisório ──────────────────────────────────
  select r.id into v_pending
    from inventory.goods_receipt r
   where r.location_id = v_count.location_id and r.status = 'provisional'
   limit 1;
  if found then
    raise exception 'Há recebimento provisório em aberto: o material está na prateleira e não no saldo. Efetive-o antes de aprovar';
  end if;

  -- ── segregação, sobre a cadeia inteira ─────────────────────────────────────
  v_settings := inventory.location_settings(v_count.location_id);
  select exists (
    select 1 from inventory.inventory_count_entry e where e.count_id = any (v_chain) and e.counted_by = p_actor
  ) into v_counted_by_actor;
  select exists (
    select 1 from inventory.inventory_count c where c.id = any (v_chain) and c.created_by = p_actor
  ) into v_opened_by_actor;

  if v_settings.segregation = 'strict' then
    if v_counted_by_actor or v_opened_by_actor then
      raise exception 'Segregação estrita neste local de estoque: quem abriu ou contou em qualquer rodada desta contagem não pode aprová-la. Peça a aprovação a outro nível 3 de estoque';
    end if;
  elsif v_opened_by_actor and p_exception_reason is null then
    raise exception 'Quem abriu a contagem não a aprova: a aprovação precisa de outra pessoa, ou de uma exceção registrada';
  end if;

  -- ── o ajuste derivado ─────────────────────────────────────────────────────
  -- O AUTOR é quem abriu a contagem: o documento sai dela. Com o aprovador
  -- como autor, `post_stock_adjustment` via autoaprovação em toda divergência
  -- acima da alçada, e ninguém conseguia aprovar.
  insert into inventory.stock_adjustment (location_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.location_id, p_count_id,
            'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' (' || v_count.type || ')',
            coalesce(v_count.created_by, p_actor), now())
    returning id into v_adjustment_id;

  for v_line in
    select * from inventory.count_lines(p_count_id) cl where cl.counted_qty is not null
  loop
    v_diff := v_line.counted_qty - v_line.ledger_qty;
    continue when v_diff = 0;

    if v_line.lot_id is not null then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.lot_id,
         case when v_diff > 0 then 'in' else 'out' end, abs(v_diff),
         case when v_diff > 0 then 'count_gain' else 'count_loss' end,
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    elsif v_diff > 0 then
      -- sobra sem lote: entra num lote novo, como o ajuste de entrada sem lote
      insert into inventory.stock_adjustment_item
        (adjustment_id, item_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.item_id, 'in', v_diff, 'count_gain',
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    else
      -- Falta sem lote: sai dos lotes do item que a rodada NÃO contou por lote,
      -- o que vence antes primeiro. Saída de ajuste exige lote, e abortar a
      -- aprovação inteira por isso tornava inaprovável toda contagem de monte.
      v_remaining := -v_diff;
      -- Lote em QUARENTENA com saldo e não contado por lote: a falta não pode
      -- sair dele (o lançamento soltaria a quarentena) nem ser jogada nos lotes
      -- sadios (o suspeito ficaria com saldo que não existe). A quarentena já é
      -- separada na prateleira: conte-o por lote.
      select l.lot_code into v_pending
        from inventory.stock_lot l
       where l.location_id = v_count.location_id
         and l.item_id = v_line.item_id
         and l.quarantined_at is not null
         and not exists (
           select 1 from inventory.inventory_count_entry e
            where e.count_id = v_line.owner_count_id and e.lot_id = l.id
         )
         and (select coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                       then m.quantity else -m.quantity end), 0)
                from inventory.stock_movement m where m.lot_id = l.id) > 0
       limit 1;
      if found then
        raise exception 'O lote % está em quarentena e não foi contado por lote: conte-o por lote antes de aprovar a falta deste item', v_pending.lot_code;
      end if;
      for v_lot in
        select l.id,
               coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) as balance
          from inventory.stock_lot l
          left join inventory.stock_movement m on m.lot_id = l.id
         where l.location_id = v_count.location_id
           and l.item_id = v_line.item_id
           and not exists (
             select 1 from inventory.inventory_count_entry e
              where e.count_id = v_line.owner_count_id and e.lot_id = l.id
           )
           -- lote em quarentena não absorve falta: o lançamento do ajuste
           -- LIBERA a quarentena do lote que toca. Ele tem de ter sido contado
           -- por lote — a checagem logo acima recusa quando não foi.
           and l.quarantined_at is null
         group by l.id, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
         -- Compra que entrou DEPOIS do instante da contagem vai para o fim da
         -- fila: não estava na prateleira contada. Excluí-la de vez não serve —
         -- o lote aberto, porcionado ou descongelado depois da contagem também
         -- nasce depois, e o saldo dele ESTAVA na prateleira, dentro do lote de
         -- origem; sem ele a falta "não cabia" e a cadeia não se aprovava.
         order by (l.parent_lot_id is null and l.received_at > coalesce(v_line.counted_at, now())),
                  coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date), l.received_at, l.id
      loop
        exit when v_remaining <= 0;
        v_take := least(v_lot.balance, v_remaining);
        insert into inventory.stock_adjustment_item
          (adjustment_id, lot_id, direction, quantity, reason_code, note)
        values
          (v_adjustment_id, v_lot.id, 'out', v_take, 'count_loss',
           'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' — falta contada sem lote');
        v_lines := v_lines + 1;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then
        raise exception 'A falta de % contada sem lote não cabe nos lotes que não foram contados por lote. Conte este item por lote',
          -v_diff;
      end if;
    end if;
  end loop;

  if v_lines = 0 then
    -- contagem sem diferença nenhuma não gera documento contábil vazio
    delete from inventory.stock_adjustment where id = v_adjustment_id;
    v_adjustment_id := null;
  else
    perform inventory.post_stock_adjustment(v_adjustment_id, p_actor, p_exception_reason);
    select coalesce(sum(posted_value), 0) into v_value
      from inventory.stock_adjustment where id = v_adjustment_id;
  end if;

  -- a rodada aprovada e as anteriores saem juntas: o ajuste é da cadeia
  update inventory.inventory_count
     set status = 'approved',
         approved_by = p_actor,
         approved_at = now(),
         adjustment_id = v_adjustment_id,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = any (v_chain);
  -- a marca vale para a CADEIA: quem contou numa rodada anterior e aprovou a
  -- última não pode aparecer como aprovação segregada naquela rodada
  update inventory.inventory_count
     set approved_by_own_entry = v_counted_by_actor
   where id = any (v_chain);
  update inventory.inventory_count
     set approval_exception_reason = p_exception_reason,
         pending_production_waiver = v_waiver_note
   where id = p_count_id;

  -- última conferência das posições ativas onde estão os lotes CONTADOS (endereçamento, D18)
  update inventory.storage_position p
     set last_counted_at = now()
   where p.deleted_at is null
     and p.id in (
       select l.position_id
         from inventory.inventory_count_entry e
         join inventory.stock_lot l on l.id = e.lot_id
        where e.count_id = any (v_chain) and l.position_id is not null
     );

  return query select v_adjustment_id, v_lines, v_value;
end;
$function$;

-- balance_at: p_kitchen_id → p_location_id; par ingrediente/preparação vira p_item_id (5 → 4 parâmetros)
drop function if exists inventory.balance_at(bigint, uuid, uuid, uuid, timestamp with time zone);
create function inventory.balance_at(p_location_id bigint, p_lot_id uuid, p_item_id uuid, p_instant timestamp with time zone)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select coalesce(sum(
    case when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in')
         then m.quantity else -m.quantity end
  ), 0)
    from inventory.stock_movement m
   where m.location_id = p_location_id
     and m.occurred_at <= p_instant
     and (p_lot_id is null or m.lot_id = p_lot_id)
     and (p_lot_id is not null or m.item_id = p_item_id);
$function$;

-- close_month: p_kitchen_id → p_location_id; snapshot por item_id; trava consultiva 'inv_close:' pelo id do local
drop function if exists inventory.close_month(bigint, date, uuid);
create function inventory.close_month(p_location_id bigint, p_competencia date, p_user uuid)
returns table(closing_id uuid, items integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_start timestamptz := (v_competencia::timestamp) at time zone 'America/Sao_Paulo';
  v_next timestamptz := ((v_competencia + interval '1 month')::timestamp) at time zone 'America/Sao_Paulo';
  v_snapshot jsonb;
  v_items int;
  v_total_in numeric(14,4);
  v_total_out numeric(14,4);
  v_value_in numeric(14,4);
  v_value_out numeric(14,4);
  v_closing_value numeric(14,4);
  v_opening_value numeric(14,4);
  v_id uuid;
begin
  if v_competencia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date + interval '1 month' then
    raise exception 'Não é possível fechar competência futura';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inv_close:' || p_location_id, 42));

  with balances as (
    select
      m.item_id,
      sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
               then m.quantity else -m.quantity end) as quantity,
      sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
               then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as value
    from inventory.stock_movement m
    where m.location_id = p_location_id and m.occurred_at < v_next
    group by m.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', b.item_id,
           'quantity', b.quantity,
           'value', b.value)), '[]'::jsonb),
         count(*)::int,
         coalesce(sum(b.value), 0)
    into v_snapshot, v_items, v_closing_value
    from balances b
    where b.quantity <> 0 or b.value <> 0;

  select
    coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type not in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then coalesce(total_cost,0) end), 0),
    coalesce(sum(case when type not in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then coalesce(total_cost,0) end), 0)
    into v_total_in, v_total_out, v_value_in, v_value_out
    from inventory.stock_movement
    where location_id = p_location_id
      and occurred_at >= v_start and occurred_at < v_next;

  v_opening_value := v_closing_value - v_value_in + v_value_out;

  insert into inventory.monthly_closing
    (location_id, competencia, balance_snapshot, total_in, total_out, value_in, value_out,
     opening_value, closing_value, closed_by)
  values
    (p_location_id, v_competencia, v_snapshot, v_total_in, v_total_out, v_value_in, v_value_out,
     v_opening_value, v_closing_value, p_user)
  returning id into v_id;

  return query select v_id, v_items;
end;
$function$;

-- confirm_inventory_count: location_id no lote, no ajuste e na trava 'adjustment_threshold:'; mensagem cita local de estoque
create or replace function inventory.confirm_inventory_count(p_count_id uuid, p_user uuid)
returns table(adjustments integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_item record;
  v_balance numeric(14,4);
  v_adjustment_id uuid;
  v_adjustments int := 0;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  -- Mesma ordem de aquisição do `post_stock_adjustment`: trava consultiva do
  -- autor ANTES dos lotes. Esta função travava os lotes primeiro e só depois,
  -- dentro do post do ajuste derivado, pedia a trava do autor — o post comum
  -- faz o inverso. Ajuste e confirmação de contagem sobre o mesmo lote, do
  -- mesmo autor, se esperavam em cruz e o Postgres matava um dos dois.
  perform pg_advisory_xact_lock(
    hashtextextended('adjustment_threshold:' || v_count.location_id || ':' || coalesce(v_count.created_by::text, '-'), 42)
  );
  if v_count.status <> 'draft' then raise exception 'Contagem já confirmada'; end if;

  insert into inventory.stock_adjustment (location_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.location_id, p_count_id, 'Contagem física ' || p_count_id, v_count.created_by, now())
    returning id into v_adjustment_id;

  for v_item in
    select ci.lot_id, ci.counted_qty, l.location_id, l.item_id, l.lot_code
      from inventory.inventory_count_item ci
      join inventory.stock_lot l on l.id = ci.lot_id
      where ci.count_id = p_count_id
      for update of l
  loop
    if v_item.location_id <> v_count.location_id then
      raise exception 'Lote % pertence ao local de estoque %, não ao local de estoque da contagem (%)',
        v_item.lot_id, v_item.location_id, v_count.location_id;
    end if;

    select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then quantity else -quantity end), 0)
      into v_balance
      from inventory.stock_movement
      where lot_id = v_item.lot_id;

    update inventory.inventory_count_item
      set ledger_qty = v_balance
      where count_id = p_count_id and lot_id = v_item.lot_id;

    if v_item.counted_qty <> v_balance then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note, evidence_kind, evidence_reference)
      values
        (v_adjustment_id, v_item.lot_id,
         case when v_item.counted_qty > v_balance then 'in' else 'out' end,
         abs(v_item.counted_qty - v_balance),
         case when v_item.counted_qty > v_balance then 'count_gain' else 'count_loss' end,
         'Contagem física ' || p_count_id, 'report', p_count_id::text);
      v_adjustments := v_adjustments + 1;
    end if;
  end loop;

  if v_adjustments > 0 then
    -- a contagem é o ato de aprovação: quem confirma responde por ela
    perform inventory.post_stock_adjustment(v_adjustment_id, p_user, 'Ajuste derivado da contagem física confirmada');
  else
    update inventory.stock_adjustment set status = 'rejected', decided_by = p_user, decided_at = now(),
      rejection_reason = 'Contagem sem divergência — nenhum ajuste necessário'
      where id = v_adjustment_id;
  end if;

  update inventory.inventory_count
    set status = 'confirmed', confirmed_by = p_user, confirmed_at = now()
    where id = p_count_id;

  return query select v_adjustments;
end;
$function$;

-- count_entry_requires_counting: lote conferido por location_id; escopo casado por item_id; mensagem cita local de estoque
create or replace function inventory.count_entry_requires_counting()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_lot inventory.stock_lot%rowtype;
  v_item uuid;
begin
  -- `for share`: a aprovação trava a contagem `for update`; o lançamento que
  -- chega durante ela espera e encontra o status novo
  select * into v_count from inventory.inventory_count where id = coalesce(new.count_id, old.count_id) for share;
  if not found then
    -- CASCADE apagando a contagem
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Contagem não encontrada';
  end if;
  if v_count.status not in ('draft', 'counting') then
    raise exception 'Contagem em "%" não aceita lançamento', v_count.status;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.lot_id is not null then
    select * into v_lot from inventory.stock_lot where id = new.lot_id;
    if not found then raise exception 'Lote não encontrado'; end if;
    if v_lot.location_id <> v_count.location_id then
      raise exception 'O lote é de outro local de estoque';
    end if;
    v_item := v_lot.item_id;
  else
    v_item := new.item_id;
  end if;

  if not exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = new.count_id
       and s.item_id is not distinct from v_item
  ) then
    raise exception 'O item não está no escopo desta contagem — inclua-o como achado antes de contar';
  end if;

  -- o instante vale para a diferença: não pode ser antes da abertura (a
  -- contagem ainda não existia) nem no futuro
  if new.counted_at < v_count.created_at or new.counted_at > now() + interval '1 minute' then
    raise exception 'Instante do lançamento fora da contagem (% não está entre a abertura e agora)', new.counted_at;
  end if;
  return new;
end;
$function$;

-- count_lines: colunas de saída ingredient_id + frozen_preparation_id → item_id; saldo por location_id via balance_at novo
drop function if exists inventory.count_lines(uuid);
create function inventory.count_lines(p_count_id uuid)
returns table(lot_id uuid, item_id uuid, owner_count_id uuid, counted_qty numeric, entries integer, counted_at timestamp with time zone, ledger_qty numeric, accepted_not_counted boolean)
language sql
stable
set search_path = ''
as $function$
  with recursive chain as (
    select c.id, c.parent_count_id, c.round, c.location_id
      from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id, c.round, c.location_id
      from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  ),
  k as (select location_id from chain where id = p_count_id),
  owner as (
    select distinct on (s.item_id)
           s.item_id as item_key, s.count_id, s.not_counted_accepted
      from inventory.count_scope_item s
      join chain ch on ch.id = s.count_id
     order by s.item_id, ch.round desc
  ),
  entry as (
    select e.count_id, e.lot_id, e.quantity, e.counted_at, e.overwrite,
           coalesce(e.item_id, l.item_id) as itm
      from inventory.inventory_count_entry e
      left join inventory.stock_lot l on l.id = e.lot_id
      join owner o
        on o.count_id = e.count_id
       and o.item_key = coalesce(e.item_id, l.item_id)
  ),
  line as (
    -- a sobrescrita anula os lançamentos ANTERIORES a ela na mesma linha
    select e.count_id, e.lot_id, e.itm,
           count(*)::int as entries,
           max(e.counted_at) as counted_at,
           sum(e.quantity) filter (
             where e.counted_at >= coalesce(
               (select max(o2.counted_at) from entry o2
                 where o2.overwrite and o2.count_id = e.count_id
                   and o2.lot_id is not distinct from e.lot_id
                   and o2.itm is not distinct from e.itm),
               '-infinity'::timestamptz)
           ) as counted_qty
      from entry e
     group by e.count_id, e.lot_id, e.itm
  )
  select l.lot_id, l.itm, l.count_id, l.counted_qty, l.entries, l.counted_at,
         case
           when l.lot_id is not null then
             inventory.balance_at(k.location_id, l.lot_id, null, l.counted_at)
           else
             -- sem lote: o saldo do ITEM menos o dos lotes contados à parte na
             -- mesma rodada, todos no instante desta linha
             inventory.balance_at(k.location_id, null, l.itm, l.counted_at)
             - coalesce((
                 select sum(inventory.balance_at(k.location_id, x.lot_id, null, l.counted_at))
                   from line x
                  where x.lot_id is not null and x.count_id = l.count_id
                    and x.itm is not distinct from l.itm
               ), 0)
         end,
         false
    from line l cross join k
  union all
  -- item do escopo sem lançamento nenhum na rodada dona dele
  select null::uuid, o.item_key, o.count_id,
         case when o.not_counted_accepted then 0::numeric end,
         0, null::timestamptz,
         inventory.balance_at(k.location_id, null, o.item_key, now()),
         o.not_counted_accepted
    from owner o cross join k
   where not exists (
     select 1 from line x
      where x.count_id = o.count_id
        and x.itm is not distinct from o.item_key
   );
$function$;

-- count_round_same_kitchen: recontagem tem de ser do mesmo location_id; mensagem cita local de estoque (nome mantido: é o do trigger)
create or replace function inventory.count_round_same_kitchen()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_parent inventory.inventory_count%rowtype;
begin
  if new.parent_count_id is null then return new; end if;
  select * into v_parent from inventory.inventory_count where id = new.parent_count_id;
  if not found then raise exception 'Contagem anterior não encontrada'; end if;
  if v_parent.location_id <> new.location_id then
    raise exception 'Recontagem tem de ser do mesmo local de estoque da contagem anterior';
  end if;
  if new.round <= v_parent.round then
    raise exception 'Recontagem tem de ter rodada maior que a anterior (% <= %)', new.round, v_parent.round;
  end if;
  return new;
end;
$function$;

-- expiry_alert_days: p_kitchen_id → p_location_id, p_ingredient_id → p_item_id (tipos iguais, nomes mudam)
drop function if exists inventory.expiry_alert_days(bigint, uuid, text);
create function inventory.expiry_alert_days(p_location_id bigint, p_item_id uuid, p_conservation_class text)
returns integer
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select alert_days from inventory.expiry_alert_policy
      where location_id = p_location_id and item_id = p_item_id),
    (select alert_days from inventory.expiry_alert_policy
      where location_id = p_location_id and conservation_class = p_conservation_class),
    (select alert_days from inventory.expiry_alert_policy
      where location_id is null and item_id = p_item_id),
    (select alert_days from inventory.expiry_alert_policy
      where location_id is null and conservation_class = p_conservation_class),
    case p_conservation_class
      when 'resfriado' then 3
      when 'congelado' then 15
      else 30
    end
  );
$function$;

-- kitchen_settings → location_settings(p_location_id) returning inventory.stock_location_settings; default na ordem nova de colunas
drop function if exists inventory.kitchen_settings(bigint);
create function inventory.location_settings(p_location_id bigint)
returns inventory.stock_location_settings
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select s from inventory.stock_location_settings s where s.location_id = p_location_id),
    row('dual', 500, 10, 20, 5, 50, null, now(), p_location_id)::inventory.stock_location_settings
  );
$function$;

-- open_inventory_count: p_kitchen_id → p_location_id; candidatos por item_id; item_list lê scope_params 'item_ids'; menu_cycle pela cozinha do local; mensagens citam local de estoque
drop function if exists inventory.open_inventory_count(bigint, text, text, jsonb, boolean, text, uuid);
create function inventory.open_inventory_count(p_location_id bigint, p_type text, p_scope text, p_scope_params jsonb, p_blind boolean, p_blind_waiver_reason text, p_user uuid)
returns table(count_id uuid, scope_items integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
  v_items int := 0;
  v_conflict record;
  v_class text := p_scope_params->>'conservation_class';
  v_location text := p_scope_params->>'location';
  v_days int := coalesce((p_scope_params->>'days')::int, 7);
begin
  if p_blind is false and p_blind_waiver_reason is null then
    raise exception 'Contagem não cega exige o motivo registrado';
  end if;

  -- contagem vencida deixa de segurar o escopo dela
  -- Contagem vencida deixa de segurar o escopo dela — e vence com a CADEIA. A
  -- rodada anterior, em `recount`, não vence sozinha enquanto a recontagem dela
  -- estiver viva: soltaria os itens para outra contagem, e a aprovação da
  -- recontagem os ajustaria de novo. Quando a última rodada vence, as
  -- anteriores vencem com ela.
  with recursive vencidas as (
    update inventory.inventory_count
       set status = 'expired'
     where location_id = p_location_id
       and status in ('draft', 'counting', 'review')
       and expires_at < now()
    returning id, parent_count_id
  ),
  acima as (
    select parent_count_id as id from vencidas where parent_count_id is not null
    union
    select c.parent_count_id from inventory.inventory_count c join acima a on c.id = a.id where c.parent_count_id is not null
  )
  update inventory.inventory_count c
     set status = 'expired'
    from acima a
   where c.id = a.id and c.status = 'recount';

  insert into inventory.inventory_count (location_id, status, type, scope, scope_params, blind, blind_waiver_reason, created_by)
    values (p_location_id, 'counting', p_type, p_scope, coalesce(p_scope_params, '{}'::jsonb), p_blind, p_blind_waiver_reason, p_user)
    returning id into v_id;

  -- Itens do local: os que têm lote, e os que já se moveram alguma vez. O
  -- segundo conjunto importa porque item com saldo ZERO também se conta — é
  -- assim que a sobra esquecida na prateleira aparece.
  with candidatos as (
    -- Classe EFETIVA, a mesma de inventory.v_lot_expiry: a do lote, ou a da especificação
    -- padrão do insumo. Com a classe crua, lote sem classe (saldo de abertura, ajuste)
    -- sumia da contagem por classe.
    select distinct l.item_id,
           coalesce(l.conservation_class, (
             select pi.conservation_class
               from procurement.purchase_item_ingredient pii
               join procurement.purchase_item pi on pi.id = pii.purchase_item_id
              where pii.ingredient_id = l.item_id and pii.is_default
                and pi.deleted_at is null and pi.conservation_class is not null
              limit 1
           )) as conservation_class,
           l.location
      from inventory.stock_lot l
     where l.location_id = p_location_id
    union
    select distinct m.item_id, null::text, null::text
      from inventory.stock_movement m
     where m.location_id = p_location_id
  ),
  filtrados as (
    select c.item_id
      from candidatos c
     where case p_scope
             when 'full' then true
             when 'conservation_class' then c.conservation_class is not distinct from v_class
             when 'location' then c.location is not distinct from v_location
             when 'item_list' then c.item_id::text = any (
               select jsonb_array_elements_text(coalesce(p_scope_params->'item_ids', '[]'::jsonb))
             )
             when 'menu_cycle' then c.item_id in (
               -- ingredientes dos cardápios dos próximos N dias, lidos do
               -- snapshot da receita gravado no item de cardápio
               select (ing->>'ingredient_id')::uuid
                 from kitchen.production_task t
                 join kitchen.menu_items mi on mi.id = t.menu_item_id,
                      -- `menu_items.recipe` é `json`, não `jsonb`: sem o cast o
                      -- `coalesce` não tipa, e o erro aparece mesmo quando o
                      -- escopo escolhido nem é `menu_cycle` — o planner checa
                      -- todos os ramos do `case`
                      lateral jsonb_array_elements(coalesce(mi.recipe::jsonb->'ingredients', '[]'::jsonb)) ing
                where t.kitchen_id = (select sl.kitchen_id from inventory.stock_location sl where sl.id = p_location_id)
                  and t.production_date between (now() at time zone 'America/Sao_Paulo')::date
                                            and (now() at time zone 'America/Sao_Paulo')::date + v_days
                  and (ing->>'ingredient_id') is not null
             )
             else false
           end
       and c.item_id is not null
  )
  insert into inventory.count_scope_item (count_id, location_id, item_id)
    -- distinct: o item com lote E movimento aparece nas duas metades do union (com e sem classe)
  select distinct v_id, p_location_id, f.item_id from filtrados f;
  get diagnostics v_items = row_count;

  if v_items = 0 then
    raise exception 'O escopo escolhido não tem nenhum item neste local de estoque';
  end if;

  return query select v_id, v_items;
exception
  when unique_violation then
    -- traduz o índice de sobreposição no nome da contagem que conflita
    select c.id, c.type, c.scope, c.created_at into v_conflict
      from inventory.inventory_count c
      join inventory.count_scope_item s on s.count_id = c.id
     where c.location_id = p_location_id and s.open and c.id <> v_id
     limit 1;
    if found then
      raise exception 'Já existe contagem aberta neste local de estoque com itens em comum (% de %, escopo %). Encerre-a antes de abrir outra',
        v_conflict.type, to_char(v_conflict.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), v_conflict.scope;
    end if;
    raise;
end;
$function$;

-- open_recount: arrays p_ingredient_ids + p_frozen_preparation_ids → p_item_ids; scope_params grava 'item_ids'; escopo por location_id/item_id
drop function if exists inventory.open_recount(uuid, uuid[], uuid[], uuid);
create function inventory.open_recount(p_count_id uuid, p_item_ids uuid[], p_user uuid)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_id uuid;
  v_missing int;
  v_items uuid[] := coalesce(p_item_ids, '{}');
begin
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status <> 'review' then raise exception 'A recontagem sai da revisão da rodada anterior'; end if;
  if coalesce(array_length(v_items, 1), 0) = 0 then
    raise exception 'Escolha os itens a recontar';
  end if;

  -- só se reconta o que a rodada tinha no escopo
  select count(*) into v_missing
    from (select unnest(v_items) as id) i
   where not exists (select 1 from inventory.count_scope_item s where s.count_id = p_count_id and s.item_id = i.id);
  if v_missing > 0 then raise exception 'Item fora do escopo da rodada não se reconta'; end if;

  -- Os itens que NÃO vão para a recontagem ficam decididos AQUI: contados ou
  -- aceitos como não contados. Depois, a rodada passa a `recount` e não aceita
  -- mais nada — um não contado sem decisão ficaria para sempre sem zerar, e a
  -- aprovação o pularia calada.
  if exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = p_count_id
       and not s.not_counted_accepted
       and not coalesce(s.item_id = any (v_items), false)
       and not exists (
         select 1 from inventory.inventory_count_entry e
           left join inventory.stock_lot l on l.id = e.lot_id
          where e.count_id = p_count_id
            and coalesce(e.item_id, l.item_id) is not distinct from s.item_id
       )
  ) then
    raise exception 'Há item desta rodada sem lançamento e sem decisão: conte-o, aceite-o como não contado ou inclua-o na recontagem';
  end if;

  -- A rodada anterior passa a `recount` na MESMA transação em que a nova entra.
  -- Ela continua segurando o escopo dos itens que não vão ser recontados; só os
  -- recontados passam para a rodada nova.
  update inventory.inventory_count set status = 'recount' where id = p_count_id;
  update inventory.count_scope_item set open = false
   where count_id = p_count_id
     and item_id = any (v_items);

  insert into inventory.inventory_count
    (location_id, status, type, scope, scope_params, blind, round, parent_count_id, created_by)
  values
    (v_count.location_id, 'counting', v_count.type, 'item_list',
     jsonb_build_object('item_ids', to_jsonb(v_items)),
     true, v_count.round + 1, p_count_id, p_user)
  returning id into v_id;

  insert into inventory.count_scope_item (count_id, location_id, item_id)
    select v_id, v_count.location_id, i.id from (select distinct unnest(v_items) as id) i;

  return v_id;
end;
$function$;

-- opening_balance_item_require_draft: lê location_id do documento e chama training_reset_allows(location)
create or replace function inventory.opening_balance_item_require_draft()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_status text;
  v_location bigint;
  v_doc uuid := coalesce(new.opening_balance_id, old.opening_balance_id);
begin
  select status, location_id into v_status, v_location from inventory.opening_balance where id = v_doc for share;
  -- documento já apagado (cascade do pai): nada a proteger
  if not found then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and inventory.training_reset_allows(v_location) then
    return old;
  end if;
  if v_status <> 'draft' then
    raise exception 'Carga de abertura % já está % — linhas não podem mais mudar', v_doc, v_status;
  end if;
  return coalesce(new, old);
end;
$function$;

-- opening_balance_posted_immutable: training_reset_allows(old.location_id)
create or replace function inventory.opening_balance_posted_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if inventory.training_reset_allows(old.location_id) then
      return old;
    end if;
    raise exception 'Carga de abertura lançada não se apaga: ela é a origem dos lotes e dos movimentos de implantação';
  end if;
  raise exception 'Carga de abertura lançada não se altera (status %)', old.status;
end;
$function$;

-- post_opening_balance: eixo (local, item); unidade canônica do ingrediente por LEFT JOIN (outra classe: a de core.item); descrição de core.item; mensagem cita local de estoque
create or replace function inventory.post_opening_balance(p_opening_balance_id uuid, p_actor uuid)
returns table(movements integer, value numeric)
language plpgsql
set search_path = ''
as $function$
declare
  v_doc inventory.opening_balance%rowtype;
  v_item record;
  v_lot_id uuid;
  v_movement_id uuid;
  v_count int := 0;
  v_missing int;
  v_blocked text;
  v_bad_unit text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if p_actor is null then raise exception 'Ator obrigatório'; end if;

  select * into v_doc from inventory.opening_balance where id = p_opening_balance_id for update;
  if not found then raise exception 'Carga de abertura não encontrada'; end if;
  if v_doc.status <> 'draft' then raise exception 'Carga de abertura já está %', v_doc.status; end if;
  if not exists (select 1 from inventory.opening_balance_item where opening_balance_id = p_opening_balance_id) then
    raise exception 'Carga de abertura sem linhas';
  end if;

  select count(*) into v_missing
    from inventory.opening_balance_item
    where opening_balance_id = p_opening_balance_id and unit_cost is null;
  if v_missing > 0 then
    raise exception '% linha(s) sem custo — informe o custo de todas antes de lançar', v_missing;
  end if;

  -- insumo sem unidade canônica não movimenta estoque (mesma regra do ajuste);
  -- item de outra classe não tem `kitchen.ingredient`: vale a unidade de `core.item`
  select string_agg(distinct coalesce(ci.description, ci.id::text), ', ')
    into v_bad_unit
    from inventory.opening_balance_item it
    join core.item ci on ci.id = it.item_id
    left join kitchen.ingredient ing on ing.id = it.item_id
    left join core.measure_unit mu
      on mu.code = case when ing.id is not null then ing.measure_unit else ci.measure_unit end
    where it.opening_balance_id = p_opening_balance_id and mu.code is null;
  if v_bad_unit is not null then
    raise exception 'Insumo(s) sem unidade de medida canônica: % — resolva na fila de revisão antes de lançar', v_bad_unit;
  end if;

  -- Trava a linha de custo de cada item, em ordem de id (sem deadlock entre
  -- duas cargas), e SÓ ENTÃO confere se o item já movimentou. É a mesma trava
  -- que o gatilho de custeio toma em toda inserção de movimento.
  for v_item in
    select distinct item_id from inventory.opening_balance_item
     where opening_balance_id = p_opening_balance_id
     order by item_id
  loop
    insert into inventory.stock_cost (location_id, item_id)
      values (v_doc.location_id, v_item.item_id)
      on conflict do nothing;
    perform 1 from inventory.stock_cost
      where location_id = v_doc.location_id and item_id = v_item.item_id
      for update;
  end loop;

  select string_agg(distinct coalesce(ci.description, ci.id::text), ', ')
    into v_blocked
    from inventory.opening_balance_item it
    join core.item ci on ci.id = it.item_id
    where it.opening_balance_id = p_opening_balance_id
      and exists (select 1 from inventory.stock_movement m
                   where m.location_id = v_doc.location_id and m.item_id = it.item_id);
  if v_blocked is not null then
    raise exception 'Item(ns) já movimentado(s) neste local de estoque não entram na carga de abertura: %. Retire-os da planilha — o saldo deles se corrige por contagem', v_blocked;
  end if;

  for v_item in
    select * from inventory.opening_balance_item
     where opening_balance_id = p_opening_balance_id
     order by line_number, id
  loop
    insert into inventory.stock_lot
      (location_id, item_id, lot_code, expiry_date, location, unit_cost)
    values
      (v_doc.location_id, v_item.item_id,
       coalesce(v_item.lot_code, 'ABERTURA-' || to_char(v_today, 'YYYY-MM-DD')),
       v_item.expiry_date, v_item.location, v_item.unit_cost)
    returning id into v_lot_id;

    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, unit_cost, reason_code, justification, created_by)
    values
      (v_doc.location_id, v_item.item_id, v_lot_id, 'adjustment_in', v_item.quantity, v_item.unit_cost,
       'opening_balance', 'Carga de abertura ' || p_opening_balance_id || ', linha ' || v_item.line_number, p_actor)
    returning id into v_movement_id;

    update inventory.opening_balance_item
      set lot_id = v_lot_id, movement_id = v_movement_id
      where id = v_item.id;
    v_count := v_count + 1;
  end loop;

  update inventory.opening_balance
    set status = 'posted',
        posted_by = p_actor,
        posted_at = now(),
        updated_at = now(),
        posted_value = (select sum(quantity * unit_cost) from inventory.opening_balance_item
                         where opening_balance_id = p_opening_balance_id)
    where id = p_opening_balance_id;

  return query
    select v_count, (select posted_value from inventory.opening_balance where id = p_opening_balance_id);
end;
$function$;

-- post_stock_adjustment: location_settings; trava 'adjustment_threshold:' pelo id do local; lote e movimento em (location_id, item_id); mensagens citam local de estoque
create or replace function inventory.post_stock_adjustment(p_adjustment_id uuid, p_actor uuid, p_approval_exception_reason text default null::text)
returns table(movements integer, value numeric)
language plpgsql
set search_path = ''
as $function$
declare
  v_doc inventory.stock_adjustment%rowtype;
  v_settings inventory.stock_location_settings;
  v_item record;
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_movement_id uuid;
  v_count int := 0;
  v_requires boolean;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_doc from inventory.stock_adjustment where id = p_adjustment_id for update;
  if not found then raise exception 'Ajuste não encontrado'; end if;
  if v_doc.status = 'posted' then raise exception 'Ajuste já lançado'; end if;
  if v_doc.status = 'rejected' then raise exception 'Ajuste rejeitado não pode ser lançado'; end if;
  if not exists (select 1 from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id) then
    raise exception 'Ajuste sem itens';
  end if;

  v_settings := inventory.location_settings(v_doc.location_id);
  -- A exigência de aprovação é MONOTÔNICA: uma vez exigida, sempre exigida.
  --
  --   exige := fato gravado na criação  OR  regra reavaliada agora, sob trava
  --
  -- Nenhuma das duas metades basta sozinha, e este change já escorregou nas
  -- duas. Só a regra viva (versão anterior à 20260918160100) deixava o autor
  -- esperar 24 h, ou subir a alçada, e aprovar sozinho. Só o fato (a
  -- 20260918160100) deixava dois ajustes de R$ 600 do mesmo autor, criados quase
  -- juntos contra um limite de R$ 1.000, serem marcados "sem aprovação" antes de
  -- qualquer um lançar — e os dois passavam.
  --
  -- A trava consultiva serializa os lançamentos do MESMO autor no MESMO local de
  -- estoque: a regra soma o que já foi LANÇADO nas últimas 24 h, e sem a trava dois
  -- lançamentos simultâneos não se enxergariam. Com ela, o segundo espera o
  -- primeiro terminar e o encontra na janela.
  perform pg_advisory_xact_lock(
    hashtextextended('adjustment_threshold:' || v_doc.location_id || ':' || coalesce(v_doc.created_by::text, '-'), 42)
  );
  v_requires := coalesce(v_doc.approval_required, false) or inventory.adjustment_requires_approval(p_adjustment_id);

  if v_requires and v_doc.created_by is not distinct from p_actor then
    if v_settings.segregation = 'strict' then
      -- Em `strict` não há caminho de exceção: o ajuste espera a segunda pessoa.
      --
      -- A mensagem muda quando o documento veio de uma CONTAGEM, e não é
      -- detalhe: `confirm_inventory_count` cria o ajuste derivado com
      -- `created_by` = quem abriu a contagem e o lança aqui. Quem contou e
      -- tenta confirmar sozinho uma divergência acima da alçada é exatamente o
      -- que o `strict` recusa — mas a mensagem genérica falava de "o ajuste",
      -- um documento que o operador nunca criou e não encontra em tela
      -- nenhuma. O caminho existe e a mensagem passa a dizer qual é: outro
      -- nível 3 confirma a contagem.
      if v_doc.inventory_count_id is not null then
        raise exception 'Segregação estrita neste local de estoque: a contagem tem divergência acima da alçada e quem a registrou não pode confirmá-la. Peça a confirmação a outro nível 3 de estoque';
      end if;
      raise exception 'Segregação estrita neste local de estoque: quem lançou o ajuste não pode aprová-lo, nem com exceção registrada';
    end if;
    if p_approval_exception_reason is null then
      if v_doc.inventory_count_id is not null then
        raise exception 'Contagem com divergência acima da alçada precisa ser confirmada por alguém diferente de quem a registrou';
      end if;
      raise exception 'Ajuste acima da alçada (ou de motivo que sempre exige aprovação) precisa de aprovador diferente do autor';
    end if;
  end if;

  for v_item in
    select * from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id order by id
  loop
    if v_item.lot_id is not null then
      select * into v_lot from inventory.stock_lot where id = v_item.lot_id for update;
      if not found then raise exception 'Lote % não encontrado', v_item.lot_id; end if;
      if v_lot.location_id <> v_doc.location_id then
        raise exception 'Lote % não pertence ao local de estoque do ajuste', v_item.lot_id;
      end if;
    else
      if v_item.direction = 'out' then raise exception 'Saída de ajuste exige lote'; end if;
      insert into inventory.stock_lot (location_id, item_id, lot_code, unit_cost)
        values (v_doc.location_id, v_item.item_id,
                'SEM-LOTE-' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                v_item.unit_cost)
        returning * into v_lot;
      update inventory.stock_adjustment_item set lot_id = v_lot.id where id = v_item.id;
    end if;

    if v_item.direction = 'out' then
      select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then quantity else -quantity end), 0)
        into v_balance
        from inventory.stock_movement where lot_id = v_lot.id;
      if v_balance < v_item.quantity then
        raise exception 'Saldo insuficiente no lote % (% disponível)', v_lot.lot_code, v_balance;
      end if;
    end if;

    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, unit_cost,
       reason_code, justification, inventory_count_id, created_by)
    values
      (v_doc.location_id, v_lot.item_id, v_lot.id,
       case when v_item.direction = 'in' then 'adjustment_in' else 'adjustment_out' end,
       v_item.quantity, v_item.unit_cost, v_item.reason_code,
       coalesce(v_item.note, 'Ajuste ' || v_item.reason_code), v_doc.inventory_count_id, p_actor)
    returning id into v_movement_id;

    update inventory.stock_adjustment_item set movement_id = v_movement_id where id = v_item.id;
    v_count := v_count + 1;

    if v_lot.quarantined_at is not null then
      update inventory.stock_lot
        set quarantined_at = null, quarantined_by = null, quarantine_reason = null
        where id = v_lot.id;
    end if;
  end loop;

  update inventory.stock_adjustment
    set status = 'posted',
        decided_by = p_actor,
        decided_at = now(),
        approval_exception_reason = coalesce(p_approval_exception_reason, approval_exception_reason),
        posted_value = inventory.adjustment_value(p_adjustment_id)
    where id = p_adjustment_id;

  return query select v_count, inventory.adjustment_value(p_adjustment_id);
end;
$function$;

-- receipt_scan_event_immutable: training_reset_allows pelo location_id do recebimento
create or replace function inventory.receipt_scan_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
	if tg_op = 'DELETE'
		and inventory.training_reset_allows((select r.location_id from inventory.goods_receipt r where r.id = old.receipt_id)) then
		return old;
	end if;
	raise exception 'receipt_scan_event é append-only: para desfazer uma leitura, grave um evento de estorno';
end;
$function$;

-- save_opening_balance_draft: p_kitchen_id → p_location_id; chave 'ingredient_id' de p_items vira 'item_id'; linhas gravam item_id
drop function if exists inventory.save_opening_balance_draft(bigint, uuid, text, text, jsonb, jsonb);
create function inventory.save_opening_balance_draft(p_location_id bigint, p_actor uuid, p_source text, p_source_filename text, p_items jsonb, p_rejections jsonb)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_doc uuid;
  v_kept jsonb;
begin
  if p_actor is null then raise exception 'Ator obrigatório'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Linhas devem ser uma lista'; end if;

  select id into v_doc from inventory.opening_balance
    where location_id = p_location_id and status = 'draft'
    for update;

  if v_doc is null then
    insert into inventory.opening_balance (location_id, source, source_filename, import_rejections, created_by)
      values (p_location_id, p_source, p_source_filename, coalesce(p_rejections, '[]'::jsonb), p_actor)
      returning id into v_doc;
  else
    update inventory.opening_balance
      set source = p_source,
          source_filename = p_source_filename,
          import_rejections = coalesce(p_rejections, '[]'::jsonb),
          updated_at = now()
      where id = v_doc;
  end if;

  -- custos já informados, pela identidade da mercadoria
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id, 'lot_code', coalesce(lot_code, ''),
      'expiry_date', coalesce(expiry_date, 'infinity'::date),
      'unit_cost', unit_cost, 'cost_source', cost_source, 'cost_reference', cost_reference)), '[]'::jsonb)
    into v_kept
    from inventory.opening_balance_item
    where opening_balance_id = v_doc and unit_cost is not null;

  delete from inventory.opening_balance_item where opening_balance_id = v_doc;

  -- O custo preservado entra por JOIN de igualdade sobre duas listas EXPANDIDAS, e não por
  -- `lateral` correlacionado varrendo o jsonb a cada linha: com o teto de 5.000 linhas, a
  -- varredura por linha é quadrática e a reimportação de uma planilha já custeada estourava
  -- o tempo da requisição. Assim o planejador resolve com hash join.
  with novo as (
    select (i->>'line_number')::int as line_number,
           (i->>'item_id')::uuid as item_id,
           (i->>'quantity')::numeric as quantity,
           nullif(i->>'lot_code', '') as lot_code,
           nullif(i->>'expiry_date', '')::date as expiry_date,
           nullif(i->>'location', '') as location,
           coalesce(nullif(i->>'lot_code', ''), '') as lot_key,
           coalesce(nullif(i->>'expiry_date', '')::date, 'infinity'::date) as expiry_key
      from jsonb_array_elements(p_items) i
  ), custo as (
    select distinct on (item_id, lot_key, expiry_key)
           (k->>'item_id')::uuid as item_id,
           k->>'lot_code' as lot_key,
           (k->>'expiry_date')::date as expiry_key,
           (k->>'unit_cost')::numeric as unit_cost,
           k->>'cost_source' as cost_source,
           k->>'cost_reference' as cost_reference
      from jsonb_array_elements(v_kept) k
  )
  insert into inventory.opening_balance_item
    (opening_balance_id, line_number, item_id, quantity, lot_code, expiry_date, location,
     unit_cost, cost_source, cost_reference)
  select v_doc, n.line_number, n.item_id, n.quantity, n.lot_code, n.expiry_date, n.location,
         c.unit_cost, c.cost_source, c.cost_reference
    from novo n
    left join custo c
      on c.item_id = n.item_id and c.lot_key = n.lot_key and c.expiry_key = n.expiry_key;

  return v_doc;
end;
$function$;

-- set_not_counted_accepted: par ingrediente/preparação vira p_item_id; escopo casado por item_id
drop function if exists inventory.set_not_counted_accepted(uuid, uuid, uuid, boolean);
create function inventory.set_not_counted_accepted(p_count_id uuid, p_item_id uuid, p_accepted boolean)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_status text;
begin
  if p_item_id is null then
    raise exception 'Informe o insumo OU a preparação';
  end if;
  select status into v_status from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_status not in ('draft', 'counting', 'review') then
    raise exception 'Contagem em "%" não aceita mais marcação de item', v_status;
  end if;
  update inventory.count_scope_item
     set not_counted_accepted = p_accepted
   where count_id = p_count_id
     and item_id = p_item_id;
  if not found then raise exception 'O item não está no escopo desta contagem'; end if;
end;
$function$;

-- stock_movement_period_lock: trava 'inv_close:' e fechamento por location_id; mensagem cita local de estoque
create or replace function inventory.stock_movement_period_lock()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('inv_close:' || new.location_id, 42));
  if exists (
    select 1 from inventory.monthly_closing mc
    where mc.location_id = new.location_id
      and mc.competencia = date_trunc('month', (new.occurred_at at time zone 'America/Sao_Paulo'))::date
  ) then
    raise exception 'Competência % fechada para o local de estoque % — lance ajuste justificado no período aberto',
      to_char(new.occurred_at at time zone 'America/Sao_Paulo', 'YYYY-MM'), new.location_id;
  end if;
  return new;
end;
$function$;

-- training_reset_allows: p_kitchen_id → p_location_id. O GUC continua carregando o id da cozinha
-- sentinela; o reset libera o local dela e os locais da OM dela (o reset em TS apaga os dois).
drop function if exists inventory.training_reset_allows(bigint);
create function inventory.training_reset_allows(p_location_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $function$
	select p_location_id is not null
		and exists (
			select 1
			  from inventory.stock_location l
			  join kitchen.kitchen k
			    on k.is_training
			   and current_setting('iefa.training_reset', true) = k.id::text
			 where l.id = p_location_id
			   and (l.kitchen_id = k.id or l.unit_id = k.unit_id)
		)
$function$;

-- ----------------------------------------------------------------------------
-- (6) Funções no eixo (local, item) — grupo 2
-- ----------------------------------------------------------------------------

-- close_stale_issue_requests: p_kitchen_id -> p_location_id; settings por local (stock_location_settings); custo e saída por item_id
drop function if exists inventory.close_stale_issue_requests(bigint);
create function inventory.close_stale_issue_requests(p_location_id bigint default null::bigint)
returns integer
language plpgsql
set search_path = ''
as $function$
declare
  v_cutoff date := ((now() at time zone 'America/Sao_Paulo') - interval '3 hours')::date;
  v_request record;
  v_pct numeric;
  v_floor numeric;
  v_unexplained boolean;
  v_closed integer := 0;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  for v_request in
    select r.id, r.location_id
      from inventory.stock_issue_request r
     where r.status = 'open'
       and r.issue_date < v_cutoff
       and (p_location_id is null or r.location_id = p_location_id)
     order by r.id
  loop
    perform 1 from inventory.stock_issue_request_item i where i.request_id = v_request.id order by i.id for update;
    perform 1 from inventory.stock_issue_request r where r.id = v_request.id and r.status = 'open' for update;
    if not found then
      continue;
    end if;

    select coalesce(s.issue_tolerance_pct, 10), coalesce(s.issue_tolerance_floor_value, 20)
      into v_pct, v_floor
      from (select 1) one
      left join inventory.stock_location_settings s on s.location_id = v_request.location_id;

    select exists (
      select 1
        from inventory.stock_issue_request_item i
        cross join lateral (
          select coalesce(sum(case when m.type = 'issue_return' then -m.quantity else m.quantity end), 0) as net,
                 (array_agg(m.unit_cost order by m.created_at desc) filter (where m.unit_cost is not null))[1] as last_cost
            from inventory.stock_movement m
           where m.issue_request_id = v_request.id and m.item_id = i.item_id
        ) mv
        left join inventory.stock_cost c
          on c.location_id = v_request.location_id and c.item_id = i.item_id
       where i.request_id = v_request.id
         and i.suggested_qty is not null
         and i.variance_reason is null
         and case
               when i.suggested_qty > 0 then round(abs(round(mv.net - i.suggested_qty, 4)) / i.suggested_qty * 100, 2) > v_pct
               else round(mv.net - i.suggested_qty, 4) <> 0
             end
         and round(abs(round(mv.net - i.suggested_qty, 4)) * coalesce(mv.last_cost, c.avg_unit_cost, 0), 2) > v_floor
    ) into v_unexplained;

    update inventory.stock_issue_request_item
       set suggested_frozen_at = now()
     where request_id = v_request.id and suggested_frozen_at is null;

    update inventory.stock_issue_request
       set status = case when v_unexplained then 'closed_unexplained' else 'closed' end,
           closed_at = now(),
           auto_closed_at = now()
     where id = v_request.id;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$function$;

-- finalize_goods_receipt: lote e movimento no eixo (local, item); descrição da linha por core.item; OF conferida pelo local; mensagem da OF cita local de estoque
create or replace function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
returns table(movements integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot record;
  v_lot_id uuid;
  v_movements int := 0;
  v_has_divergence boolean;
  v_lot_total numeric(14,4);
  v_unexplained text;
  v_conservation text;
  v_fallback_seq int;
  v_of_location bigint;
  v_shortfall numeric(14,2);
begin
  perform set_config('inventory.via_rpc', 'on', true);
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;

  -- (20260730120000, guarda 1) Efetivação é única. Precede o gate de status:
  -- o recebimento divergente sai da efetivação com status que o gate aceita.
  if v_receipt.definitive_at is not null then
    raise exception 'Recebimento já efetivado em % — efetivação é única', v_receipt.definitive_at;
  end if;

  -- (20260920250000) Linha que difere da nota sem motivo não efetiva — e a
  -- checagem mora AQUI, depois da trava do recebimento: no servidor, antes da
  -- RPC, uma leitura que chegasse no meio passava uma falta sem motivo como
  -- `definitive`. A tolerância é a mesma do recálculo da linha (0,001).
  select string_agg(coalesce(i.description, gri.id::text), ', ' order by i.description)
    into v_unexplained
    from inventory.goods_receipt_item gri
    left join core.item i on i.id = gri.item_id
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and abs(gri.invoiced_qty_base - gri.received_qty_base) >= 0.001
     and nullif(btrim(coalesce(gri.divergence_reason, '')), '') is null;
  if v_unexplained is not null then
    raise exception 'Linha(s) diferem da nota sem motivo registrado (%) — informe o motivo da divergência antes de efetivar', v_unexplained;
  end if;

  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;

  -- (20260730120000, guarda 2) A OF tem de ser do local de estoque do recebimento.
  if v_receipt.supply_order_id is not null then
    select location_id into v_of_location from procurement.supply_order where id = v_receipt.supply_order_id;
    if v_of_location is distinct from v_receipt.location_id then
      raise exception 'OF pertence ao local de estoque %, não ao local de estoque do recebimento (%)', v_of_location, v_receipt.location_id;
    end if;
  end if;

  for v_item in
    select * from inventory.goods_receipt_item where receipt_id = p_receipt_id
  loop
    if v_item.received_qty_base <= 0 then continue; end if;

    -- A soma dos lotes tem de fechar com a quantidade conferida. A checagem é
    -- AQUI e não numa constraint: durante a conferência a soma fica
    -- legitimamente parcial enquanto o operador digita, e uma constraint
    -- rejeitaria o primeiro lote de uma entrega de três.
    select coalesce(sum(quantity_base), 0) into v_lot_total
      from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id;

    if v_lot_total = 0 then
      -- Nenhum lote informado: sintético com a quantidade inteira. Sufixo
      -- numérico porque duas linhas sem código na mesma entrega colidiriam no
      -- unique (receipt_item_id, lot_code) do mesmo dia.
      select count(*) + 1 into v_fallback_seq
        from inventory.goods_receipt_item_lot l
        join inventory.goods_receipt_item i on i.id = l.receipt_item_id
       where i.receipt_id = p_receipt_id and l.lot_code like 'SEM-LOTE-%';

      insert into inventory.goods_receipt_item_lot
        (receipt_item_id, lot_code, quantity_base, unit_cost)
      values
        (v_item.id, 'SEM-LOTE-' || to_char(now(), 'YYYY-MM-DD') || '-' || v_fallback_seq,
         v_item.received_qty_base, v_item.unit_cost);
    elsif v_lot_total <> v_item.received_qty_base then
      raise exception 'Soma dos lotes (%) difere da quantidade conferida (%) no item %',
        v_lot_total, v_item.received_qty_base, v_item.id;
    end if;

    -- Classe de conservação exigida pela especificação de compra da linha;
    -- sem purchase_item na linha, cai na especificação padrão do item.
    select pi.conservation_class into v_conservation
      from procurement.purchase_item pi
     where pi.id = v_item.purchase_item_id;

    if v_conservation is null and v_item.item_id is not null then
      select pi.conservation_class into v_conservation
        from procurement.purchase_item_ingredient pii
        join procurement.purchase_item pi on pi.id = pii.purchase_item_id
       where pii.ingredient_id = v_item.item_id and pii.is_default
         and pi.deleted_at is null
       limit 1;
    end if;

    for v_lot in
      -- lote zerado pela conferência (recusa, leitura desfeita) fica como
      -- registro — com código, validade e temperatura —, mas não vira estoque
      select * from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id and quantity_base > 0
    loop
      insert into inventory.stock_lot
        (location_id, item_id, lot_code, expiry_date,
         unit_cost, goods_receipt_item_id, goods_receipt_item_lot_id, conservation_class)
      values
        (v_receipt.location_id, v_item.item_id,
         v_lot.lot_code, v_lot.expiry_date, coalesce(v_lot.unit_cost, v_item.unit_cost),
         -- A classe em que o lote CHEGOU, quando o conferente a informou; senão, a sugerida
         -- pela especificação. Ver goods_receipt_item_lot.conservation_class.
         v_item.id, v_lot.id, coalesce(v_lot.conservation_class, v_conservation))
      returning id into v_lot_id;

      insert into inventory.stock_movement
        (location_id, item_id, lot_id, type, quantity,
         unit_cost, goods_receipt_item_id, created_by)
      values
        (v_receipt.location_id, v_item.item_id, v_lot_id,
         'receipt', v_lot.quantity_base, coalesce(v_lot.unit_cost, v_item.unit_cost, 0),
         v_item.id, p_user);

      v_movements := v_movements + 1;
    end loop;
  end loop;

  -- Divergência nasce da linha do item OU do lote (temperatura fora da faixa).
  select exists (
    select 1 from inventory.goods_receipt_item gri
    left join inventory.goods_receipt_item_lot l on l.receipt_item_id = gri.id
    where gri.receipt_id = p_receipt_id
      and (gri.divergence_reason is not null or l.divergence_reason is not null)
  ) into v_has_divergence;

  -- Pendência fiscal NA MESMA TRANSAÇÃO da efetivação. Recebido a MENOR que o
  -- faturado deixa a nota dizendo 100 e o estoque 90; até a devolução, a nota
  -- substituta ou a glosa, o recebimento não é liquidável. Gravada depois, por
  -- um segundo comando do servidor, havia uma janela em que o recebimento já
  -- estava efetivado e ainda sem pendência — liquidável — e um erro nesse
  -- segundo comando era descartado, deixando a janela aberta para sempre.
  -- A conta é a mesma de `fiscalShortfallValue` (sisub-domain): linha sem
  -- quantidade faturada ou sem custo não entra; só a falta, nunca a sobra.
  select round(coalesce(sum((gri.invoiced_qty_base - gri.received_qty_base) * gri.unit_cost), 0), 2)
    into v_shortfall
    from inventory.goods_receipt_item gri
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and gri.unit_cost is not null
     and gri.invoiced_qty_base > gri.received_qty_base;

  update inventory.goods_receipt
    set status = case when v_has_divergence then 'divergent' else 'definitive' end,
        definitive_by = p_user,
        definitive_at = now(),
        fiscal_pending = case when v_shortfall > 0 then true else fiscal_pending end,
        fiscal_pending_value = case when v_shortfall > 0 then v_shortfall else fiscal_pending_value end
    where id = p_receipt_id;

  if v_receipt.supply_order_id is not null then
    update procurement.supply_order so
      set status = case
        when (select coalesce(sum(gri.received_qty_base), 0)
                from inventory.goods_receipt gr
                join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
                where gr.supply_order_id = so.id and gr.definitive_at is not null)
             >= (select coalesce(sum(ordered_qty), 0) from procurement.supply_order_item where supply_order_id = so.id)
          then 'received' else 'partially_received' end,
          updated_at = now()
      where so.id = v_receipt.supply_order_id;
  end if;

  return query select v_movements;
end;
$function$;

-- issue_stock: p_ingredient_id -> p_item_id; lote e movimento por (location_id, item_id); tarefa conferida contra a cozinha do local
drop function if exists inventory.issue_stock(uuid, uuid, numeric, uuid, text, uuid, text, uuid);
create function inventory.issue_stock(p_request_id uuid, p_item_id uuid, p_quantity numeric, p_user uuid, p_emission_id text, p_override_lot_id uuid default null::uuid, p_justification text default null::text, p_production_task_id uuid default null::uuid)
returns table(movements integer, without_lot numeric)
language plpgsql
set search_path = ''
as $function$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_count int := 0;
  v_without_lot numeric(14,4) := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_task_kitchen bigint;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  -- A coluna é numeric(14,4): o que se grava é a quantidade em 4 casas. O
  -- replay compara com o que foi gravado, então compara no MESMO número —
  -- sem isto, 0,12345 gravava 0.1235 e o reenvio dava "outra saída".
  p_quantity := round(p_quantity, 4);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Emissão sem identificador'; end if;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;

  -- Retry da MESMA emissão devolve o que já foi feito, sem sacar de novo — e
  -- ANTES da recusa de dia fechado. Com a recusa na frente, a saída que passou
  -- mas cuja resposta se perdeu (502) e foi repetida depois do fechamento ouvia
  -- "requisição fechada, abra a do dia atual"; o operador lançava de novo no
  -- dia seguinte e o estoque saía duas vezes. `return_issue` já era assim.
  --
  -- E o retry tem de ser o MESMO pedido. O identificador é reaproveitado pela
  -- tela até a emissão confirmar; se o operador trocou insumo, quantidade ou
  -- lote no meio, devolver a emissão antiga calado dizia "saiu X" quando saiu Y.
  if exists (select 1 from inventory.stock_movement where emission_id = p_emission_id) then
    if exists (
      select 1 from inventory.stock_movement
       where emission_id = p_emission_id
         and (issue_request_id is distinct from p_request_id
              or item_id is distinct from p_item_id
              or (p_override_lot_id is not null and lot_id is distinct from p_override_lot_id))
    ) or (select sum(quantity) from inventory.stock_movement where emission_id = p_emission_id) <> p_quantity then
      raise exception 'Este identificador de emissão já foi usado para outra saída — recarregue a tela e lance de novo';
    end if;
    return query
      select count(*)::int,
             coalesce(sum(case when lot_id is null then quantity else 0 end), 0)
        from inventory.stock_movement where emission_id = p_emission_id;
    return;
  end if;

  if v_request.status <> 'open' then raise exception 'Requisição já fechada'; end if;

  -- A tarefa citada é da cozinha do local da requisição — a mesma regra de `register_late_issue`.
  if p_production_task_id is not null then
    select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_production_task_id;
    if v_task_kitchen is distinct from (select l.kitchen_id from inventory.stock_location l where l.id = v_request.location_id) then
      raise exception 'Tarefa de produção não pertence a esta cozinha';
    end if;
  end if;

  v_remaining := p_quantity;

  if p_override_lot_id is not null then
    -- escolha explícita de lote: a posse é conferida, e lote vencido exige
    -- justificativa (quem decide é a server fn, que também checa o nível)
    perform 1 from inventory.stock_lot
      where id = p_override_lot_id
        and location_id = v_request.location_id
        and item_id = p_item_id
      for update;
    if not found then raise exception 'Lote não pertence ao local de estoque/item da requisição'; end if;

    -- Lote escolhido à mão também tem de TER o saldo. Sem isto a escolha
    -- explícita tirava a quantidade inteira do lote, deixava-o negativo e a tela
    -- reportava sucesso limpo — a alocação automática, ao contrário, põe o que
    -- falta num movimento sem lote e avisa.
    select coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0)
      into v_take
      from inventory.stock_movement m
     where m.lot_id = p_override_lot_id;
    if v_take < p_quantity then
      raise exception 'O lote escolhido tem % de saldo, menos que os % pedidos — escolha outro lote ou deixe a alocação automática', v_take, p_quantity;
    end if;

    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.location_id, p_item_id, p_override_lot_id, 'production_issue', p_quantity,
       p_justification, p_request_id, p_emission_id, p_production_task_id, p_user);
    return query select 1, 0::numeric;
    return;
  end if;

  perform 1 from inventory.stock_lot
    where location_id = v_request.location_id and item_id = p_item_id
    order by id
    for update;

  for v_lot in
    select l.id,
           coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) as balance
      from inventory.stock_lot l
      left join inventory.stock_movement m on m.lot_id = l.id
      where l.location_id = v_request.location_id
        and l.item_id = p_item_id
        and l.quarantined_at is null
        and (l.expiry_date is null or l.expiry_date >= v_today)
      group by l.id, l.use_first, l.expiry_date, l.received_at
      having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) > 0
      -- Lote SEM validade entra na fila pela data de entrada, não no fim dela:
      -- `nulls last` mandava o hortifrúti (que quase nunca traz validade na
      -- nota) para depois de tudo, e ele apodrecia na câmara. A chave de ordem
      -- é a validade quando existe, senão o dia da entrada.
      -- A data de entrada vira data civil de BRASÍLIA. `received_at::date` casta
      -- no fuso da SESSÃO, que é UTC: o lote recebido às 22h entrava na fila
      -- como se fosse de amanhã, e passava na frente do que chegou de manhã.
      --
      -- Empate de validade sai pela ENTRADA mais antiga, e só então pelo id —
      -- a mesma ordem de `register_production_issue` (20260918160000).
      order by l.use_first desc,
               coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
               l.received_at asc,
               l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.balance, v_remaining);
    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.location_id, p_item_id, v_lot.id, 'production_issue', v_take,
       p_justification, p_request_id, p_emission_id, p_production_task_id, p_user);
    v_count := v_count + 1;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.location_id, p_item_id, null, 'production_issue', v_remaining,
       coalesce(p_justification, 'Saída além do saldo em lotes — regularizar na contagem'),
       p_request_id, p_emission_id, p_production_task_id, p_user);
    v_count := v_count + 1;
    v_without_lot := v_remaining;
  end if;

  return query select v_count, v_without_lot;
end;
$function$;

-- issue_suggestion_fingerprint: ingredient_id -> item_id na impressão digital (mesmo formato de saída)
create or replace function inventory.issue_suggestion_fingerprint(p_request_id uuid)
returns text
language sql
stable
set search_path = ''
as $function$
  select coalesce(string_agg(
           item_id::text || '=' || coalesce(to_char(suggested_qty, 'FM9999999999990.0000'), ''),
           ',' order by item_id::text collate "C"), '')
    from inventory.stock_issue_request_item
   where request_id = p_request_id;
$function$;

-- link_receipt_documents: unidade compradora e NF-e/OF conferidas pelo local (stock_location + cozinha do local); mensagens citam local de estoque
create or replace function inventory.link_receipt_documents(p_receipt_id uuid, p_user uuid, p_nfe_document_id uuid default null::uuid, p_supply_order_id uuid default null::uuid, p_empenho_id uuid default null::uuid, p_item_links jsonb default '[]'::jsonb, p_line_costs jsonb default '[]'::jsonb)
returns table(linked_items integer, costed_items integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_unit bigint;
  v_liquidated boolean;
  v_liquidation_empenhos uuid[];
  v_switching_nfe boolean := false;
  v_order_empenho uuid;
  v_nfe record;
  v_order record;
  v_empenho record;
  v_nfe_id uuid;
  v_order_id uuid;
  v_empenho_id uuid;
  v_link jsonb;
  v_linked int := 0;
  v_costed int := 0;
  v_updated int;
begin
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if v_receipt.status = 'rejected' then
    raise exception 'Recebimento recusado não recebe vínculo: a entrega não foi aceita';
  end if;

  -- Local de cozinha: a unidade compradora da cozinha; senão, a OM do local.
  select coalesce(k.purchase_unit_id, sl.unit_id) into v_unit
    from inventory.stock_location sl
    left join kitchen.kitchen k on k.id = sl.kitchen_id
   where sl.id = v_receipt.location_id;

  -- a(s) NE(s) que as NS deste recebimento já debitaram
  select array_agg(distinct l.empenho_id) into v_liquidation_empenhos
    from finance.liquidacao l
   where l.goods_receipt_id = v_receipt.id or l.id = v_receipt.liquidacao_id;
  v_liquidated := v_liquidation_empenhos is not null;

  v_nfe_id := coalesce(p_nfe_document_id, v_receipt.nfe_document_id);
  v_order_id := coalesce(p_supply_order_id, v_receipt.supply_order_id);
  v_empenho_id := coalesce(p_empenho_id, v_receipt.empenho_id);

  -- NF-e ────────────────────────────────────────────────────────────────────
  if p_nfe_document_id is not null and p_nfe_document_id is distinct from v_receipt.nfe_document_id then
    if v_receipt.nfe_document_id is not null and v_receipt.source = 'nfe' then
      raise exception 'Recebimento criado da NF-e: os itens vieram dela, a nota não se troca';
    end if;
    if v_receipt.nfe_document_id is not null and v_liquidated then
      raise exception 'Recebimento já liquidado com outra NF-e: a NS se apoia nela e o vínculo não muda';
    end if;
    select id, location_id, unit_id, status, situation_result into v_nfe
      from inventory.nfe_document where id = p_nfe_document_id for update;
    if not found then raise exception 'NF-e não encontrada'; end if;
    if v_nfe.location_id is not null and v_nfe.location_id <> v_receipt.location_id then
      raise exception 'A NF-e pertence a outro local de estoque';
    end if;
    if v_nfe.location_id is null and v_nfe.unit_id is distinct from v_unit then
      raise exception 'A NF-e não foi enviada à unidade compradora deste local de estoque';
    end if;
    if v_nfe.status in ('cancelled', 'refused') or v_nfe.situation_result = 'cancelled' then
      raise exception 'NF-e cancelada ou recusada não sustenta o recebimento — peça a nota correta ao fornecedor';
    end if;
    if v_nfe.location_id is null then
      update inventory.nfe_document set location_id = v_receipt.location_id where id = p_nfe_document_id;
    end if;
    v_switching_nfe := v_receipt.nfe_document_id is not null;
  end if;

  -- OF ──────────────────────────────────────────────────────────────────────
  if p_supply_order_id is not null and p_supply_order_id is distinct from v_receipt.supply_order_id then
    select id, location_id, empenho_id, status into v_order
      from procurement.supply_order where id = p_supply_order_id;
    if not found then raise exception 'OF não encontrada'; end if;
    if v_order.location_id <> v_receipt.location_id then
      raise exception 'A OF pertence a outro local de estoque';
    end if;
    if v_order.status in ('draft', 'cancelled') then
      raise exception 'A OF está % — só OF enviada sustenta a entrega', case v_order.status when 'draft' then 'em rascunho' else 'cancelada' end;
    end if;
  end if;

  -- OF × empenho em TODO vínculo (a mesma regra de `resolveOrderAndEmpenho`): com OF
  -- de empenho, o empenho do recebimento é o dela.
  if v_order_id is not null then
    select so.empenho_id into v_order_empenho from procurement.supply_order so where so.id = v_order_id;
    if v_order_empenho is not null then
      if p_empenho_id is not null and p_empenho_id <> v_order_empenho then
        raise exception 'A OF desta entrega é de outro empenho — vincule a NE da OF, ou troque a OF antes';
      end if;
      v_empenho_id := v_order_empenho;
    elsif p_empenho_id is not null then
      -- OF aguardando empenho: a NE se vincula NA OF (que confere o SICAF do fornecedor,
      -- 20260926214000/`linkSupplyOrderEmpenhoFn`) e o recebimento a acompanha. Ligar só
      -- no recebimento deixaria a OF "enviada sem empenho" com a entrega já sob uma NE.
      raise exception 'A OF desta entrega está aguardando empenho: vincule a NE na própria OF, que confere o SICAF; o recebimento acompanha';
    end if;
  end if;

  -- Empenho ─────────────────────────────────────────────────────────────────
  if v_empenho_id is distinct from v_receipt.empenho_id then
    -- Liquidado, o empenho do recebimento só pode ser o que a NS debitou: com ele
    -- sem empenho, aceita essa NE; qualquer outra, recusa (ele diria E2 com a NS em E1).
    if v_liquidated and not (cardinality(v_liquidation_empenhos) = 1 and v_empenho_id = v_liquidation_empenhos[1]) then
      raise exception 'Recebimento já liquidado: a NS debitou a NE %. O empenho do recebimento só pode ser essa NE — para mudar, estorne a NS no SIAFI e registre a liquidação de novo',
        (select string_agg(e.numero_empenho, ', ' order by e.numero_empenho) from finance.empenho e where e.id = any(v_liquidation_empenhos));
    end if;
    select id, unit_id, status into v_empenho from finance.empenho where id = v_empenho_id;
    if not found then raise exception 'Empenho não encontrado'; end if;
    if v_empenho.unit_id is distinct from v_unit then
      raise exception 'O empenho não é da unidade compradora deste local de estoque';
    end if;
    if v_empenho.status = 'anulado' then
      raise exception 'Empenho anulado não sustenta entrega — registre ou vincule a NE vigente';
    end if;
  end if;

  update inventory.goods_receipt
     set nfe_document_id = v_nfe_id,
         supply_order_id = v_order_id,
         empenho_id = v_empenho_id,
         documents_linked_at = now(),
         documents_linked_by = p_user
   where id = p_receipt_id;

  -- Linhas × itens da nota ──────────────────────────────────────────────────
  for v_link in select * from jsonb_array_elements(coalesce(p_item_links, '[]'::jsonb))
  loop
    if v_nfe_id is null then raise exception 'Casar itens exige a NF-e vinculada'; end if;
    if not exists (
      select 1 from inventory.nfe_item ni
       where ni.id = (v_link ->> 'nfe_item_id')::uuid and ni.nfe_document_id = v_nfe_id
    ) then
      raise exception 'Item da NF-e não pertence à nota vinculada';
    end if;
    update inventory.goods_receipt_item
       set nfe_item_id = (v_link ->> 'nfe_item_id')::uuid
     where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id
       and nfe_item_id is distinct from (v_link ->> 'nfe_item_id')::uuid;
    get diagnostics v_updated = row_count;
    if v_updated = 0 and not exists (
      select 1 from inventory.goods_receipt_item where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id
    ) then
      raise exception 'Linha não pertence a este recebimento';
    end if;
    v_linked := v_linked + v_updated;
  end loop;

  -- Troca de NF-e ───────────────────────────────────────────────────────────
  -- A linha que não casou com a nota nova não pode seguir apontando item da antiga
  -- (e passa a contar em "linhas sem item de nota"); aberto o recebimento, o custo que
  -- veio da antiga sai, e a nova o repõe onde casar (logo abaixo).
  if v_switching_nfe then
    update inventory.goods_receipt_item gri
       set nfe_item_id = null
     where gri.receipt_id = p_receipt_id and gri.nfe_item_id is not null
       and not exists (select 1 from inventory.nfe_item ni where ni.id = gri.nfe_item_id and ni.nfe_document_id = v_nfe_id);
    if v_receipt.definitive_at is null then
      update inventory.goods_receipt_item_lot l
         set unit_cost = null
        from inventory.goods_receipt_item gri
       where gri.id = l.receipt_item_id and gri.receipt_id = p_receipt_id
         and gri.unit_cost_source = 'invoice_link' and l.unit_cost is not distinct from gri.unit_cost;
      update inventory.goods_receipt_item
         set unit_cost = null, unit_cost_source = null
       where receipt_id = p_receipt_id and unit_cost_source = 'invoice_link';
    end if;
  end if;

  -- Custo das linhas sem custo, só com o recebimento aberto ─────────────────
  if v_receipt.definitive_at is null then
    for v_link in select * from jsonb_array_elements(coalesce(p_line_costs, '[]'::jsonb))
    loop
      update inventory.goods_receipt_item
         set unit_cost = (v_link ->> 'unit_cost')::numeric, unit_cost_source = 'invoice_link'
       where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id and unit_cost is null;
      get diagnostics v_updated = row_count;
      if v_updated > 0 then
        update inventory.goods_receipt_item_lot
           set unit_cost = (v_link ->> 'unit_cost')::numeric
         where receipt_item_id = (v_link ->> 'receipt_item_id')::uuid and unit_cost is null;
      end if;
      v_costed := v_costed + v_updated;
    end loop;
  end if;

  -- Status da OF quando a entrega já foi atestada ───────────────────────────
  -- Mesma conta de `finalize_goods_receipt` (recusado não tem `definitive_at`).
  if v_receipt.definitive_at is not null and v_order_id is distinct from v_receipt.supply_order_id then
    update procurement.supply_order so
       set status = case
             when (select coalesce(sum(gri.received_qty_base), 0)
                     from inventory.goods_receipt gr
                     join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
                    where gr.supply_order_id = so.id and gr.definitive_at is not null)
                  >= (select coalesce(sum(ordered_qty), 0) from procurement.supply_order_item where supply_order_id = so.id)
               then 'received'
             when exists (select 1 from inventory.goods_receipt gr
                           where gr.supply_order_id = so.id and gr.definitive_at is not null)
               then 'partially_received'
             else 'sent' end,
           updated_at = now()
     where so.id in (v_order_id, v_receipt.supply_order_id)
       and so.status in ('sent', 'partially_received', 'received');
  end if;

  return query select v_linked, v_costed;
end;
$function$;

-- refresh_issue_suggestion: linha por item_id; chave JSONB de entrada ingredient_id -> item_id; conflito em (request_id, item_id)
create or replace function inventory.refresh_issue_suggestion(p_request_id uuid, p_lines jsonb)
returns integer
language plpgsql
set search_path = ''
as $function$
declare
  v_status text;
begin
  perform 1 from inventory.stock_issue_request_item where request_id = p_request_id order by id for update;
  select status into v_status from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  if v_status <> 'open' then return 0; end if;

  insert into inventory.stock_issue_request_item (request_id, item_id, meal_type_id, suggested_qty)
    select p_request_id,
           (l->>'item_id')::uuid,
           nullif(l->>'meal_type_id', '')::uuid,
           (l->>'suggested_qty')::numeric
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  on conflict (request_id, item_id)
    do update set meal_type_id = excluded.meal_type_id, suggested_qty = excluded.suggested_qty;

  -- insumo que saiu do plano fica com sugestão ZERO (e não é apagado: o motivo
  -- já registrado na linha segue sendo o registro do que aconteceu)
  update inventory.stock_issue_request_item i
     set suggested_qty = 0
   where i.request_id = p_request_id
     and i.suggested_qty is distinct from 0
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
        where (l->>'item_id')::uuid = i.item_id
     );

  return jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
end;
$function$;

-- register_late_issue: p_kitchen_id -> p_location_id, p_ingredient_id -> p_item_id; fechamento, contagem, requisição e lotes pelo local; tarefa conferida contra a cozinha do local
drop function if exists inventory.register_late_issue(bigint, uuid, numeric, date, text, uuid, text, uuid);
create function inventory.register_late_issue(p_location_id bigint, p_item_id uuid, p_quantity numeric, p_occurred_on date, p_reason text, p_user uuid, p_emission_id text, p_production_task_id uuid default null::uuid)
returns table(movements integer, without_lot numeric, request_id uuid)
language plpgsql
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_occurred timestamptz;
  v_request_id uuid;
  v_task_kitchen bigint;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_count integer := 0;
  v_without_lot numeric(14,4) := 0;
  v_justification text;
  v_counted_on date;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  p_quantity := round(p_quantity, 4);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Emissão sem identificador'; end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'Lançamento tardio exige o motivo (mínimo 5 caracteres)';
  end if;
  if p_occurred_on is null or p_occurred_on > v_today then
    raise exception 'A data real da saída não pode ser futura';
  end if;

  -- Trava pela EMISSÃO antes de conferir o retry. Sem ela, o reenvio depois de um
  -- 502 chegava com a primeira chamada ainda aberta: as duas passavam no `exists`
  -- (a primeira não tinha commitado) e as duas inseriam — o estoque saía duas vezes.
  -- `issue_stock` resolve travando a requisição; aqui pode não haver requisição, e a
  -- chave natural do pedido é o identificador da emissão.
  perform pg_advisory_xact_lock(hashtextextended('late-issue:' || p_emission_id, 42));

  -- Retry da MESMA emissão devolve o que já foi feito (mesmo contrato de issue_stock).
  if exists (select 1 from inventory.stock_movement m where m.emission_id = p_emission_id) then
    if exists (
      select 1 from inventory.stock_movement m
       where m.emission_id = p_emission_id
         and (m.location_id <> p_location_id or m.item_id is distinct from p_item_id)
    ) or (select sum(m.quantity) from inventory.stock_movement m where m.emission_id = p_emission_id) <> p_quantity then
      raise exception 'Este identificador de emissão já foi usado para outra saída — recarregue a tela e lance de novo';
    end if;
    return query
      select count(*)::integer,
             coalesce(sum(case when m.lot_id is null then m.quantity else 0 end), 0),
             (array_agg(m.issue_request_id))[1]
        from inventory.stock_movement m where m.emission_id = p_emission_id;
    return;
  end if;

  if exists (
    select 1 from inventory.monthly_closing mc
     where mc.location_id = p_location_id and mc.competencia = date_trunc('month', p_occurred_on)::date
  ) then
    raise exception 'A competência % já foi fechada neste local de estoque: saída daquele mês se corrige com ajuste justificado no período aberto',
      to_char(p_occurred_on, 'MM/YYYY');
  end if;

  if p_production_task_id is not null then
    select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_production_task_id;
    if v_task_kitchen is distinct from (select l.kitchen_id from inventory.stock_location l where l.id = p_location_id) then
      raise exception 'Tarefa de produção não pertence a esta cozinha';
    end if;
  end if;

  -- Hoje, o instante é agora. Dia anterior: meio-dia civil de Brasília — a hora
  -- exata ninguém sabe, e o meio do dia não empurra a saída para outro dia em fuso nenhum.
  v_occurred := case
    when p_occurred_on = v_today then now()
    else (p_occurred_on + time '12:00') at time zone 'America/Sao_Paulo'
  end;

  -- Dupla baixa: contagem APROVADA que viu este insumo no DIA da saída ou depois.
  -- Comparação pelo dia civil, e não pelo instante: a hora da saída tardia é
  -- desconhecida (o meio-dia é só a posição no ledger). Contagem das 11h com a saída
  -- real das 9h já tirou a falta; comparar com o meio-dia deixava passar e baixava de
  -- novo. No mesmo dia, sem saber a ordem, recusa-se — o que faltou explicar vai
  -- como diferença da contagem (ou ajuste), que é onde o saldo já foi acertado.
  select max((e.counted_at at time zone 'America/Sao_Paulo')::date) into v_counted_on
    from inventory.inventory_count c
    join inventory.inventory_count_entry e on e.count_id = c.id
    left join inventory.stock_lot l on l.id = e.lot_id
   where c.location_id = p_location_id
     and c.status = 'approved'
     and coalesce(e.item_id, l.item_id) = p_item_id
     and (e.counted_at at time zone 'America/Sao_Paulo')::date >= p_occurred_on;
  if v_counted_on is not null then
    raise exception 'Este insumo foi contado em % numa contagem já aprovada, no dia da saída ou depois: o ajuste da contagem já tirou do saldo o que faltava, e a saída agora baixaria duas vezes. Registre a diferença como ajuste justificado',
      to_char(v_counted_on, 'DD/MM/YYYY');
  end if;

  -- o dia: a requisição da produção daquela data, em qualquer status
  select r.id into v_request_id
    from inventory.stock_issue_request r
   where r.location_id = p_location_id and r.issue_date = p_occurred_on and r.origin = 'production'
   for update;

  v_justification := 'Lançamento tardio (saída em ' || to_char(p_occurred_on, 'DD/MM/YYYY') || '): ' || v_reason;
  perform set_config('inventory.late_issue', 'on', true);

  perform 1 from inventory.stock_lot l
    where l.location_id = p_location_id and l.item_id = p_item_id
    order by l.id
    for update;

  v_remaining := p_quantity;
  for v_lot in
    select l.id,
           coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) as balance
      from inventory.stock_lot l
      left join inventory.stock_movement m on m.lot_id = l.id
     where l.location_id = p_location_id
       and l.item_id = p_item_id
       and l.quarantined_at is null
       and (l.expiry_date is null or l.expiry_date >= p_occurred_on)
       and (l.received_at is null or l.received_at <= v_occurred)
     group by l.id, l.use_first, l.expiry_date, l.received_at
    having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) > 0
     order by l.use_first desc,
              coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
              l.received_at asc,
              l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.balance, v_remaining);
    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, justification, issue_request_id, emission_id,
       production_task_id, created_by, occurred_at, is_late_issue)
    values
      (p_location_id, p_item_id, v_lot.id, 'production_issue', v_take, v_justification, v_request_id, p_emission_id,
       p_production_task_id, p_user, v_occurred, true);
    v_count := v_count + 1;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, justification, issue_request_id, emission_id,
       production_task_id, created_by, occurred_at, is_late_issue)
    values
      (p_location_id, p_item_id, null, 'production_issue', v_remaining,
       v_justification || ' — sem saldo em lote, regularizar na contagem', v_request_id, p_emission_id,
       p_production_task_id, p_user, v_occurred, true);
    v_count := v_count + 1;
    v_without_lot := v_remaining;
  end if;

  perform set_config('inventory.late_issue', '', true);
  return query select v_count, v_without_lot, v_request_id;
end;
$function$;

-- register_leftover: p_kitchen_id -> p_location_id; p_frozen_preparation_id mantido (sobra é sempre preparação) e gravado em item_id
drop function if exists inventory.register_leftover(bigint, uuid, text, date, numeric, uuid, boolean, text, uuid);
create function inventory.register_leftover(p_location_id bigint, p_frozen_preparation_id uuid, p_lot_code text, p_expiry_date date, p_quantity numeric, p_task_id uuid, p_discard boolean, p_reason text, p_user uuid)
returns table(lot_id uuid)
language plpgsql
set search_path = ''
as $function$
declare
  v_lot_id uuid;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_discard and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Descarte exige motivo';
  end if;

  -- a MESMA tarefa não registra sobra duas vezes (retry após sucesso parcial
  -- reaproveitava e duplicava o retorno)
  perform pg_advisory_xact_lock(hashtextextended('leftover:' || p_task_id::text, 42));
  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'leftover_return'
  ) then
    raise exception 'Esta tarefa já teve sobra registrada';
  end if;

  select id into v_lot_id
    from inventory.stock_lot
    where location_id = p_location_id
      and item_id = p_frozen_preparation_id
      and lot_code = p_lot_code
      and expiry_date is not distinct from p_expiry_date
    limit 1;
  if v_lot_id is null then
    insert into inventory.stock_lot (location_id, item_id, lot_code, expiry_date)
      values (p_location_id, p_frozen_preparation_id, p_lot_code, p_expiry_date)
      returning id into v_lot_id;
  end if;

  insert into inventory.stock_movement
    (location_id, item_id, lot_id, type, quantity, unit_cost, production_task_id, created_by)
  values
    (p_location_id, p_frozen_preparation_id, v_lot_id, 'leftover_return', p_quantity, 0, p_task_id, p_user);

  if p_discard then
    insert into inventory.stock_movement
      (location_id, item_id, lot_id, type, quantity, reason_code, justification, production_task_id, created_by)
    values
      (p_location_id, p_frozen_preparation_id, v_lot_id, 'waste', p_quantity,
       'production_leftover_discard', btrim(p_reason), p_task_id, p_user);
  end if;

  return query select v_lot_id;
end;
$function$;

-- register_leftover_provisional: p_kitchen_id -> p_location_id; a cozinha (tarefa, preparação provisória, trava) vem do local; chama register_leftover com o local
drop function if exists inventory.register_leftover_provisional(bigint, text, text, integer, text, date, numeric, uuid, boolean, text, uuid);
create function inventory.register_leftover_provisional(p_location_id bigint, p_description text, p_measure_unit text, p_shelf_life_days integer, p_lot_code text, p_production_date date, p_quantity numeric, p_task_id uuid, p_discard boolean, p_reason text, p_user uuid)
returns table(lot_id uuid, frozen_preparation_id uuid)
language plpgsql
set search_path = ''
as $function$
declare
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_prep uuid;
  v_shelf integer;
  v_task_kitchen bigint;
  -- cozinha do local (nula se o local não é de cozinha: a tarefa não confere e recusa)
  v_kitchen_id bigint := (select l.kitchen_id from inventory.stock_location l where l.id = p_location_id);
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if v_description is null or length(v_description) < 3 then
    raise exception 'Informe o nome da preparação congelada (mínimo 3 caracteres)';
  end if;
  if p_shelf_life_days is not null and p_shelf_life_days <= 0 then
    raise exception 'Validade em dias deve ser positiva';
  end if;
  select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_task_id;
  if v_task_kitchen is distinct from v_kitchen_id then
    raise exception 'Tarefa de produção não pertence a esta cozinha';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provisional-frozen:' || v_kitchen_id || ':' || lower(v_description), 42));

  -- Nome que já existe no catálogo (ou provisória desta cozinha) é reaproveitado:
  -- a sobra de estrogonofe de hoje e a de sexta vão para a mesma preparação.
  select fp.id, fp.shelf_life_days into v_prep, v_shelf
    from kitchen.frozen_preparation fp
   where fp.deleted_at is null
     and lower(btrim(fp.description)) = lower(v_description)
     and (fp.provisional_kitchen_id is null or fp.provisional_kitchen_id = v_kitchen_id or fp.provisional_reviewed_at is not null)
   order by (fp.provisional_since is null) desc, fp.created_at
   limit 1;

  if v_prep is null then
    insert into kitchen.frozen_preparation
      (description, measure_unit, shelf_life_days, provisional_kitchen_id, provisional_since, provisional_by)
    values
      (v_description, nullif(btrim(coalesce(p_measure_unit, '')), ''), p_shelf_life_days, v_kitchen_id, now(), p_user)
    returning id, shelf_life_days into v_prep, v_shelf;
  end if;

  -- mesma regra de `leftoverExpiryDate` (production-issue.ts): data da produção + validade
  return query
    select r.lot_id, v_prep
      from inventory.register_leftover(
        p_location_id, v_prep, p_lot_code,
        case when coalesce(v_shelf, 0) > 0 then p_production_date + v_shelf end,
        p_quantity, p_task_id, p_discard, p_reason, p_user
      ) r;
end;
$function$;

-- register_production_issue: chaves JSONB de p_lines kitchen_id/ingredient_id -> location_id/item_id; lotes e movimentos por (location_id, item_id)
create or replace function inventory.register_production_issue(p_task_id uuid, p_lines jsonb, p_user uuid)
returns table(movements integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_count int := 0;
  v_line record;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 42));

  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'production_issue' and not is_late_issue
  ) then
    raise exception 'Esta tarefa já teve baixa de estoque registrada';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(
      location_id bigint,
      item_id uuid,
      quantity numeric,
      override_lot_id uuid,
      justification text
    )
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantidade deve ser positiva';
    end if;

    if v_line.override_lot_id is not null then
      perform 1 from inventory.stock_lot
        where id = v_line.override_lot_id
          and location_id = v_line.location_id
          and item_id = v_line.item_id
        for update;
      if not found then
        raise exception 'Lote % não pertence ao local de estoque/item do movimento (override inválido)', v_line.override_lot_id;
      end if;
      insert into inventory.stock_movement
        (location_id, item_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.location_id, v_line.item_id, v_line.override_lot_id, 'production_issue',
         v_line.quantity, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      continue;
    end if;

    v_remaining := v_line.quantity;

    perform 1 from inventory.stock_lot
      where location_id = v_line.location_id
        and item_id = v_line.item_id
      order by id
      for update;

    -- Ordem: "usar primeiro" (painel de vencimentos) → validade → entrada → id.
    -- Fora: lote vencido e lote em quarentena. (Ver 20260918160000.)
    for v_lot in
      select l.id,
             coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) as balance
        from inventory.stock_lot l
        left join inventory.stock_movement m on m.lot_id = l.id
        where l.location_id = v_line.location_id
          and l.item_id = v_line.item_id
          and l.quarantined_at is null
          and (l.expiry_date is null or l.expiry_date >= v_today)
        group by l.id, l.use_first, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
        order by l.use_first desc,
                 coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
                 l.received_at asc,
                 l.id asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.balance, v_remaining);
      insert into inventory.stock_movement
        (location_id, item_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.location_id, v_line.item_id, v_lot.id, 'production_issue',
         v_take, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      insert into inventory.stock_movement
        (location_id, item_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.location_id, v_line.item_id, null, 'production_issue', v_remaining,
         coalesce(v_line.justification, 'Consumo além do saldo em lotes (estoque negativo — regularizar na contagem)'),
         p_task_id, p_user);
      v_count := v_count + 1;
    end if;
  end loop;

  return query select v_count;
end;
$function$;

-- return_issue: lote conferido e devolução gravada por (location_id, item_id); mensagem cita local de estoque
create or replace function inventory.return_issue(p_request_id uuid, p_lot_id uuid, p_quantity numeric, p_user uuid, p_emission_id text)
returns table(return_movement_id uuid, return_unit_cost numeric)
language plpgsql
set search_path = ''
as $function$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_lot inventory.stock_lot%rowtype;
  v_issued numeric(14,4);
  v_returned numeric(14,4);
  v_cost numeric(12,4);
  v_id uuid;
  v_replay record;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  -- A coluna é numeric(14,4): o que se grava é a quantidade em 4 casas. O
  -- replay compara com o que foi gravado, então compara no MESMO número —
  -- sem isto, 0,12345 gravava 0.1235 e o reenvio dava "outra saída".
  p_quantity := round(p_quantity, 4);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Devolução sem identificador de emissão'; end if;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;

  -- Retry da MESMA devolução devolve o que já foi feito (20260918180000). Agora
  -- também confere que é o mesmo pedido: com o identificador mantido depois de o
  -- operador trocar o lote ou a quantidade, o retry devolvia calado a devolução
  -- anterior (2 KG do lote A) enquanto a tela dizia "3 devolvido".
  select id, unit_cost, request_id, lot_id, quantity into v_replay
    from (select id, unit_cost, issue_request_id as request_id, lot_id, quantity
            from inventory.stock_movement
           where emission_id = p_emission_id and type = 'issue_return'
           limit 1) m;
  if found then
    if v_replay.request_id is distinct from p_request_id
       or v_replay.lot_id is distinct from p_lot_id
       or v_replay.quantity <> p_quantity then
      raise exception 'Este identificador de emissão já foi usado para outra devolução — recarregue a tela e lance de novo';
    end if;
    return query select v_replay.id, v_replay.unit_cost;
    return;
  end if;

  if v_request.status <> 'open' then raise exception 'Requisição já fechada — a devolução tem de ser lançada antes do fechamento do dia'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.location_id <> v_request.location_id then raise exception 'Lote de outro local de estoque'; end if;

  select coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_cost) / nullif(sum(quantity), 0), 0)
    into v_issued, v_cost
    from inventory.stock_movement
    where issue_request_id = p_request_id and lot_id = p_lot_id and type = 'production_issue';

  select coalesce(sum(quantity), 0) into v_returned
    from inventory.stock_movement
    where issue_request_id = p_request_id and lot_id = p_lot_id and type = 'issue_return';

  if v_issued - v_returned < p_quantity then
    raise exception 'Devolução maior que o emitido deste lote nesta requisição (% disponível)', v_issued - v_returned;
  end if;

  insert into inventory.stock_movement
    (location_id, item_id, lot_id, type, quantity, unit_cost,
     justification, issue_request_id, emission_id, created_by)
  values
    (v_request.location_id, v_lot.item_id, p_lot_id, 'issue_return', p_quantity, v_cost,
     'Devolução de saída não utilizada', p_request_id, p_emission_id, p_user)
  returning id into v_id;

  return query select v_id, v_cost;
end;
$function$;

-- split_lot: prazo após abrir/descongelar de kitchen.ingredient por item_id (outra classe: sem prazo); custo e lote/movimentos por (location_id, item_id)
create or replace function inventory.split_lot(p_lot_id uuid, p_quantity numeric, p_derivation text, p_user uuid, p_expiry_date date default null::date, p_location text default null::text)
returns table(new_lot_id uuid, new_short_code text, new_expiry_date date)
language plpgsql
set search_path = ''
as $function$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_days int;
  v_expiry date;
  v_new_lot inventory.stock_lot%rowtype;
  v_unit_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_derivation not in ('opened', 'portioned', 'thawed') then
    raise exception 'Derivação inválida: %', p_derivation;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não pode ser fracionado'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  -- validade do derivado: a MENOR entre a original e agora + prazo do item
  -- (prazo só existe para ingrediente; preparação e outra classe ficam sem prazo)
  if v_lot.item_id is not null then
    select case p_derivation
             when 'thawed' then i.shelf_life_after_thaw_days
             else i.shelf_life_after_opening_days
           end
      into v_days
      from kitchen.ingredient i where i.id = v_lot.item_id;
  end if;

  v_expiry := coalesce(
    p_expiry_date,
    case when v_days is not null
      then least(coalesce(v_lot.expiry_date, 'infinity'::date),
                 ((now() at time zone 'America/Sao_Paulo')::date + v_days))
      else v_lot.expiry_date
    end
  );
  if v_expiry = 'infinity'::date then v_expiry := null; end if;

  -- custo médio vigente vale para os dois movimentos: o par não pode mudar valor
  select avg_unit_cost into v_unit_cost
    from inventory.stock_cost
    where location_id = v_lot.location_id
      and item_id = v_lot.item_id;

  -- o lote derivado fica onde o de origem estava (endereçamento, D18)
  insert into inventory.stock_lot
    (location_id, item_id, lot_code, expiry_date, unit_cost,
     location, parent_lot_id, derivation, opened_at, received_at, position_id, conservation_class)
  values
    (v_lot.location_id, v_lot.item_id,
     v_lot.lot_code || '-' || upper(substr(p_derivation, 1, 1)), v_expiry, coalesce(v_unit_cost, v_lot.unit_cost),
     coalesce(p_location, v_lot.location), v_lot.id, p_derivation, now(), now(), v_lot.position_id,
     -- Descongelado é resfriado; aberto e porcionado seguem a classe do lote de origem.
     -- Antes o derivado nascia sem classe e a validade caía na especificação padrão:
     -- a carne descongelada aparecia como congelada.
     case when p_derivation = 'thawed' then 'resfriado' else v_lot.conservation_class end)
  returning * into v_new_lot;

  insert into inventory.stock_movement
    (location_id, item_id, lot_id, type, quantity, unit_cost, justification, created_by)
  values
    (v_lot.location_id, v_lot.item_id, v_lot.id, 'lot_split_out',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') → ' || v_new_lot.short_code, p_user),
    (v_lot.location_id, v_lot.item_id, v_new_lot.id, 'lot_split_in',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') ← ' || v_lot.short_code, p_user);

  return query select v_new_lot.id, v_new_lot.short_code, v_new_lot.expiry_date;
end;
$function$;

-- stock_movement_costing_after: custo médio por (location_id, item_id)
create or replace function inventory.stock_movement_costing_after()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_qty numeric(14,4);
  v_avg numeric(12,4);
  v_new_qty numeric(14,4);
begin
  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where location_id = new.location_id
      and item_id = new.item_id
    for update;

  if new.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then
    v_new_qty := v_qty + new.quantity;
    if v_qty <= 0 then
      v_avg := case when new.quantity > 0 then round(coalesce(new.total_cost, 0) / new.quantity, 4) else v_avg end;
    elsif v_new_qty > 0 then
      v_avg := round(((v_qty * v_avg) + coalesce(new.total_cost, 0)) / v_new_qty, 4);
    end if;
  else
    v_new_qty := v_qty - new.quantity;
  end if;

  update inventory.stock_cost
    set quantity = v_new_qty, avg_unit_cost = v_avg, updated_at = now()
    where location_id = new.location_id
      and item_id = new.item_id;
  return null;
end;
$function$;

-- stock_movement_costing_before: linha de custo e último custo de recebimento por (location_id, item_id)
create or replace function inventory.stock_movement_costing_before()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_avg numeric(12,4);
  v_qty numeric(14,4);
  v_last numeric(12,4);
begin
  insert into inventory.stock_cost (location_id, item_id)
    values (new.location_id, new.item_id)
    on conflict do nothing;

  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where location_id = new.location_id
      and item_id = new.item_id
    for update;

  if new.unit_cost is null then
    if new.type in ('production_issue', 'waste', 'transfer_out', 'lot_split_out', 'adjustment_out') then
      new.unit_cost := coalesce(v_avg, 0);
    elsif new.type = 'adjustment_in' then
      if coalesce(v_avg, 0) > 0 then
        new.unit_cost := v_avg;
      else
        select m.unit_cost into v_last
          from inventory.stock_movement m
          where m.location_id = new.location_id
            and m.item_id = new.item_id
            and m.type = 'receipt'
            and m.unit_cost is not null
            and m.unit_cost > 0
          order by m.occurred_at desc
          limit 1;
        if v_last is null then
          raise exception 'Entrada de ajuste sem custo e sem custo médio nem recebimento anterior — informe o custo unitário';
        end if;
        new.unit_cost := v_last;
      end if;
    end if;
  end if;

  new.total_cost := round(new.quantity * coalesce(new.unit_cost, 0), 4);
  return new;
end;
$function$;

-- stock_movement_immutable: reset de treino pelo local (training_reset_allows(old.location_id))
create or replace function inventory.stock_movement_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
	if tg_op = 'DELETE' and inventory.training_reset_allows(old.location_id) then
		return old;
	end if;
	raise exception 'stock_movement é append-only (MCASP): corrija com um movimento de ajuste justificado';
end;
$function$;

-- transfer_stock: p_to_kitchen -> p_to_location; lote de destino casado por item_id; mensagem cita local de estoque
drop function if exists inventory.transfer_stock(uuid, bigint, numeric, uuid);
create function inventory.transfer_stock(p_lot_id uuid, p_to_location bigint, p_quantity numeric, p_user uuid)
returns table(transfer_pair_id uuid)
language plpgsql
set search_path = ''
as $function$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_dest_lot_id uuid;
  v_pair uuid := gen_random_uuid();
  v_out_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.location_id = p_to_location then raise exception 'Origem e destino são o mesmo local de estoque'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não é transferível'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  select id into v_dest_lot_id
    from inventory.stock_lot
    where location_id = p_to_location
      and lot_code = v_lot.lot_code
      and item_id = v_lot.item_id
      and expiry_date is not distinct from v_lot.expiry_date
    limit 1;
  if v_dest_lot_id is null then
    insert into inventory.stock_lot (location_id, item_id, lot_code, expiry_date, unit_cost, received_at, conservation_class)
      values (p_to_location, v_lot.item_id, v_lot.lot_code, v_lot.expiry_date, v_lot.unit_cost, now(), v_lot.conservation_class)
      returning id into v_dest_lot_id;
  end if;

  insert into inventory.stock_movement
    (location_id, item_id, lot_id, type, quantity, transfer_pair_id, created_by)
  values
    (v_lot.location_id, v_lot.item_id, p_lot_id, 'transfer_out', p_quantity, v_pair, p_user)
  returning unit_cost into v_out_cost;

  insert into inventory.stock_movement
    (location_id, item_id, lot_id, type, quantity, unit_cost, transfer_pair_id, created_by)
  values
    (p_to_location, v_lot.item_id, v_dest_lot_id, 'transfer_in', p_quantity, v_out_cost, v_pair, p_user);

  return query select v_pair;
end;
$function$;

-- check_supply_order_empenho_unit: unidade compradora pelo local da OF (cozinha do local ou OM do local); mensagem cita local de estoque
create or replace function procurement.check_supply_order_empenho_unit()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_empenho_unit bigint;
  v_purchase_unit bigint;
begin
  -- OF aguardando empenho: a unidade se confere quando a NE for vinculada.
  if new.empenho_id is null then return new; end if;
  select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
  select coalesce(k.purchase_unit_id, sl.unit_id) into v_purchase_unit
    from inventory.stock_location sl
    left join kitchen.kitchen k on k.id = sl.kitchen_id
   where sl.id = new.location_id;
  if v_purchase_unit is null or v_empenho_unit is distinct from v_purchase_unit then
    raise exception 'A Ordem de Fornecimento só pode usar empenho da unidade compradora do local de estoque (local %, empenho da unidade %)', new.location_id, v_empenho_unit
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- (6b) Views sobre (local, item)
-- ----------------------------------------------------------------------------
create view inventory.v_stock_balance
with (security_invoker = true)
as
select
  m.location_id,
  m.item_id,
  m.lot_id,
  l.lot_code,
  l.expiry_date,
  sum(
    case
      when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then m.quantity
      else - m.quantity
    end
  ) as balance,
  sum(
    case
      when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then coalesce(m.total_cost, 0)
      else - coalesce(m.total_cost, 0)
    end
  ) as balance_value,
  max(m.occurred_at) as last_movement_at
from inventory.stock_movement m
left join inventory.stock_lot l on l.id = m.lot_id
group by m.location_id, m.item_id, m.lot_id, l.lot_code, l.expiry_date;

comment on view inventory.v_stock_balance is
  'Saldo por local×item×lote derivado do ledger. Materializar apenas se a performance exigir.';

create view inventory.v_lot_expiry
with (security_invoker = true)
as
with lot_balance as (
  select
    l.id as lot_id,
    l.location_id,
    l.item_id,
    l.lot_code,
    l.short_code,
    l.expiry_date,
    l.location,
    l.position_id,
    l.use_first,
    l.quarantined_at,
    l.received_at,
    coalesce(l.conservation_class, pi.conservation_class) as conservation_class,
    coalesce(sum(
      case
        when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then m.quantity
        else - m.quantity
      end
    ), 0) as balance
  from inventory.stock_lot l
  left join inventory.stock_movement m on m.lot_id = l.id
  left join lateral (
    select p.conservation_class
    from procurement.purchase_item_ingredient pii
    join procurement.purchase_item p on p.id = pii.purchase_item_id
    where pii.ingredient_id = l.item_id and pii.is_default and p.deleted_at is null and p.conservation_class is not null
    limit 1
  ) pi on true
  group by l.id, pi.conservation_class
  having coalesce(sum(
    case
      when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then m.quantity
      else - m.quantity
    end
  ), 0) > 0
)
select
  b.lot_id,
  b.location_id,
  b.item_id,
  b.lot_code,
  b.short_code,
  b.location,
  b.position_id,
  b.use_first,
  b.quarantined_at,
  b.received_at,
  b.expiry_date,
  b.conservation_class,
  b.balance,
  round(b.balance * coalesce(c.avg_unit_cost, 0), 4) as balance_value,
  coalesce(c.avg_unit_cost, 0) as avg_unit_cost,
  inventory.expiry_alert_days(b.location_id, b.item_id, b.conservation_class) as alert_days,
  case
    when b.expiry_date is null then null::integer
    else b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date
  end as days_left,
  case
    when b.expiry_date is null then
      case when b.conservation_class in ('resfriado', 'congelado') then 'no_expiry' else 'ok' end
    when b.expiry_date < (now() at time zone 'America/Sao_Paulo')::date then 'expired'
    when b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date
      <= inventory.expiry_alert_days(b.location_id, b.item_id, b.conservation_class) then 'critical'
    when b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date
      <= inventory.expiry_alert_days(b.location_id, b.item_id, b.conservation_class) * 2 then 'warning'
    else 'ok'
  end as band
from lot_balance b
left join inventory.stock_cost c on c.location_id = b.location_id and c.item_id = b.item_id;

comment on view inventory.v_lot_expiry is
  'Lotes com saldo classificados por faixa de vencimento (expired/critical/warning/ok/no_expiry), no fuso de Brasília, com valor a custo médio.';

create view finance.v_physical_accounting_reconciliation
with (security_invoker = true)
as
with received as (
  select
    gr.id,
    gr.location_id,
    gr.definitive_at,
    gr.liquidacao_id,
    coalesce(sum(gri.received_qty_base * coalesce(gri.unit_cost, 0)), 0) as valor_recebido
  from inventory.goods_receipt gr
  join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
  where gr.definitive_at is not null and gr.invoice_expected
  group by gr.id, gr.location_id, gr.definitive_at, gr.liquidacao_id
), liquidated as (
  select
    r_1.id as goods_receipt_id,
    (array_agg(l.id order by l.data desc, l.created_at desc))[1] as liquidacao_id,
    string_agg(l.numero_ns, ', ' order by l.data, l.numero_ns) as numero_ns,
    sum(l.valor)::numeric(14,2) as valor
  from received r_1
  join finance.liquidacao l on l.goods_receipt_id = r_1.id or l.id = r_1.liquidacao_id
  group by r_1.id
)
select
  r.id as goods_receipt_id,
  r.location_id,
  r.definitive_at,
  r.valor_recebido,
  q.liquidacao_id,
  q.numero_ns,
  q.valor as valor_liquidado,
  case
    when q.liquidacao_id is null then 'sem_liquidacao'
    when abs(r.valor_recebido - q.valor) > 0.009 then 'valor_divergente'
    else 'conciliado'
  end as situacao,
  current_date - r.definitive_at::date as dias_desde_recebimento
from received r
left join liquidated q on q.goods_receipt_id = r.id;

comment on view finance.v_physical_accounting_reconciliation is
  'Recebimento definitivo × liquidação: aponta recebimento sem NS (pendência contábil) e diferença de valor entre o físico e o liquidado.';

revoke all on inventory.v_stock_balance, inventory.v_lot_expiry, finance.v_physical_accounting_reconciliation from anon, authenticated;
grant select on inventory.v_stock_balance, inventory.v_lot_expiry, finance.v_physical_accounting_reconciliation to service_role;

notify pgrst, 'reload schema';
