-- ============================================================================
-- Fase 0 do change sisub-inventory-operations: corrigir antes de operar
-- ============================================================================
-- O módulo de estoque tem 0 linhas em produção. Nenhuma migração de dado é
-- necessária, e é agora que mudar contrato de função sai barato.
--
-- O que esta migration corrige (openspec/changes/sisub-inventory-operations):
--  (1) Leitura/execução abertas: goods_receipt_item_lot tinha policy
--      `using (true)` + grant para `authenticated` (custo, lote, temperatura
--      legíveis por qualquer sessão de qualquer app pelo PostgREST), e as
--      funções de `inventory` tinham EXECUTE para `public`.
--  (2) occurred_at: instante FÍSICO do movimento, separado do lançamento.
--      Saldo, competência e trava de período passam a usar occurred_at no
--      fuso America/Sao_Paulo — `date_trunc('month', created_at)` com o banco
--      em UTC jogava 21h-24h do último dia do mês na competência seguinte.
--  (3) Custo médio: a linha de stock_cost passa a ser criada e travada ANTES
--      da leitura (corrida entre entradas concorrentes e 23505 na primeira
--      linha), entrada sem custo herda o custo médio (sobra de inventário
--      entrava a R$ 0 e DILUÍA a média), e entrada sobre saldo <= 0 passa a
--      valer o custo da própria entrada.
--  (4) transfer_in entra ao custo do transfer_out (custo médio da origem) —
--      entrava ao unit_cost do lote, que é informativo: o valor que saía de
--      uma cozinha era diferente do que entrava na outra.
--  (5) register_production_issue passa a ALOCAR os lotes dentro da transação,
--      com FOR UPDATE, ignorando vencidos e ordenando lote sem validade por
--      data de entrada (FIFO). A alocação em TypeScript lia saldo fora da
--      transação: duas baixas simultâneas do mesmo lote o deixavam negativo,
--      e o FEFO escolhia lote VENCIDO primeiro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Fechar leitura e execução
-- ----------------------------------------------------------------------------
drop policy if exists goods_receipt_item_lot_read on inventory.goods_receipt_item_lot;
revoke all on inventory.goods_receipt_item_lot from authenticated, anon;

revoke execute on all functions in schema inventory from public, anon, authenticated;
revoke usage on schema inventory from anon, authenticated;

-- ----------------------------------------------------------------------------
-- (2) occurred_at
-- ----------------------------------------------------------------------------
alter table inventory.stock_movement add column occurred_at timestamptz;

comment on column inventory.stock_movement.occurred_at is
  'Instante FÍSICO do movimento (a mercadoria saiu/entrou). created_at é o lançamento. Saldo em instante, competência e trava de período usam occurred_at.';

-- backfill: o ledger é append-only por trigger, que precisa sair do caminho
-- para esta única escrita de migração (zero linhas hoje; um dump restaurado
-- teria linhas e a migration não pode falhar nele)
alter table inventory.stock_movement disable trigger stock_movement_no_update_delete;
update inventory.stock_movement set occurred_at = created_at where occurred_at is null;
alter table inventory.stock_movement enable trigger stock_movement_no_update_delete;

alter table inventory.stock_movement
  alter column occurred_at set default now(),
  alter column occurred_at set not null;

create index stock_movement_occurred_idx on inventory.stock_movement (kitchen_id, occurred_at desc);

-- Retroativo só dentro do mesmo dia em Brasília; futuro nunca (tolerância de
-- 1 min para relógio de servidor).
create function inventory.stock_movement_occurred_at_guard() returns trigger
language plpgsql as $$
begin
  if new.occurred_at > now() + interval '1 minute' then
    raise exception 'occurred_at no futuro não é permitido';
  end if;
  if (new.occurred_at at time zone 'America/Sao_Paulo')::date
     < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'occurred_at retroativo só dentro do mesmo dia (Brasília) — use ajuste para corrigir dia anterior';
  end if;
  return new;
end;
$$;

create trigger stock_movement_occurred_at_guard
  before insert on inventory.stock_movement
  for each row execute function inventory.stock_movement_occurred_at_guard();

-- ----------------------------------------------------------------------------
-- (3) Custo médio: travar antes de ler, entrada sem custo ao custo médio
-- ----------------------------------------------------------------------------
create or replace function inventory.stock_movement_costing_before() returns trigger
language plpgsql as $$
declare
  v_avg numeric(12,4);
  v_qty numeric(14,4);
  v_last numeric(12,4);
