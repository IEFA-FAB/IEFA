-- ============================================================================
-- Fase 4 de sisub-inventory-operations: a saída do dia
-- ============================================================================
-- A baixa existia amarrada a UMA tarefa de produção já concluída, uma vez só,
-- e só nos últimos 30 dias. Na cozinha o material sai ANTES de cozinhar, ao
-- longo do dia, para várias preparações — e o que sobra fechado volta para a
-- prateleira. Nada disso cabia no desenho anterior:
--
--  • a requisição é do DIA (com refeição por linha), não da tarefa;
--  • emitir mais de uma vez é normal: faltou 3 kg no meio do preparo, emite-se
--    de novo;
--  • devolver insumo cru é normal: dois pacotes fechados voltam ao MESMO lote,
--    pelo custo com que saíram;
--  • saída avulsa (sem tarefa) existe — instrução noturna, apoio, evento;
--  • o motivo do desvio é pedido UMA VEZ, no fechamento do dia, e só quando o
--    desvio passa da tolerância E do piso. Pedir motivo a cada emissão ensina o
--    operador a marcar "outro" em tudo.
--
-- A data que manda é a de RETIRADA, não a de produção: descongelamento sai no
-- dia anterior, e forçar a data de produção jogaria a carne do almoço de
-- quarta na requisição de quarta, quando ela saiu na terça.
-- ============================================================================

alter table kitchen.production_task
  add column issue_date date;

comment on column kitchen.production_task.issue_date is
  'Data em que o material sai do estoque. Default = production_date; o descongelamento D-1 é o caso que obriga a separar as duas.';

alter table kitchen.ingredient
  add column issue_package_quantity numeric(14,4) check (issue_package_quantity > 0);

comment on column kitchen.ingredient.issue_package_quantity is
  'Embalagem de saída (saco de 5 KG, caixa de 20 UN). A sugestão é arredondada para cima nela: sugerir 3,37 KG de algo que só sai em saco de 5 KG garante variância em toda linha.';

-- ----------------------------------------------------------------------------
-- Requisição
-- ----------------------------------------------------------------------------
create table inventory.stock_issue_request (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references kitchen.kitchen (id),
  issue_date date not null,
  origin text not null default 'production' check (origin in ('production', 'ad_hoc')),
  -- `closed_unexplained`: fechou sozinha às 23:59 com linha fora da tolerância
  -- sem motivo. Não é punição: é a pendência ficar visível em vez de sumir.
  status text not null default 'open' check (status in ('open', 'closed', 'closed_unexplained')),
  destination text,
  purpose text,
  authorization_reference text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  constraint stock_issue_request_day_key unique (kitchen_id, issue_date, origin)
);

comment on table inventory.stock_issue_request is
  'Requisição de saída do dia. A produção SUGERE; o almoxarife decide a quantidade. Motivo do desvio é pedido no fechamento, uma vez.';

create index stock_issue_request_kitchen_idx on inventory.stock_issue_request (kitchen_id, issue_date desc);

create table inventory.stock_issue_request_item (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references inventory.stock_issue_request (id) on delete cascade,
  ingredient_id uuid not null references kitchen.ingredient (id),
  meal_type_id uuid references kitchen.meal_type (id),
  -- congelada no FECHAMENTO: enquanto a requisição está aberta ela acompanha o
  -- planejamento (efetivo muda), e depois vira o número contra o qual a
  -- variância é medida
  suggested_qty numeric(14,4),
  suggested_frozen_at timestamptz,
  variance_reason text check (variance_reason in (
    'headcount_change', 'production_loss', 'yield_difference', 'recipe_substitution', 'portion_adjustment', 'other')),
  variance_note text,
  created_at timestamptz not null default now(),
  constraint stock_issue_request_item_key unique (request_id, ingredient_id, meal_type_id)
);

create index stock_issue_request_item_request_idx on inventory.stock_issue_request_item (request_id);

