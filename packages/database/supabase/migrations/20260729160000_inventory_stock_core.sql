-- ============================================================================
-- Fase 3 (estoque): motor de saldo — lotes, ledger imutável, custo médio,
-- contagem física e transferência atômica
-- ============================================================================
-- Decisões (openspec/changes/sisub-inventory-cycle/design.md, D4):
--  • Ledger APPEND-ONLY: imutabilidade por trigger BEFORE UPDATE OR DELETE —
--    grants/RLS não bastam (as server fns usam service role, que bypassa RLS).
--    Correção = movimento de ajuste com justificativa (MCASP).
--  • Item estocado = ingredient XOR frozen_preparation (num_nonnulls = 1,
--    mesmo padrão de recipe_ingredients_source_xor) — sobras reaproveitadas
--    entram como preparação congelada.
--  • Quantidades sempre POSITIVAS na unidade base; o sinal vem do type.
--  • Valoração: custo médio ponderado (MCASP) mantido em inventory.stock_cost
--    por triggers; saídas são valoradas ao custo médio vigente
--    (unit_cost do LOTE é informativo/rastreio, nunca base contábil).
--  • Transferência e confirmação de contagem são funções SQL = atômicas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Lotes
-- ----------------------------------------------------------------------------
create table inventory.stock_lot (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  lot_code text not null,
  expiry_date date,
  unit_cost numeric(12,4),           -- custo de entrada do lote (informativo)
  created_at timestamptz not null default now(),
  constraint stock_lot_item_xor check (num_nonnulls(ingredient_id, frozen_preparation_id) = 1)
);

comment on table inventory.stock_lot is
  'Lote físico por cozinha×item. FEFO usa expiry_date; lote sintético SEM-LOTE-<data> quando o operador não informa.';

create index stock_lot_kitchen_item_idx on inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id);
create index stock_lot_expiry_idx on inventory.stock_lot (expiry_date) where expiry_date is not null;

-- ----------------------------------------------------------------------------
-- Ledger
-- ----------------------------------------------------------------------------
create table inventory.stock_movement (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  lot_id uuid references inventory.stock_lot (id),
  type text not null check (type in (
    'receipt', 'production_issue', 'leftover_return', 'waste',
    'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out')),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(12,4),
  total_cost numeric(14,4),
  justification text,
  -- documentos de origem
  production_task_id uuid references kitchen.production_task (id) on delete set null,
  inventory_count_id uuid,             -- FK adicionada após a tabela de contagem
  transfer_pair_id uuid,               -- mesmo uuid nos dois movimentos da transferência
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint stock_movement_item_xor check (num_nonnulls(ingredient_id, frozen_preparation_id) = 1),
  -- ajuste sem justificativa não existe (MCASP)
  constraint stock_movement_adjustment_justified
    check (type not in ('adjustment_in', 'adjustment_out') or justification is not null)
);

comment on table inventory.stock_movement is
  'Ledger imutável (append-only via trigger). Quantidade positiva na unidade base do item; o sinal vem do type. Valoração a custo médio ponderado via triggers de costing.';

create index stock_movement_kitchen_item_idx on inventory.stock_movement (kitchen_id, ingredient_id, frozen_preparation_id);
create index stock_movement_lot_idx on inventory.stock_movement (lot_id);
create index stock_movement_created_idx on inventory.stock_movement (created_at desc);
create index stock_movement_task_idx on inventory.stock_movement (production_task_id) where production_task_id is not null;

-- Imutabilidade: nem service role atravessa (trigger roda sempre)
create function inventory.stock_movement_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'stock_movement é append-only (MCASP): corrija com um movimento de ajuste justificado';
end;
$$;

create trigger stock_movement_no_update_delete
  before update or delete on inventory.stock_movement
  for each row execute function inventory.stock_movement_immutable();