begin
  -- a linha de custo nasce aqui e fica TRAVADA até o fim da transação: o
  -- AFTER recalcula sobre ela, e entradas concorrentes da mesma cozinha×item
  -- serializam em vez de ler a média velha (review adversarial, A1).
  insert into inventory.stock_cost (kitchen_id, ingredient_id, frozen_preparation_id)
    values (new.kitchen_id, new.ingredient_id, new.frozen_preparation_id)
    on conflict do nothing;

  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id
    for update;

  if new.unit_cost is null then
    if new.type in ('production_issue', 'waste', 'transfer_out', 'adjustment_out') then
      -- saída: custo médio vigente
      new.unit_cost := coalesce(v_avg, 0);
    elsif new.type = 'adjustment_in' then
      -- entrada sem custo (sobra de inventário, achado): custo médio; sem
      -- média, o último custo de recebimento; sem nenhum, recusa — entrar a
      -- R$ 0 derrubava o valor do estoque inteiro.
      if coalesce(v_avg, 0) > 0 then
        new.unit_cost := v_avg;
      else
        select m.unit_cost into v_last
          from inventory.stock_movement m
          where m.kitchen_id = new.kitchen_id
            and m.ingredient_id is not distinct from new.ingredient_id
            and m.frozen_preparation_id is not distinct from new.frozen_preparation_id
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
$$;

create or replace function inventory.stock_movement_costing_after() returns trigger
language plpgsql as $$
declare
  v_qty numeric(14,4);
  v_avg numeric(12,4);
  v_new_qty numeric(14,4);
begin
  -- a linha existe e está travada desde o BEFORE
  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id
    for update;

  if new.type in ('receipt', 'leftover_return', 'transfer_in', 'adjustment_in') then
    v_new_qty := v_qty + new.quantity;
    if v_qty <= 0 then
      -- saldo zerado ou negativo: a média passa a ser a da própria entrada.
      -- (10 KG entrando a R$ 6 sobre saldo -2 dava (0+60)/8 = R$ 7,50.)
      v_avg := case when new.quantity > 0 then round(coalesce(new.total_cost, 0) / new.quantity, 4) else v_avg end;
    elsif v_new_qty > 0 then
      v_avg := round(((v_qty * v_avg) + coalesce(new.total_cost, 0)) / v_new_qty, 4);
    end if;
  else
    v_new_qty := v_qty - new.quantity;
  end if;

  update inventory.stock_cost
    set quantity = v_new_qty, avg_unit_cost = v_avg, updated_at = now()
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (2b) Saldo e competência por occurred_at
-- ----------------------------------------------------------------------------
create or replace view inventory.v_stock_balance
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
  max(m.occurred_at) as last_movement_at
from inventory.stock_movement m
left join inventory.stock_lot l on l.id = m.lot_id
group by m.kitchen_id, m.ingredient_id, m.frozen_preparation_id, m.lot_id, l.lot_code, l.expiry_date;

create or replace function inventory.stock_movement_period_lock() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('inv_close:' || new.kitchen_id, 42));
  if exists (
    select 1 from inventory.monthly_closing mc
    where mc.kitchen_id = new.kitchen_id
      and mc.competencia = date_trunc('month', (new.occurred_at at time zone 'America/Sao_Paulo'))::date
  ) then
    raise exception 'Competência % fechada para a cozinha % — lance ajuste justificado no período aberto',
      to_char(new.occurred_at at time zone 'America/Sao_Paulo', 'YYYY-MM'), new.kitchen_id;
  end if;
  return new;
end;
$$;

create or replace function inventory.close_month(p_kitchen_id bigint, p_competencia date, p_user uuid)
returns table (closing_id uuid, items int)
language plpgsql as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  -- fronteiras em Brasília convertidas para timestamptz: o banco está em UTC
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

  perform pg_advisory_xact_lock(hashtextextended('inv_close:' || p_kitchen_id, 42));

  with balances as (
    select
      m.ingredient_id,
      m.frozen_preparation_id,
      sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
               then m.quantity else -m.quantity end) as quantity,
      sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
               then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as value
    from inventory.stock_movement m
    where m.kitchen_id = p_kitchen_id and m.occurred_at < v_next
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
      and occurred_at >= v_start and occurred_at < v_next;

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
-- (4) Transferência: destino entra ao custo do movimento de saída
-- ----------------------------------------------------------------------------
create or replace function inventory.transfer_stock(
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
  v_out_cost numeric(12,4);
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id = p_to_kitchen then raise exception 'Origem e destino são a mesma cozinha'; end if;

  select coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

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

  -- a saída é valorada pelo trigger ao custo médio da ORIGEM; o destino entra
  -- pelo mesmo valor, senão o que sai de uma cozinha difere do que entra na
  -- outra (o unit_cost do lote é informativo).
  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, transfer_pair_id, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'transfer_out', p_quantity, v_pair, p_user)
  returning unit_cost into v_out_cost;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, transfer_pair_id, created_by)
  values
    (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_dest_lot_id, 'transfer_in', p_quantity, v_out_cost, v_pair, p_user);

  return query select v_pair;
end;
$$;

-- ----------------------------------------------------------------------------
-- (5) Baixa de produção: alocação dentro da transação
-- ----------------------------------------------------------------------------
drop function if exists inventory.register_production_issue(uuid, jsonb, uuid);

