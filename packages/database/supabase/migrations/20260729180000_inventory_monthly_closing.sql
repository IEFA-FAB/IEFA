-- ============================================================================
-- Fase 6 (estoque): fechamento mensal MCASP — snapshot valorado + lock de período
-- ============================================================================
-- Fechada a competência, lançamento com data dentro dela é BLOQUEADO por
-- trigger (roda para qualquer papel, service role incluso). Correções entram
-- como ajuste justificado no período aberto seguinte — nunca retroativas.
-- O fechamento é função SQL atômica: congela o saldo valorado (snapshot jsonb)
-- e os totais de entradas/saídas da competência.
-- ============================================================================

create table inventory.monthly_closing (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  competencia date not null
    check (competencia = date_trunc('month', competencia)::date),
  balance_snapshot jsonb not null,
  total_in numeric(14,4) not null default 0,
  total_out numeric(14,4) not null default 0,
  value_in numeric(14,4) not null default 0,
  value_out numeric(14,4) not null default 0,
  opening_value numeric(14,4) not null default 0,
  closing_value numeric(14,4) not null default 0,
  closed_by uuid references auth.users (id),
  closed_at timestamptz not null default now(),
  constraint monthly_closing_kitchen_competencia_key unique (kitchen_id, competencia)
);

comment on table inventory.monthly_closing is
  'Fechamento mensal MCASP por cozinha: snapshot do saldo valorado + totais (RMA/RMB). Período fechado bloqueia lançamentos retroativos via trigger.';

create index monthly_closing_kitchen_idx on inventory.monthly_closing (kitchen_id, competencia desc);

-- ----------------------------------------------------------------------------
-- Lock de período: INSERT em stock_movement com created_at dentro de
-- competência fechada da cozinha → rejeita
-- ----------------------------------------------------------------------------
create function inventory.stock_movement_period_lock() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from inventory.monthly_closing mc
    where mc.kitchen_id = new.kitchen_id
      and mc.competencia = date_trunc('month', new.created_at)::date
  ) then
    raise exception 'Competência % fechada para a cozinha % — lance ajuste justificado no período aberto',
      to_char(new.created_at, 'YYYY-MM'), new.kitchen_id;
  end if;
  return new;
end;
$$;

create trigger stock_movement_period_lock
  before insert on inventory.stock_movement
  for each row execute function inventory.stock_movement_period_lock();

-- ----------------------------------------------------------------------------
-- Fechamento atômico
-- ----------------------------------------------------------------------------
create function inventory.close_month(p_kitchen_id bigint, p_competencia date, p_user uuid)
returns table (closing_id uuid, items int)
language plpgsql as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_next date := (date_trunc('month', p_competencia) + interval '1 month')::date;
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
  if v_competencia >= date_trunc('month', now())::date + interval '1 month' then
    raise exception 'Não é possível fechar competência futura';
  end if;

  -- saldo valorado ATÉ o fim da competência (snapshot por item)
  with balances as (
    select
      m.ingredient_id,
      m.frozen_preparation_id,
      sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
               then m.quantity else -m.quantity end) as quantity,
      sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
               then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as value
    from inventory.stock_movement m
    where m.kitchen_id = p_kitchen_id and m.created_at < v_next
    group by m.ingredient_id, m.frozen_preparation_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', b.ingredient_id,
           'frozen_preparation_id', b.frozen_preparation_id,
           'quantity', b.quantity,
           'value', b.value)), '[]'::jsonb),
         count(*)::int,
         coalesce(sum(b.value), 0)
    into v_snapshot, v_items, v_closing_value
    from balances b
    where b.quantity <> 0 or b.value <> 0;

  select
    coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type not in ('receipt','leftover_return','transfer_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in') then coalesce(total_cost,0) end), 0),
    coalesce(sum(case when type not in ('receipt','leftover_return','transfer_in','adjustment_in') then coalesce(total_cost,0) end), 0)
    into v_total_in, v_total_out, v_value_in, v_value_out
    from inventory.stock_movement
    where kitchen_id = p_kitchen_id
      and created_at >= v_competencia and created_at < v_next;

  v_opening_value := v_closing_value - v_value_in + v_value_out;

  insert into inventory.monthly_closing
    (kitchen_id, competencia, balance_snapshot, total_in, total_out, value_in, value_out,
     opening_value, closing_value, closed_by)
  values
    (p_kitchen_id, v_competencia, v_snapshot, v_total_in, v_total_out, v_value_in, v_value_out,
     v_opening_value, v_closing_value, p_user)
  returning id into v_id;

  return query select v_id, v_items;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table inventory.monthly_closing enable row level security;
create policy monthly_closing_read on inventory.monthly_closing for select to authenticated using (true);
grant select on inventory.monthly_closing to authenticated;
