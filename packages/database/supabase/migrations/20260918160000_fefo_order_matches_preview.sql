-- ============================================================================
-- FEFO: a ordem da alocação no banco passa a ser a mesma da prévia na tela
-- ============================================================================
--
-- `inventory.register_production_issue` ordenava por
--   `l.use_first desc, l.expiry_date asc nulls last, l.received_at asc, l.id asc`
-- enquanto `sortFefo` (@iefa/sisub-domain) ordena o lote sem validade pela
-- data de entrada, na fila junto com os demais. Divergiam em dois pontos:
--
--  1. lote sem validade: o banco mandava para o FIM, o domínio para a posição
--     FIFO. O hortifrúti, que quase nunca tem validade na nota, era o caso
--     comum — apodrecia na câmara enquanto a tela dizia que sairia primeiro;
--  2. a data de entrada era lida em UTC, e o vencimento é data civil.
--
-- A prévia mostrada ao operador é a promessa; a alocação dentro da transação
-- é o que acontece. Quando divergem, a tela mente — e o operador confirma uma
-- baixa achando que sai um lote quando sai outro.
--
-- Só a cláusula `order by` muda. A exclusão de lote vencido e de lote em
-- quarentena, o travamento dos lotes e o movimento sem lote quando falta saldo
-- seguem iguais.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.register_production_issue(p_task_id uuid, p_lines jsonb, p_user uuid)
 RETURNS TABLE(movements integer)
 LANGUAGE plpgsql
AS $function$
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

    -- Ordem: "usar primeiro" (painel de vencimentos) → validade → id.
    -- Fora: lote vencido e lote em quarentena.
    --
    -- Lote SEM validade entra pela data de ENTRADA, na fila junto com os
    -- demais — não no fim. `nulls last` mandava o hortifrúti, que quase nunca
    -- traz validade na nota, para o fim da fila e o deixava apodrecer na
    -- câmara. É a regra que `sortFefo` já aplicava no domínio: as duas
    -- ordenações agora são a mesma, e a prévia na tela para de divergir da
    -- baixa que o banco executa.
    --
    -- A data de entrada vira data civil de BRASÍLIA. `received_at::date`
    -- casta no fuso da sessão (UTC): o lote recebido às 22h entrava na fila
    -- como se fosse do dia seguinte.
    --
    -- `l.id` no fim porque sem ele dois lotes de mesma validade saem em ordem
    -- arbitrária do planner, e a prévia acerta ou erra conforme o plano.
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
        order by l.use_first desc,
                 coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
                 l.id asc
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
$function$;

-- ----------------------------------------------------------------------------
-- `issue_stock` (saída do dia) já ordenava pelo `coalesce`, mas lia a data de
-- entrada em UTC. Mesmo resíduo de fuso, na outra função.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION inventory.issue_stock(p_request_id uuid, p_ingredient_id uuid, p_quantity numeric, p_user uuid, p_emission_id text, p_override_lot_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_production_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(movements integer, without_lot numeric)
 LANGUAGE plpgsql
AS $function$
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
      -- A data de entrada vira data civil de BRASÍLIA. `received_at::date` casta
      -- no fuso da SESSÃO, que é UTC: o lote recebido às 22h entrava na fila
      -- como se fosse de amanhã, e passava na frente do que chegou de manhã.
      order by l.use_first desc,
               coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
               l.received_at asc,
               l.id asc
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
$function$;


