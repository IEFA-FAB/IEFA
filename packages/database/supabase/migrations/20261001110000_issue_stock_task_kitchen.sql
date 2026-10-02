-- ============================================================================
-- Saída do dia: a tarefa de produção citada tem de ser da cozinha da requisição
-- ============================================================================
-- `issue_stock` gravava `production_task_id` do jeito que vinha: uma saída da
-- cozinha A podia citar a tarefa da cozinha B. A variância teórico × real e a
-- baixa pendente da cozinha B passavam a contar uma saída que não saiu do
-- estoque dela (a tarefa aparecia como "já baixada"), e a de A ficava sem a
-- tarefa. `register_late_issue` já conferia (20260918220000); esta faz o mesmo.
--
-- A conferência vem DEPOIS do reconhecimento do retry: a emissão que já passou
-- (com a tarefa conferida na primeira vez) continua devolvendo o que fez.
--
-- Corpo idêntico ao vigente no banco (pg_get_functiondef em 2026-10-01), mais a
-- conferência. Assinatura, `search_path` e grants preservados: `create or
-- replace` mantém o ACL (postgres e service_role).
-- ============================================================================

create or replace function inventory.issue_stock(p_request_id uuid, p_ingredient_id uuid, p_quantity numeric, p_user uuid, p_emission_id text, p_override_lot_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_production_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(movements integer, without_lot numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
              or ingredient_id is distinct from p_ingredient_id
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

  -- A tarefa citada é da cozinha da requisição — a mesma regra de `register_late_issue`.
  if p_production_task_id is not null then
    select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_production_task_id;
    if v_task_kitchen is distinct from v_request.kitchen_id then
      raise exception 'Tarefa de produção não pertence a esta cozinha';
    end if;
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
