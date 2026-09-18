-- ============================================================================
-- Saída do dia: quarta rodada — retry, ordem de trava, retrato e avulsas
-- ============================================================================
--
--  1. `issue_stock` reconhece o retry ANTES de recusar o dia fechado, e os dois
--     replays (saída e devolução) conferem que o retry é o MESMO pedido;
--  2. `close_issue_request` trava as linhas antes da requisição (a ordem do
--     trigger das linhas), e o retrato inclui a SUGESTÃO, não só a contagem de
--     movimentos;
--  3. o trigger das linhas deixa o CASCADE apagar as linhas de requisição
--     apagada;
--  4. mais de uma saída avulsa por dia.
-- ============================================================================

create or replace function inventory.issue_stock(p_request_id uuid, p_ingredient_id uuid, p_quantity numeric, p_user uuid, p_emission_id text, p_override_lot_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_production_task_id uuid DEFAULT NULL::uuid)
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

create or replace function inventory.return_issue(p_request_id uuid, p_lot_id uuid, p_quantity numeric, p_user uuid, p_emission_id text)
 returns table(return_movement_id uuid, return_unit_cost numeric)
 language plpgsql
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
  if v_lot.kitchen_id <> v_request.kitchen_id then raise exception 'Lote de outra cozinha'; end if;

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
$function$;

-- Forma canônica da sugestão: `ingrediente=quantidade` com 4 casas, em ordem
-- de ingrediente, separados por vírgula; sugestão nula vira vazio. O servidor
-- monta a MESMA string das linhas que leu (`issueSuggestionFingerprint`, em
-- `@iefa/sisub-domain`), e o teste de integração prova que as duas batem.
create function inventory.issue_suggestion_fingerprint(p_request_id uuid) returns text
language sql stable as $$
  select coalesce(string_agg(
           ingredient_id::text || '=' || coalesce(to_char(suggested_qty, 'FM9999999999990.0000'), ''),
           ',' order by ingredient_id::text collate "C"), '')
    from inventory.stock_issue_request_item
   where request_id = p_request_id;
$$;

revoke all on function inventory.issue_suggestion_fingerprint(uuid) from anon, authenticated;

drop function inventory.close_issue_request(uuid, uuid, int);

create function inventory.close_issue_request(
  p_request_id uuid,
  p_user uuid,
  -- quantos movimentos a requisição tinha quando o retrato foi montado
  p_seen_movements int,
  -- a sugestão que o retrato usou, em forma canônica (ver `issue_suggestion_fingerprint`)
  p_seen_suggestions text
) returns table (closed_at timestamptz, movements int)
language plpgsql as $$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_movements int;
  v_suggestions text;
  v_now timestamptz := now();
begin
  perform set_config('inventory.via_rpc', 'on', true);

  -- Linhas ANTES da requisição. O trigger das linhas trava a linha (pelo
  -- próprio UPDATE) e depois pede `for share` na requisição; o fechamento
  -- travava a requisição e depois as linhas. Motivo gravado no meio do
  -- fechamento terminava em "deadlock detected". Na mesma ordem dos dois lados,
  -- um espera o outro.
  perform 1 from inventory.stock_issue_request_item
   where request_id = p_request_id
   order by id
   for update;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  if v_request.status <> 'open' then raise exception 'Requisição já fechada'; end if;

  select count(*) into v_movements
    from inventory.stock_movement where issue_request_id = p_request_id;

  if v_movements <> p_seen_movements then
    raise exception 'A requisição mudou enquanto o fechamento era confirmado (% movimentos, esperados %). Recarregue e confira os desvios antes de fechar',
      v_movements, p_seen_movements;
  end if;

  -- A contagem de movimentos não enxerga a SUGESTÃO mudando: "recalcular"
  -- durante o fechamento congelava a sugestão nova enquanto a tolerância tinha
  -- sido conferida contra a antiga, e nenhum motivo era pedido mesmo quando os
  -- números novos exigiriam. O retrato precisa das duas coisas.
  v_suggestions := inventory.issue_suggestion_fingerprint(p_request_id);
  if v_suggestions is distinct from p_seen_suggestions then
    raise exception 'A sugestão do dia mudou enquanto o fechamento era confirmado. Recarregue e confira os desvios antes de fechar';
  end if;

  update inventory.stock_issue_request_item
     set suggested_frozen_at = v_now
   where request_id = p_request_id and suggested_frozen_at is null;

  update inventory.stock_issue_request
     set status = 'closed', closed_by = p_user, closed_at = v_now
   where id = p_request_id;

  return query select v_now, v_movements;
end;
$$;

comment on function inventory.close_issue_request is
  'Fecha a requisição do dia sob trava (linhas, depois requisição), recusando se algum movimento ou a sugestão mudou depois do retrato de variância que o servidor conferiu.';

revoke all on function inventory.close_issue_request(uuid, uuid, int, text) from anon, authenticated;

create or replace function inventory.issue_item_requires_open_request() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status
    from inventory.stock_issue_request
   where id = coalesce(new.request_id, old.request_id)
   for share;
  -- Requisição que não existe mais: é o CASCADE apagando as linhas depois de a
  -- requisição sair. Recusar ali bloqueava apagar qualquer requisição com
  -- linhas, com a mensagem falsa "já foi fechada". Linha nova sem requisição a
  -- FK já recusa.
  if not found then
    return coalesce(new, old);
  end if;
  if v_status <> 'open' then
    raise exception 'A requisição do dia já foi fechada — as linhas dela não mudam mais';
  end if;
  return coalesce(new, old);
end;
$$;

-- Mais de uma saída avulsa por dia. `unique (kitchen_id, issue_date, origin)`
-- fazia a segunda avulsa reusar calada a primeira — perdendo o motivo e o
-- destino novos — e, fechada a avulsa da manhã, não havia mais avulsa naquele
-- dia (o evento da noite ficava sem documento). A requisição da PRODUÇÃO
-- continua uma por dia.
alter table inventory.stock_issue_request drop constraint stock_issue_request_day_key;
create unique index stock_issue_request_production_day_key
  on inventory.stock_issue_request (kitchen_id, issue_date)
  where origin = 'production';
