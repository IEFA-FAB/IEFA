-- ============================================================================
-- Contagem e ajuste pegam as travas na MESMA ordem
-- ============================================================================
--
-- A 20260918160200 fez `post_stock_adjustment` pegar uma trava consultiva por
-- (cozinha, autor) antes de travar os lotes. `confirm_inventory_count` travava
-- os lotes primeiro e só depois, no post do ajuste derivado, pedia a mesma
-- trava. Ordem inversa nos dois caminhos é deadlock: operador X lançando ajuste
-- num lote enquanto alguém confirma uma contagem que X abriu sobre o mesmo lote.
--
-- Agora a confirmação pega a trava do autor logo depois de travar a contagem e
-- antes dos lotes. A trava consultiva é reentrante na mesma transação, então o
-- post derivado a reobtém sem esperar.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.confirm_inventory_count(p_count_id uuid, p_user uuid)
 RETURNS TABLE(adjustments integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_item record;
  v_balance numeric(14,4);
  v_adjustment_id uuid;
  v_adjustments int := 0;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  -- Mesma ordem de aquisição do `post_stock_adjustment`: trava consultiva do
  -- autor ANTES dos lotes. Esta função travava os lotes primeiro e só depois,
  -- dentro do post do ajuste derivado, pedia a trava do autor — o post comum
  -- faz o inverso. Ajuste e confirmação de contagem sobre o mesmo lote, do
  -- mesmo autor, se esperavam em cruz e o Postgres matava um dos dois.
  perform pg_advisory_xact_lock(
    hashtextextended('adjustment_threshold:' || v_count.kitchen_id || ':' || coalesce(v_count.created_by::text, '-'), 42)
  );
  if v_count.status <> 'draft' then raise exception 'Contagem já confirmada'; end if;

  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id, 'Contagem física ' || p_count_id, v_count.created_by, now())
    returning id into v_adjustment_id;

  for v_item in
    select ci.lot_id, ci.counted_qty, l.kitchen_id, l.ingredient_id, l.frozen_preparation_id, l.lot_code
      from inventory.inventory_count_item ci
      join inventory.stock_lot l on l.id = ci.lot_id
      where ci.count_id = p_count_id
      for update of l
  loop
    if v_item.kitchen_id <> v_count.kitchen_id then
      raise exception 'Lote % pertence à cozinha %, não à cozinha da contagem (%)',
        v_item.lot_id, v_item.kitchen_id, v_count.kitchen_id;
    end if;

    select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then quantity else -quantity end), 0)
      into v_balance
      from inventory.stock_movement
      where lot_id = v_item.lot_id;

    update inventory.inventory_count_item
      set ledger_qty = v_balance
      where count_id = p_count_id and lot_id = v_item.lot_id;

    if v_item.counted_qty <> v_balance then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note, evidence_kind, evidence_reference)
      values
        (v_adjustment_id, v_item.lot_id,
         case when v_item.counted_qty > v_balance then 'in' else 'out' end,
         abs(v_item.counted_qty - v_balance),
         case when v_item.counted_qty > v_balance then 'count_gain' else 'count_loss' end,
         'Contagem física ' || p_count_id, 'report', p_count_id::text);
      v_adjustments := v_adjustments + 1;
    end if;
  end loop;

  if v_adjustments > 0 then
    -- a contagem é o ato de aprovação: quem confirma responde por ela
    perform inventory.post_stock_adjustment(v_adjustment_id, p_user, 'Ajuste derivado da contagem física confirmada');
  else
    update inventory.stock_adjustment set status = 'rejected', decided_by = p_user, decided_at = now(),
      rejection_reason = 'Contagem sem divergência — nenhum ajuste necessário'
      where id = v_adjustment_id;
  end if;

  update inventory.inventory_count
    set status = 'confirmed', confirmed_by = p_user, confirmed_at = now()
    where id = p_count_id;

  return query select v_adjustments;
end;
$function$;
