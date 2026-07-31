-- ============================================================================
-- Hardening da re-review (Greptile, rodada 2) — funções do ciclo de estoque
-- ============================================================================
-- Todas as alterações são create-or-replace/índices sobre objetos criados
-- nesta mesma leva (tabelas ainda sem dados de produção).
--
--  1. finalize_goods_receipt: dupla efetivação era possível (status
--     'divergent' pós-efetivação reentrava no gate) → guard por
--     definitive_at; valida OF da MESMA cozinha do recebimento.
--  2. goods_receipt: recebimento duplicado da mesma NF-e (duas conferências →
--     estoque em dobro no definitivo) → unique parcial por nfe_document_id.
--  3. supply_order_check_empenho: duas OFs concorrentes liam a mesma soma e
--     ambas passavam → advisory xact lock por empenho serializa a validação.
--  4. confirm_inventory_count: transferência concorrente do lote entre a
--     leitura do saldo e o ajuste → FOR UPDATE nos lotes da contagem
--     (transfer_stock já locka o lote; passam a se serializar).
--  5. register_production_issue: lote de override não era validado → agora
--     precisa pertencer à cozinha E ao ingrediente do movimento.
--  6. register_leftover: retry criava lote novo a cada chamada → reusa lote
--     existente (mesma cozinha/preparação/código/validade), como o transfer.
-- ============================================================================

-- (1) efetivação idempotente + OF da mesma cozinha
create or replace function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
returns table (movements int)
language plpgsql as $$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot_id uuid;
  v_lot_code text;
  v_movements int := 0;
  v_has_divergence boolean;
  v_of_kitchen bigint;
begin
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if v_receipt.definitive_at is not null then
    raise exception 'Recebimento já efetivado em % — efetivação é única', v_receipt.definitive_at;
  end if;
  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;
  if v_receipt.supply_order_id is not null then
    select kitchen_id into v_of_kitchen from procurement.supply_order where id = v_receipt.supply_order_id;
    if v_of_kitchen is distinct from v_receipt.kitchen_id then
      raise exception 'OF pertence à cozinha %, não à cozinha do recebimento (%)', v_of_kitchen, v_receipt.kitchen_id;
    end if;
  end if;

  for v_item in
    select * from inventory.goods_receipt_item where receipt_id = p_receipt_id
  loop
    if v_item.received_qty_base <= 0 then continue; end if;

    v_lot_code := coalesce(nullif(btrim(v_item.lot_code), ''), 'SEM-LOTE-' || to_char(now(), 'YYYY-MM-DD'));

    insert into inventory.stock_lot
      (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost, goods_receipt_item_id)
    values
      (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_lot_code,
       v_item.expiry_date, v_item.unit_cost, v_item.id)
    returning id into v_lot_id;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost,
       goods_receipt_item_id, created_by)
    values
      (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_lot_id,
       'receipt', v_item.received_qty_base, coalesce(v_item.unit_cost, 0), v_item.id, p_user);

    v_movements := v_movements + 1;
  end loop;

  select exists (
    select 1 from inventory.goods_receipt_item
    where receipt_id = p_receipt_id and divergence_reason is not null
  ) into v_has_divergence;

  update inventory.goods_receipt
    set status = case when v_has_divergence then 'divergent' else 'definitive' end,
        definitive_by = p_user,
        definitive_at = now()
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
$$;

-- (2) uma conferência ativa por NF-e (rejeitada libera a chave)
create unique index goods_receipt_nfe_document_unique
  on inventory.goods_receipt (nfe_document_id)
  where nfe_document_id is not null and status <> 'rejected';

-- (3) validação de saldo do empenho serializada
create or replace function procurement.supply_order_check_empenho() returns trigger
language plpgsql as $$
declare
  v_empenho_id uuid;
  v_empenho_qty numeric(14,4);
  v_of_total numeric(14,4);