-- ----------------------------------------------------------------------------
-- Custo médio ponderado (MCASP)
-- ----------------------------------------------------------------------------
create table inventory.stock_cost (
  kitchen_id bigint not null references core.kitchen (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  quantity numeric(14,4) not null default 0,
  avg_unit_cost numeric(12,4) not null default 0,
  updated_at timestamptz not null default now(),
  constraint stock_cost_item_xor check (num_nonnulls(ingredient_id, frozen_preparation_id) = 1)
);

create unique index stock_cost_ingredient_key on inventory.stock_cost (kitchen_id, ingredient_id)
  where ingredient_id is not null;
create unique index stock_cost_frozen_key on inventory.stock_cost (kitchen_id, frozen_preparation_id)
  where frozen_preparation_id is not null;

comment on table inventory.stock_cost is
  'Custo médio ponderado corrente por cozinha×item (MCASP). Mantida exclusivamente pelos triggers de stock_movement — nunca escrever direto.';

-- BEFORE INSERT: saídas sem custo herdam o custo médio vigente; total sempre coerente
create function inventory.stock_movement_costing_before() returns trigger
language plpgsql as $$
declare v_avg numeric(12,4);
begin
  if new.type in ('production_issue', 'waste', 'transfer_out', 'adjustment_out') and new.unit_cost is null then
    select avg_unit_cost into v_avg
      from inventory.stock_cost
      where kitchen_id = new.kitchen_id
        and (ingredient_id = new.ingredient_id or frozen_preparation_id = new.frozen_preparation_id);
    new.unit_cost := coalesce(v_avg, 0);
  end if;
  new.total_cost := round(new.quantity * coalesce(new.unit_cost, 0), 4);
  return new;
end;
$$;

create trigger stock_movement_costing_before
  before insert on inventory.stock_movement
  for each row execute function inventory.stock_movement_costing_before();

-- AFTER INSERT: entradas recompõem o custo médio; saídas só reduzem quantidade
create function inventory.stock_movement_costing_after() returns trigger
language plpgsql as $$
declare
  v_qty numeric(14,4);
  v_avg numeric(12,4);
  v_new_qty numeric(14,4);
begin
  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where kitchen_id = new.kitchen_id
      and (ingredient_id = new.ingredient_id or frozen_preparation_id = new.frozen_preparation_id)
    for update;

  if not found then
    v_qty := 0; v_avg := 0;
    insert into inventory.stock_cost (kitchen_id, ingredient_id, frozen_preparation_id)
      values (new.kitchen_id, new.ingredient_id, new.frozen_preparation_id);
  end if;

  if new.type in ('receipt', 'leftover_return', 'transfer_in', 'adjustment_in') then
    v_new_qty := v_qty + new.quantity;
    if v_new_qty > 0 then
      v_avg := round(((greatest(v_qty, 0) * v_avg) + coalesce(new.total_cost, 0)) / v_new_qty, 4);
    end if;
  else
    v_new_qty := v_qty - new.quantity;
  end if;

  update inventory.stock_cost
    set quantity = v_new_qty, avg_unit_cost = v_avg, updated_at = now()
    where kitchen_id = new.kitchen_id
      and (ingredient_id = new.ingredient_id or frozen_preparation_id = new.frozen_preparation_id);
  return null;
end;
$$;

create trigger stock_movement_costing_after
  after insert on inventory.stock_movement
  for each row execute function inventory.stock_movement_costing_after();

-- ----------------------------------------------------------------------------
-- Saldo (view por lote; agregações por item ficam na consulta)
-- ----------------------------------------------------------------------------
create view inventory.v_stock_balance
  with (security_invoker = true) as
select
  m.kitchen_id,
  m.ingredient_id,
  m.frozen_preparation_id,
  m.lot_id,
  l.lot_code,
  l.expiry_date,
  sum(case when m.type in ('receipt', 'leftover_return', 'transfer_in', 'adjustment_in')
           then m.quantity else -m.quantity end) as balance,
  sum(case when m.type in ('receipt', 'leftover_return', 'transfer_in', 'adjustment_in')
           then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as balance_value,
  max(m.created_at) as last_movement_at
from inventory.stock_movement m
left join inventory.stock_lot l on l.id = m.lot_id
group by m.kitchen_id, m.ingredient_id, m.frozen_preparation_id, m.lot_id, l.lot_code, l.expiry_date;

comment on view inventory.v_stock_balance is
  'Saldo por cozinha×item×lote derivado do ledger. Materializar apenas se a performance exigir.';

-- ----------------------------------------------------------------------------
-- Contagem física (inventário rotativo) — contagem NÃO move saldo;
-- divergências geram ajustes vinculados na confirmação (atômica)
-- ----------------------------------------------------------------------------
create table inventory.inventory_count (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz
);

create table inventory.inventory_count_item (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references inventory.inventory_count (id) on delete cascade,
  lot_id uuid not null references inventory.stock_lot (id),
  counted_qty numeric(14,4) not null check (counted_qty >= 0),
  ledger_qty numeric(14,4),           -- snapshot do saldo no momento da contagem
  constraint inventory_count_item_lot_key unique (count_id, lot_id)
);

alter table inventory.stock_movement
  add constraint stock_movement_count_fk
  foreign key (inventory_count_id) references inventory.inventory_count (id) on delete set null;

create function inventory.confirm_inventory_count(p_count_id uuid, p_user uuid)
returns table (adjustments int)
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_item record;
  v_balance numeric(14,4);
  v_adjustments int := 0;
begin
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status <> 'draft' then raise exception 'Contagem já confirmada'; end if;

  for v_item in
    select ci.lot_id, ci.counted_qty, l.kitchen_id, l.ingredient_id, l.frozen_preparation_id
      from inventory.inventory_count_item ci
      join inventory.stock_lot l on l.id = ci.lot_id
      where ci.count_id = p_count_id
  loop
    select coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in')
                             then quantity else -quantity end), 0)
      into v_balance
      from inventory.stock_movement
      where lot_id = v_item.lot_id;

    update inventory.inventory_count_item
      set ledger_qty = v_balance
      where count_id = p_count_id and lot_id = v_item.lot_id;

    if v_item.counted_qty <> v_balance then
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity,
         justification, inventory_count_id, created_by)
      values
        (v_item.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_item.lot_id,
         case when v_item.counted_qty > v_balance then 'adjustment_in' else 'adjustment_out' end,
         abs(v_item.counted_qty - v_balance),
         'Contagem física ' || p_count_id, p_count_id, p_user);
      v_adjustments := v_adjustments + 1;
    end if;
  end loop;

  update inventory.inventory_count
    set status = 'confirmed', confirmed_by = p_user, confirmed_at = now()
    where id = p_count_id;

  return query select v_adjustments;
