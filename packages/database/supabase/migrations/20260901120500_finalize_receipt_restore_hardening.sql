-- ============================================================================
-- finalize_goods_receipt: restaura o endurecimento que 20260901120200 apagou
-- ============================================================================
-- A migration dos lotes reescreveu a função a partir do corpo ORIGINAL
-- (20260729170000) e, com isso, desfez em silêncio as duas guardas que
-- 20260730120000 tinha acrescentado:
--
--   1. `definitive_at is not null` — efetivação é ÚNICA. Sem ela, um
--      recebimento que termina em `divergent` (o caso comum: quantidade a
--      menor com motivo) volta a satisfazer o gate `status in ('provisional',
--      'divergent')` e pode ser efetivado DE NOVO — lotes e movimentos em
--      dobro num ledger append-only, que só se corrige com ajuste manual.
--   2. OF da MESMA cozinha do recebimento — sem ela, uma OF de outra cozinha
--      fecha como recebida a partir de um recebimento que não é dela.
--
-- É o modo de falha clássico do `create or replace`: quem escreve parte da
-- migration que CRIOU a função, não da que está em produção. Só o teste de
-- integração pega — e pegou (`receiving.operations.test.ts` esperava
-- /já efetivado/ e recebeu a mensagem do gate de status).
--
-- Regra para a próxima: antes de `create or replace function`, ler a definição
-- VIGENTE (`pg_get_functiondef`), não a migration de origem.
-- ============================================================================

create or replace function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
returns table (movements int)
language plpgsql
set search_path = '' as $$
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
begin
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

comment on function inventory.finalize_goods_receipt(uuid, uuid) is
  'Efetivação atômica do recebimento definitivo: um stock_lot + um stock_movement por LOTE recebido. Recusa efetivar duas vezes (definitive_at), recusa OF de outra cozinha, e recusa quando a soma dos lotes não fecha com a quantidade conferida.';