create function inventory.register_production_issue(
  p_task_id uuid,
  p_lines jsonb,
  p_user uuid
) returns table (movements int)
language plpgsql as $$
declare
  v_count int := 0;
  v_line record;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 42));

  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'production_issue'
  ) then
    raise exception 'Esta tarefa já teve baixa de estoque registrada';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(
      kitchen_id bigint,
      ingredient_id uuid,
      quantity numeric,
      override_lot_id uuid,
      justification text
    )
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantidade deve ser positiva';
    end if;

    -- override: o operador escolheu o lote (exige justificativa, validada na
    -- server fn) — confere posse e não mexe no FEFO
    if v_line.override_lot_id is not null then
      perform 1 from inventory.stock_lot
        where id = v_line.override_lot_id
          and kitchen_id = v_line.kitchen_id
          and ingredient_id is not distinct from v_line.ingredient_id
        for update;
      if not found then
        raise exception 'Lote % não pertence à cozinha/ingrediente do movimento (override inválido)', v_line.override_lot_id;
      end if;
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, v_line.override_lot_id, 'production_issue',
         v_line.quantity, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      continue;
    end if;

    v_remaining := v_line.quantity;

    -- alocação DENTRO da transação, com os lotes travados: sem o lock, duas
    -- baixas simultâneas liam o mesmo saldo e o lote ficava negativo.
    -- Ordem: validade crescente (FEFO), lote SEM validade pela data de
    -- entrada (FIFO) — sair "por último" fazia o hortifrúti apodrecer.
    -- Lote vencido NÃO é alocado: consumir vencido é decisão explícita.
    -- trava TODOS os lotes do item, sempre na mesma ordem (id): sem isso, duas
    -- baixas simultâneas leem o mesmo saldo; com ordem diferente, deadlock.
    perform 1 from inventory.stock_lot
      where kitchen_id = v_line.kitchen_id
        and ingredient_id is not distinct from v_line.ingredient_id
      order by id
      for update;

    for v_lot in
      select l.id,
             l.expiry_date,
             coalesce(sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) as balance
        from inventory.stock_lot l
        left join inventory.stock_movement m on m.lot_id = l.id
        where l.kitchen_id = v_line.kitchen_id
          and l.ingredient_id is not distinct from v_line.ingredient_id
          and (l.expiry_date is null or l.expiry_date >= v_today)
        group by l.id, l.expiry_date, l.created_at
        having coalesce(sum(case when m.type in ('receipt','leftover_return','transfer_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
        order by l.expiry_date asc nulls last, l.created_at asc, l.id asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.balance, v_remaining);
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, v_lot.id, 'production_issue',
         v_take, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      -- falta: registra sem lote e deixa a pendência visível para a contagem
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, null, 'production_issue', v_remaining,
         coalesce(v_line.justification, 'Consumo além do saldo em lotes (estoque negativo — regularizar na contagem)'),
         p_task_id, p_user);
      v_count := v_count + 1;
    end if;
  end loop;

  return query select v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- (6) Ajuste manual atômico
-- ----------------------------------------------------------------------------
-- O ajuste criava o lote numa request e o movimento em outra: se a segunda
-- falhasse, sobrava lote órfão e nenhum movimento — e nada trava o lote no
-- meio. Aqui é uma transação só, com o lote travado e o saldo conferido na
-- saída (saída maior que o saldo do lote virava saldo negativo silencioso).
create function inventory.adjust_stock(
  p_kitchen_id bigint,
  p_direction text,
  p_quantity numeric,
  p_justification text,
  p_user uuid,
  p_lot_id uuid default null,
  p_ingredient_id uuid default null,
  p_frozen_preparation_id uuid default null,
  p_lot_code text default null,
  p_expiry_date date default null,
  p_unit_cost numeric default null
) returns table (lot_id uuid, movement_id uuid)
language plpgsql as $$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_movement_id uuid;
begin
  if p_direction not in ('in', 'out') then raise exception 'Direção inválida: %', p_direction; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_justification is null or length(btrim(p_justification)) < 5 then
    raise exception 'Justificativa obrigatória (mínimo 5 caracteres)';
  end if;

  if p_lot_id is not null then
    select * into v_lot from inventory.stock_lot
      where id = p_lot_id and kitchen_id = p_kitchen_id
      for update;
    if not found then raise exception 'Lote não encontrado nesta cozinha'; end if;
  else
    if p_direction = 'out' then raise exception 'Saída exige lote existente'; end if;
    if num_nonnulls(p_ingredient_id, p_frozen_preparation_id) <> 1 then
      raise exception 'Informe exatamente um item (ingrediente OU preparação congelada) para o lote novo';
    end if;
    insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost)
      values (p_kitchen_id, p_ingredient_id, p_frozen_preparation_id,
              coalesce(nullif(btrim(p_lot_code), ''),
                       'SEM-LOTE-' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')),
              p_expiry_date, p_unit_cost)
      returning * into v_lot;
  end if;

  if p_direction = 'out' then
    select coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in')
                             then quantity else -quantity end), 0)
      into v_balance
      from inventory.stock_movement where lot_id = v_lot.id;
    if v_balance < p_quantity then
      raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
    end if;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, justification, created_by)
  values
    (p_kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.id,
     case when p_direction = 'in' then 'adjustment_in' else 'adjustment_out' end,
     p_quantity,
     case when p_direction = 'in' then p_unit_cost else null end,
     btrim(p_justification), p_user)
  returning id into v_movement_id;

  return query select v_lot.id, v_movement_id;
end;
$$;