alter table inventory.stock_issue_request enable row level security;
alter table inventory.stock_issue_request_item enable row level security;
revoke all on inventory.stock_issue_request from anon, authenticated;
revoke all on inventory.stock_issue_request_item from anon, authenticated;

-- o movimento passa a apontar a requisição que o gerou
alter table inventory.stock_movement
  add column issue_request_id uuid references inventory.stock_issue_request (id),
  -- idempotência da emissão: duplo clique e retry de rede não sacam duas vezes
  add column emission_id text;

-- Uma emissão vira VÁRIOS movimentos (um por lote alocado, mais o "sem lote"
-- quando falta saldo). Todos levam o MESMO `emission_id`, e a unicidade é por
-- emissão × lote — com o lote nulo normalizado, senão dois "sem lote" da mesma
-- emissão passariam (NULL é distinto de NULL em índice único).
create unique index stock_movement_emission_key
  on inventory.stock_movement (emission_id, coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where emission_id is not null;
create index stock_movement_issue_request_idx on inventory.stock_movement (issue_request_id) where issue_request_id is not null;

comment on column inventory.stock_movement.emission_id is
  'Identificador da emissão gerado no clique. Sem ele, um retry de rede com o almoxarife na frente do estoque tira a quantidade duas vezes.';

-- ----------------------------------------------------------------------------
-- Emissão
-- ----------------------------------------------------------------------------
/**
 * Emite saída de uma linha da requisição.
 *
 * A alocação acontece AQUI, com os lotes travados, ignorando vencido e
 * quarentena, preferindo o que foi marcado "usar primeiro" e ordenando o resto
 * por validade e depois por entrada (lote sem validade não vai para o fim da
 * fila: era assim que o hortifrúti apodrecia).
 *
 * Saldo insuficiente NÃO bloqueia: a cozinha não pode parar porque o ledger
 * está atrasado. A parte sem lote fica registrada para a contagem regularizar.
 */
create function inventory.issue_stock(
  p_request_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_user uuid,
  p_emission_id text,
  p_override_lot_id uuid default null,
  p_justification text default null,
  p_production_task_id uuid default null
) returns table (movements int, without_lot numeric)
language plpgsql as $$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_count int := 0;
  v_without_lot numeric(14,4) := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Emissão sem identificador'; end if;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  if v_request.status <> 'open' then raise exception 'Requisição já fechada'; end if;

  -- retry da MESMA emissão devolve o que já foi feito, sem sacar de novo
  if exists (select 1 from inventory.stock_movement where emission_id = p_emission_id) then
    return query
      select count(*)::int,
             coalesce(sum(case when lot_id is null then quantity else 0 end), 0)
        from inventory.stock_movement where emission_id = p_emission_id;
    return;
  end if;

  v_remaining := p_quantity;

  if p_override_lot_id is not null then
    -- escolha explícita de lote: a posse é conferida, e lote vencido exige
    -- justificativa (quem decide é a server fn, que também checa o nível)
    perform 1 from inventory.stock_lot
      where id = p_override_lot_id
        and kitchen_id = v_request.kitchen_id
        and ingredient_id is not distinct from p_ingredient_id
      for update;
    if not found then raise exception 'Lote não pertence à cozinha/ingrediente da requisição'; end if;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.kitchen_id, p_ingredient_id, p_override_lot_id, 'production_issue', p_quantity,
       p_justification, p_request_id, p_emission_id, p_production_task_id, p_user);
    return query select 1, 0::numeric;
    return;
  end if;

  perform 1 from inventory.stock_lot
    where kitchen_id = v_request.kitchen_id and ingredient_id is not distinct from p_ingredient_id
    order by id
    for update;

  for v_lot in
    select l.id,
           coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) as balance
      from inventory.stock_lot l
      left join inventory.stock_movement m on m.lot_id = l.id
      where l.kitchen_id = v_request.kitchen_id
        and l.ingredient_id is not distinct from p_ingredient_id
        and l.quarantined_at is null
        and (l.expiry_date is null or l.expiry_date >= v_today)
      group by l.id, l.use_first, l.expiry_date, l.received_at
      having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) > 0
      -- Lote SEM validade entra na fila pela data de entrada, não no fim dela:
      -- `nulls last` mandava o hortifrúti (que quase nunca traz validade na
      -- nota) para depois de tudo, e ele apodrecia na câmara. A chave de ordem
      -- é a validade quando existe, senão o dia da entrada.
      order by l.use_first desc, coalesce(l.expiry_date, l.received_at::date) asc, l.received_at asc, l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.balance, v_remaining);
    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.kitchen_id, p_ingredient_id, v_lot.id, 'production_issue', v_take,
       p_justification, p_request_id, p_emission_id, p_production_task_id, p_user);
    v_count := v_count + 1;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, issue_request_id, emission_id, production_task_id, created_by)
    values
      (v_request.kitchen_id, p_ingredient_id, null, 'production_issue', v_remaining,
       coalesce(p_justification, 'Saída além do saldo em lotes — regularizar na contagem'),
       p_request_id, p_emission_id, p_production_task_id, p_user);
    v_count := v_count + 1;
    v_without_lot := v_remaining;
  end if;

  return query select v_count, v_without_lot;