end;
$$;

-- ----------------------------------------------------------------------------
-- Transferência entre cozinhas: par atômico com referência cruzada;
-- lote de destino herda código/validade/custo
-- ----------------------------------------------------------------------------
create function inventory.transfer_stock(
  p_lot_id uuid,
  p_to_kitchen bigint,
  p_quantity numeric,
  p_user uuid
) returns table (transfer_pair_id uuid)
language plpgsql as $$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_dest_lot_id uuid;
  v_pair uuid := gen_random_uuid();
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id = p_to_kitchen then raise exception 'Origem e destino são a mesma cozinha'; end if;

  select coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  -- lote de destino: reusa se já existe o espelho, senão cria herdando os dados
  select id into v_dest_lot_id
    from inventory.stock_lot
    where kitchen_id = p_to_kitchen
      and lot_code = v_lot.lot_code
      and (ingredient_id = v_lot.ingredient_id or frozen_preparation_id = v_lot.frozen_preparation_id)
      and expiry_date is not distinct from v_lot.expiry_date
    limit 1;
  if v_dest_lot_id is null then
    insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost)
      values (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.lot_code, v_lot.expiry_date, v_lot.unit_cost)
      returning id into v_dest_lot_id;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, transfer_pair_id, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'transfer_out', p_quantity, v_pair, p_user);

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, transfer_pair_id, created_by)
  values
    (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_dest_lot_id, 'transfer_in', p_quantity, v_lot.unit_cost, v_pair, p_user);

  return query select v_pair;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS: leitura authenticated; escrita via service_role (server fns) apenas
-- ----------------------------------------------------------------------------
alter table inventory.stock_lot enable row level security;
alter table inventory.stock_movement enable row level security;
alter table inventory.stock_cost enable row level security;
alter table inventory.inventory_count enable row level security;
alter table inventory.inventory_count_item enable row level security;

create policy stock_lot_read on inventory.stock_lot for select to authenticated using (true);
create policy stock_movement_read on inventory.stock_movement for select to authenticated using (true);
create policy stock_cost_read on inventory.stock_cost for select to authenticated using (true);
create policy inventory_count_read on inventory.inventory_count for select to authenticated using (true);
create policy inventory_count_item_read on inventory.inventory_count_item for select to authenticated using (true);

grant select on inventory.stock_lot, inventory.stock_movement, inventory.stock_cost,
  inventory.inventory_count, inventory.inventory_count_item to authenticated;
