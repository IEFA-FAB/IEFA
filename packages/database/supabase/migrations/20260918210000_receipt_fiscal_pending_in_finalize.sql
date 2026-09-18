-- ============================================================================
-- Pendência fiscal gravada na efetivação, não depois dela
-- ============================================================================
-- `finalizeReceiptFn` efetivava pela RPC e SÓ DEPOIS, num segundo comando,
-- calculava a falta contra o faturado e gravava `fiscal_pending`. Entre os dois
-- o recebimento ficava efetivado e sem pendência — liquidável — e o erro do
-- segundo comando (e o da leitura dos itens) era descartado: uma falha ali
-- deixava a entrega a menor paga como se tivesse chegado inteira.
--
-- Agora a conta roda dentro de `finalize_goods_receipt`, sob o mesmo `for
-- update` do recebimento. Assinatura e retorno não mudam; o servidor lê o
-- valor gravado em vez de recalcular.
--
-- Compatível com a main anterior: ela ainda regrava o mesmo valor depois da
-- RPC, o que é idempotente.
-- ============================================================================

create or replace function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
 RETURNS TABLE(movements integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot record;
  v_lot_id uuid;
  v_movements int := 0;
  v_has_divergence boolean;
  v_lot_total numeric(14,4);
  v_conservation text;
  v_fallback_seq int;
  v_of_kitchen bigint;
  v_shortfall numeric(14,2);
begin
  perform set_config('inventory.via_rpc', 'on', true);
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;

  -- (20260730120000, guarda 1) Efetivação é única. Precede o gate de status:
  -- o recebimento divergente sai da efetivação com status que o gate aceita.
  if v_receipt.definitive_at is not null then
    raise exception 'Recebimento já efetivado em % — efetivação é única', v_receipt.definitive_at;
  end if;

  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;

  -- (20260730120000, guarda 2) A OF tem de ser da cozinha do recebimento.
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

    -- A soma dos lotes tem de fechar com a quantidade conferida. A checagem é
    -- AQUI e não numa constraint: durante a conferência a soma fica
    -- legitimamente parcial enquanto o operador digita, e uma constraint
    -- rejeitaria o primeiro lote de uma entrega de três.
    select coalesce(sum(quantity_base), 0) into v_lot_total
      from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id;

    if v_lot_total = 0 then
      -- Nenhum lote informado: sintético com a quantidade inteira. Sufixo
      -- numérico porque duas linhas sem código na mesma entrega colidiriam no
      -- unique (receipt_item_id, lot_code) do mesmo dia.
      select count(*) + 1 into v_fallback_seq
        from inventory.goods_receipt_item_lot l
        join inventory.goods_receipt_item i on i.id = l.receipt_item_id
       where i.receipt_id = p_receipt_id and l.lot_code like 'SEM-LOTE-%';

      insert into inventory.goods_receipt_item_lot
        (receipt_item_id, lot_code, quantity_base, unit_cost)
      values
        (v_item.id, 'SEM-LOTE-' || to_char(now(), 'YYYY-MM-DD') || '-' || v_fallback_seq,
         v_item.received_qty_base, v_item.unit_cost);
    elsif v_lot_total <> v_item.received_qty_base then
      raise exception 'Soma dos lotes (%) difere da quantidade conferida (%) no item %',
        v_lot_total, v_item.received_qty_base, v_item.id;
    end if;

    -- Classe de conservação exigida pela especificação de compra da linha;
    -- sem purchase_item na linha, cai na especificação padrão do item.
    select pi.conservation_class into v_conservation
      from procurement.purchase_item pi
     where pi.id = v_item.purchase_item_id;

    if v_conservation is null and v_item.ingredient_id is not null then
      select pi.conservation_class into v_conservation
        from procurement.purchase_item_ingredient pii
        join procurement.purchase_item pi on pi.id = pii.purchase_item_id
       where pii.ingredient_id = v_item.ingredient_id and pii.is_default
         and pi.deleted_at is null
       limit 1;
    end if;

    for v_lot in
      select * from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id
    loop
      insert into inventory.stock_lot
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date,
         unit_cost, goods_receipt_item_id, goods_receipt_item_lot_id, conservation_class)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id,
         v_lot.lot_code, v_lot.expiry_date, coalesce(v_lot.unit_cost, v_item.unit_cost),
         v_item.id, v_lot.id, v_conservation)
      returning id into v_lot_id;

      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity,
         unit_cost, goods_receipt_item_id, created_by)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_lot_id,
         'receipt', v_lot.quantity_base, coalesce(v_lot.unit_cost, v_item.unit_cost, 0),
         v_item.id, p_user);

      v_movements := v_movements + 1;
    end loop;
  end loop;

  -- Divergência nasce da linha do item OU do lote (temperatura fora da faixa).
  select exists (
    select 1 from inventory.goods_receipt_item gri
    left join inventory.goods_receipt_item_lot l on l.receipt_item_id = gri.id
    where gri.receipt_id = p_receipt_id
      and (gri.divergence_reason is not null or l.divergence_reason is not null)
  ) into v_has_divergence;

  -- Pendência fiscal NA MESMA TRANSAÇÃO da efetivação. Recebido a MENOR que o
  -- faturado deixa a nota dizendo 100 e o estoque 90; até a devolução, a nota
  -- substituta ou a glosa, o recebimento não é liquidável. Gravada depois, por
  -- um segundo comando do servidor, havia uma janela em que o recebimento já
  -- estava efetivado e ainda sem pendência — liquidável — e um erro nesse
  -- segundo comando era descartado, deixando a janela aberta para sempre.
  -- A conta é a mesma de `fiscalShortfallValue` (sisub-domain): linha sem
  -- quantidade faturada ou sem custo não entra; só a falta, nunca a sobra.
  select round(coalesce(sum((gri.invoiced_qty_base - gri.received_qty_base) * gri.unit_cost), 0), 2)
    into v_shortfall
    from inventory.goods_receipt_item gri
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and gri.unit_cost is not null
     and gri.invoiced_qty_base > gri.received_qty_base;

  update inventory.goods_receipt
    set status = case when v_has_divergence then 'divergent' else 'definitive' end,
        definitive_by = p_user,
        definitive_at = now(),
        fiscal_pending = case when v_shortfall > 0 then true else fiscal_pending end,
        fiscal_pending_value = case when v_shortfall > 0 then v_shortfall else fiscal_pending_value end
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
$function$;
