-- ============================================================================
-- Fase 5 (estoque): baixa por produção e sobra — efetivação ATÔMICA no banco
-- ============================================================================
-- Review Greptile do PR de baixa:
--  • confirmações concorrentes da mesma tarefa dobravam a baixa (check + insert
--    sem lock em requests separados) → advisory xact lock por tarefa + recheck
--    dentro da transação;
--  • sobra criava lote e movimentos em requests separados (lote órfão em falha
--    parcial; retry duplicava) → função única.
-- ============================================================================

create function inventory.register_production_issue(
  p_task_id uuid,
  p_movements jsonb,
  p_user uuid
) returns table (movements int)
language plpgsql as $$
declare
  v_count int := 0;
  v_move record;
begin
  -- serializa confirmações da MESMA tarefa (lock morre no fim da transação)
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

create function inventory.register_leftover(
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

  insert into inventory.stock_lot (kitchen_id, frozen_preparation_id, lot_code, expiry_date)
    values (p_kitchen_id, p_frozen_preparation_id, p_lot_code, p_expiry_date)
    returning id into v_lot_id;

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
