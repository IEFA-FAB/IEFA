-- ============================================================================
-- FEFO: `issue_stock` lê a data de entrada na data civil de Brasília
-- ============================================================================
--
-- Mesma correção da 20260918160000, na outra função de saída. Mora aqui, e não
-- lá, porque `issue_stock` e a tabela `stock_issue_request` que ela lê nascem
-- na 20260917220000, que acompanha este código: um `create or replace` numa
-- migration anterior apontaria, em banco limpo, para relação inexistente.
--
-- `received_at::date` castava no fuso da SESSÃO, que é UTC — o lote recebido
-- às 22h entrava na fila como se fosse de amanhã. Agora a chave é
-- `coalesce(validade, dia da entrada em Brasília)`, com empate pela entrada
-- mais antiga e depois pelo id: a MESMA ordem das duas funções de saída.
--
-- Uma versão anterior desta migration tirava o `received_at` do desempate
-- para bater com `sortFefo`, que não tem chamador no app. Voltou, pelo mesmo
-- motivo registrado na 20260918160000.
--
-- Só a cláusula `order by` muda.
-- ============================================================================

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