begin
  select so.empenho_id into v_empenho_id
    from procurement.supply_order so where so.id = new.supply_order_id;
  -- serializa OFs concorrentes do MESMO empenho — sem isto, duas transações
  -- liam a mesma soma e ambas passavam do teto
  perform pg_advisory_xact_lock(hashtextextended('of_empenho:' || v_empenho_id::text, 42));
  select e.quantidade_empenhada into v_empenho_qty
    from finance.empenho e where e.id = v_empenho_id;
  select coalesce(sum(i.ordered_qty), 0) into v_of_total
    from procurement.supply_order_item i
    join procurement.supply_order so on so.id = i.supply_order_id
    where so.empenho_id = v_empenho_id and so.status <> 'cancelled';
  if v_of_total > v_empenho_qty then
    raise exception 'Soma das OFs (%) excede a quantidade empenhada (%)', v_of_total, v_empenho_qty;
  end if;
  return new;
end;
$$;

-- (4) contagem locka os lotes que vai ajustar
create or replace function inventory.confirm_inventory_count(p_count_id uuid, p_user uuid)
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
      for update of l   -- serializa contra transfer_stock (que também locka o lote)
  loop
    if v_item.kitchen_id <> v_count.kitchen_id then
      raise exception 'Lote % pertence à cozinha %, não à cozinha da contagem (%)',
        v_item.lot_id, v_item.kitchen_id, v_count.kitchen_id;
    end if;

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

-- (5) baixa valida a posse do lote (cozinha + ingrediente)
create or replace function inventory.register_production_issue(
  p_task_id uuid,
  p_movements jsonb,
  p_user uuid
) returns table (movements int)
language plpgsql as $$
declare
  v_count int := 0;
  v_move record;
  v_lot inventory.stock_lot%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 42));

  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'production_issue'
  ) then
    raise exception 'Esta tarefa já teve baixa de estoque registrada';
  end if;

  for v_move in
    select * from jsonb_to_recordset(p_movements) as x(
      kitchen_id bigint,
      ingredient_id uuid,
      lot_id uuid,
      quantity numeric,
      justification text
    )
  loop
    if v_move.lot_id is not null then
      select * into v_lot from inventory.stock_lot where id = v_move.lot_id;
      if not found then raise exception 'Lote % não encontrado', v_move.lot_id; end if;
      if v_lot.kitchen_id <> v_move.kitchen_id or v_lot.ingredient_id is distinct from v_move.ingredient_id then
        raise exception 'Lote % não pertence à cozinha/ingrediente do movimento (override inválido)', v_move.lot_id;
      end if;
    end if;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
    values
      (v_move.kitchen_id, v_move.ingredient_id, v_move.lot_id, 'production_issue',
       v_move.quantity, v_move.justification, p_task_id, p_user);
    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$$;

-- (6) sobra idempotente: reusa o lote em retry
create or replace function inventory.register_leftover(
  p_kitchen_id bigint,
  p_frozen_preparation_id uuid,
  p_lot_code text,
  p_expiry_date date,
  p_quantity numeric,
  p_task_id uuid,
  p_discard boolean,
  p_reason text,
  p_user uuid
) returns table (lot_id uuid)
language plpgsql as $$
declare
  v_lot_id uuid;
begin
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
    where kitchen_id = p_kitchen_id
      and frozen_preparation_id = p_frozen_preparation_id
      and lot_code = p_lot_code
      and expiry_date is not distinct from p_expiry_date
    limit 1;
  if v_lot_id is null then
    insert into inventory.stock_lot (kitchen_id, frozen_preparation_id, lot_code, expiry_date)
      values (p_kitchen_id, p_frozen_preparation_id, p_lot_code, p_expiry_date)
      returning id into v_lot_id;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, production_task_id, created_by)
  values
    (p_kitchen_id, p_frozen_preparation_id, v_lot_id, 'leftover_return', p_quantity, 0, p_task_id, p_user);

  if p_discard then
    insert into inventory.stock_movement
      (kitchen_id, frozen_preparation_id, lot_id, type, quantity, justification, production_task_id, created_by)
    values
      (p_kitchen_id, p_frozen_preparation_id, v_lot_id, 'waste', p_quantity, btrim(p_reason), p_task_id, p_user);
  end if;

  return query select v_lot_id;
end;
$$;
