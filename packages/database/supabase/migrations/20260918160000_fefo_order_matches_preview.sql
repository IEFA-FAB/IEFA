-- ============================================================================
-- FEFO: lote sem validade entra na fila pela data de entrada, em Brasília
-- ============================================================================
--
-- `inventory.register_production_issue` ordenava por
--   `l.use_first desc, l.expiry_date asc nulls last, l.received_at asc, l.id asc`
-- e isso tinha dois defeitos de comportamento:
--
--  1. lote SEM validade ia para o FIM da fila. O hortifrúti, que quase nunca
--     traz validade na nota, era o caso comum — e apodrecia na câmara enquanto
--     lotes que venciam daqui a meses saíam antes dele;
--  2. a data de entrada, quando usada, era lida em UTC; o vencimento é data
--     civil de Brasília.
--
-- Agora a chave é `coalesce(validade, dia da entrada em Brasília)`, e o empate
-- sai pela entrada mais antiga (`received_at`) antes do `id`.
--
-- Uma versão anterior desta migration justificava a mudança como "igualar a
-- prévia da tela" e tirava o `received_at` do desempate para bater com
-- `sortFefo`. A revisão mostrou que nenhuma tela chama `sortFefo`: o argumento
-- era oco, e o custo era real — lotes de mesma validade saindo em ordem de
-- UUID em vez da entrada mais antiga. O desempate voltou.
--
-- Só a cláusula `order by` muda. A exclusão de lote vencido e de lote em
-- quarentena, o travamento dos lotes e o movimento sem lote quando falta saldo
-- seguem iguais.
--
-- `inventory.issue_stock` recebe a mesma ordem na migration que acompanha o
-- código da saída do dia (20260918190000), porque é lá que ela é usada.
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
    -- Empate de validade sai pela ENTRADA mais antiga (`received_at`, o
    -- instante, e não só o dia): dois lotes de arroz com a mesma validade, o
    -- que chegou primeiro sai primeiro. `l.id` só desempata o que resta, para
    -- a ordem não depender do plano do banco.
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
                 l.received_at asc,
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