end;
$$;

/**
 * Devolve ao estoque o que saiu e não foi usado.
 *
 * Volta ao MESMO lote, pelo custo médio das saídas daquele lote nesta
 * requisição — devolver ao custo médio atual moveria o valor do estoque por
 * uma operação que é só "o pacote fechado voltou para a prateleira".
 */
create function inventory.return_issue(
  p_request_id uuid,
  p_lot_id uuid,
  p_quantity numeric,
  p_user uuid,
  p_emission_id text
-- Os nomes de saída levam prefixo porque `unit_cost` também é COLUNA das
-- tabelas consultadas aqui: em plpgsql o parâmetro de saída ganha do nome da
-- coluna, e a consulta estoura com "column reference is ambiguous". Mesmo
-- tropeço de `split_lot`.
) returns table (return_movement_id uuid, return_unit_cost numeric)
language plpgsql as $$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_lot inventory.stock_lot%rowtype;
  v_issued numeric(14,4);
  v_returned numeric(14,4);
  v_cost numeric(12,4);
  v_id uuid;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id <> v_request.kitchen_id then raise exception 'Lote de outra cozinha'; end if;

  -- só se devolve o que saiu POR ESTA requisição, e só deste lote
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
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost,
     justification, issue_request_id, emission_id, created_by)
  values
    (v_request.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'issue_return', p_quantity, v_cost,
     'Devolução de saída não utilizada', p_request_id, p_emission_id, p_user)
  returning id into v_id;

  return query select v_id, v_cost;
end;
$$;


-- ----------------------------------------------------------------------------
-- A baixa antiga passa a ordenar igual
-- ----------------------------------------------------------------------------
-- `register_production_issue` (Fase 0/2) tinha `expiry_date asc nulls last`,
-- enquanto o domínio (`allocateFefo`) já ordenava lote sem validade pela data
-- de entrada. Duas ordens diferentes significam que a tela mostra uma alocação
-- e o banco grava outra — e o teste de integração pegou exatamente isso.
create or replace function inventory.register_production_issue(
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
  perform set_config('inventory.via_rpc', 'on', true);
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

    perform 1 from inventory.stock_lot
      where kitchen_id = v_line.kitchen_id
        and ingredient_id is not distinct from v_line.ingredient_id
      order by id
      for update;

    for v_lot in
      select l.id,
             coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) as balance
        from inventory.stock_lot l
        left join inventory.stock_movement m on m.lot_id = l.id
        where l.kitchen_id = v_line.kitchen_id
          and l.ingredient_id is not distinct from v_line.ingredient_id
          and l.quarantined_at is null
          and (l.expiry_date is null or l.expiry_date >= v_today)
        group by l.id, l.use_first, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
        order by l.use_first desc, coalesce(l.expiry_date, l.received_at::date) asc, l.received_at asc, l.id asc
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
