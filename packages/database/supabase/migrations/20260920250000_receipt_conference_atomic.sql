-- ============================================================================
-- Conferência do recebimento: escrita atômica, lote da nota preservado,
-- tolerância de arredondamento e motivo checado sob a trava da efetivação
-- ============================================================================
--
-- Segunda revisão de 20260920240000. O que ela deixou:
--
--  1. O LOTE DA NOTA era apagado quando a sobra da linha chegava a zero
--     (recusa, leitura GS1 da quantidade inteira) e recriado depois como
--     "SEM-LOTE-<data>", sem o código nem a validade da nota — o estoque entrava
--     sem validade e o FEFO e os alertas de vencimento não o viam. Agora o lote
--     pode ficar com ZERO: a linha continua lá, com código, validade e a
--     temperatura registrada, e a efetivação só não o transforma em estoque.
--     O resíduo da linha vai, nesta ordem, para o lote com o código da nota;
--     para o único lote que não veio de leitura; para um "SEM-LOTE" novo.
--  2. Gravar o evento e recalcular a linha eram duas transações: se o recálculo
--     falhasse, o reenvio caía no "já registrada" e a linha ficava para sempre
--     sem aquela leitura. `record_receipt_event` grava e recalcula de uma vez.
--  3. Leituras de caixas fracionadas (10 KG em 3 caixas de 3,3333) somavam
--     9,9999 e a efetivação exigia motivo de divergência de uma entrega
--     completa. O total que fica a menos de 0,001 do faturado é o faturado.
--  4. "Aceitar conforme faturado" decidia fora de trava quais linhas ninguém
--     tinha tocado; agora decide linha a linha, com a linha travada.
--  5. A checagem de "divergência sem motivo" rodava no servidor, fora da trava
--     da efetivação; foi para dentro de `finalize_goods_receipt`.
--  6. Motivo antigo não saía: a linha que voltava a bater com a nota ficava com
--     o motivo da falta (e o recebimento, `divergent`). E a leitura feita DEPOIS
--     de uma recusa deixava a linha "Recusado:" entrando no estoque.
--  7. Índice em `receipt_scan_event(receipt_item_id, seq)`: o recálculo lia a
--     tabela inteira várias vezes, com a linha travada.
-- ============================================================================

create index if not exists receipt_scan_event_item_idx on inventory.receipt_scan_event (receipt_item_id, seq);

alter table inventory.goods_receipt_item_lot drop constraint goods_receipt_item_lot_quantity_base_check;
alter table inventory.goods_receipt_item_lot add constraint goods_receipt_item_lot_quantity_base_check check (quantity_base >= 0);

create or replace function inventory.sync_receipt_line(p_receipt_item_id uuid)
returns numeric
language plpgsql as $$
declare
  v_item inventory.goods_receipt_item%rowtype;
  v_receipt inventory.goods_receipt%rowtype;
  v_override record;
  v_total numeric(14, 4);
  v_has_live boolean;
  v_scanned numeric(14, 4) := 0;
  v_residual numeric(14, 4);
  v_lot record;
  v_invoice_lot text;
  v_invoice_expiry date;
  v_target uuid;
  v_manual_count int;
  v_refused boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- recebimento antes da linha: a ordem de `finalize_goods_receipt`
  select r.* into v_receipt
    from inventory.goods_receipt r
    join inventory.goods_receipt_item i on i.receipt_id = r.id
   where i.id = p_receipt_item_id
   for share of r;
  if not found then raise exception 'Linha do recebimento não encontrada'; end if;
  if v_receipt.definitive_at is not null or v_receipt.status not in ('draft', 'provisional') then
    raise exception 'Recebimento em "%" não aceita conferência', v_receipt.status;
  end if;
  select * into v_item from inventory.goods_receipt_item where id = p_receipt_item_id for update;

  select exists (select 1 from inventory.receipt_line_live_events(p_receipt_item_id)) into v_has_live;
  select l.seq, l.method, l.quantity_base into v_override
    from inventory.receipt_line_live_events(p_receipt_item_id) l
   where l.method in ('typed', 'manual_confirm', 'refusal')
   order by l.seq desc limit 1;

  if not v_has_live then
    v_total := coalesce(v_item.invoiced_qty_base, 0);
  else
    v_total := coalesce(v_override.quantity_base, 0) + coalesce((
      select sum(l.quantity_base) from inventory.receipt_line_live_events(p_receipt_item_id) l
       where l.method in ('scanner', 'camera', 'bulk_confirm') and l.seq > coalesce(v_override.seq, 0)
    ), 0);
  end if;
  -- caixas fracionadas somam 9,9999 para 10: a menos de 0,001 do faturado, é o faturado
  if v_item.invoiced_qty_base is not null and abs(v_total - v_item.invoiced_qty_base) < 0.001 then
    v_total := v_item.invoiced_qty_base;
  end if;

  -- recusa viva = último override é a recusa E nada foi contado depois dela
  v_refused := coalesce(v_override.method, '') = 'refusal' and not exists (
    select 1 from inventory.receipt_line_live_events(p_receipt_item_id) l
     where l.method in ('scanner', 'camera', 'bulk_confirm') and l.seq > v_override.seq
  );

  -- lote da nota: é o destino natural do resíduo, e nunca se apaga
  if v_item.nfe_item_id is not null then
    select nullif(btrim(ni.lot_code), ''), ni.expiry_date into v_invoice_lot, v_invoice_expiry
      from inventory.nfe_item ni where ni.id = v_item.nfe_item_id;
  end if;

  -- ── lotes lidos que CONTAM: soma das leituras de cada código ───────────────
  create temporary table if not exists pg_temp.counted_lot (lot_code text primary key, quantity numeric) on commit drop;
  delete from pg_temp.counted_lot;
  insert into pg_temp.counted_lot
    select l.lot_code, sum(l.quantity_base)
      from inventory.receipt_line_live_events(p_receipt_item_id) l
     where l.lot_code is not null and btrim(l.lot_code) <> ''
       and l.method in ('scanner', 'camera') and l.seq > coalesce(v_override.seq, 0)
     group by l.lot_code;

  for v_lot in
    select c.lot_code, c.quantity,
           (select max(l.expiry_date) from inventory.receipt_line_live_events(p_receipt_item_id) l where l.lot_code = c.lot_code) as expiry_date
      from pg_temp.counted_lot c
  loop
    insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
      values (p_receipt_item_id, v_lot.lot_code, v_lot.expiry_date, v_lot.quantity, v_item.unit_cost)
    on conflict (receipt_item_id, lot_code) do update
      set quantity_base = excluded.quantity_base,
          expiry_date = coalesce(excluded.expiry_date, inventory.goods_receipt_item_lot.expiry_date);
    v_scanned := v_scanned + v_lot.quantity;
  end loop;

  -- lote que veio de leitura e não conta mais: ZERA (fica como registro), exceto
  -- o da nota, que é o destino do resíduo logo abaixo
  update inventory.goods_receipt_item_lot gl
     set quantity_base = 0
   where gl.receipt_item_id = p_receipt_item_id
     and gl.lot_code is distinct from v_invoice_lot
     and gl.lot_code in (select e.lot_code from inventory.receipt_scan_event e where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null)
     and gl.lot_code not in (select lot_code from pg_temp.counted_lot);

  -- ── o resíduo: lote da nota → único lote manual → SEM-LOTE novo ────────────
  v_residual := greatest(v_total - v_scanned, 0);
  select gl.id into v_target
    from inventory.goods_receipt_item_lot gl
   where gl.receipt_item_id = p_receipt_item_id
     and v_invoice_lot is not null and gl.lot_code = v_invoice_lot
     and gl.lot_code not in (select lot_code from pg_temp.counted_lot);
  if v_target is null then
    select count(*) into v_manual_count
      from inventory.goods_receipt_item_lot gl
     where gl.receipt_item_id = p_receipt_item_id
       and gl.lot_code not in (select e.lot_code from inventory.receipt_scan_event e where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null);
    if v_manual_count = 1 then
      select gl.id into v_target
        from inventory.goods_receipt_item_lot gl
       where gl.receipt_item_id = p_receipt_item_id
         and gl.lot_code not in (select e.lot_code from inventory.receipt_scan_event e where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null);
    elsif v_manual_count = 0 and v_residual > 0 then
      insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
        values (p_receipt_item_id,
                -- o código da nota, se ele não é o de um lote lido agora — senão o
                -- resíduo sobrescreveria a quantidade lida daquele lote
                case when v_invoice_lot is not null and v_invoice_lot not in (select lot_code from pg_temp.counted_lot)
                     then v_invoice_lot else 'SEM-LOTE-' || to_char(v_today, 'YYYY-MM-DD') end,
                case when v_invoice_lot is not null and v_invoice_lot not in (select lot_code from pg_temp.counted_lot)
                     then v_invoice_expiry end,
                v_residual, v_item.unit_cost)
      on conflict (receipt_item_id, lot_code) do update set quantity_base = excluded.quantity_base
      returning id into v_target;
    end if;
    -- dois ou mais lotes manuais: a distribuição é do operador
  end if;
  if v_target is not null then
    update inventory.goods_receipt_item_lot set quantity_base = v_residual where id = v_target;
  end if;

  update inventory.goods_receipt_item
     set received_qty_base = v_total,
         divergence_reason = case
           -- recusa superada (desfeita, total informado ou leitura depois dela)
           when not v_refused and divergence_reason like 'Recusado:%' then null
           -- linha que voltou a bater com a nota não guarda motivo de divergência
           when not v_refused and invoiced_qty_base is not null and v_total = invoiced_qty_base then null
           else divergence_reason
         end
   where id = p_receipt_item_id;

  return v_total;
end;
$$;

/**
 * Grava UM evento de conferência e recalcula a linha na mesma transação.
 *
 * Idempotente pelo `client_event_id` (e pelo estorno único): o reenvio é
 * reconhecido como duplicado e, mesmo assim, a linha é recalculada — o recálculo
 * que falhou da primeira vez não deixa a leitura fora do total.
 */
create function inventory.record_receipt_event(
  p_receipt_id uuid,
  p_receipt_item_id uuid,
  p_client_event_id text,
  p_method text,
  p_quantity numeric,
  p_user uuid,
  p_raw_code text default null,
  p_gtin text default null,
  p_lot_code text default null,
  p_expiry_date date default null,
  p_package_factor numeric default null,
  p_reversed_event_id uuid default null
) returns table (duplicate boolean, event_id uuid, total numeric)
language plpgsql as $$
declare
  v_item_receipt uuid;
  v_id uuid;
begin
  -- mesma ordem de trava de `sync_receipt_line`: recebimento, depois linha
  perform 1 from inventory.goods_receipt where id = p_receipt_id for share;
  select receipt_id into v_item_receipt from inventory.goods_receipt_item where id = p_receipt_item_id for update;
  if v_item_receipt is distinct from p_receipt_id then
    raise exception 'A linha não pertence a este recebimento';
  end if;
  if p_reversed_event_id is not null and not exists (
    select 1 from inventory.receipt_scan_event
     where id = p_reversed_event_id and receipt_item_id = p_receipt_item_id and method <> 'reversal'
  ) then
    raise exception 'Leitura a desfazer não encontrada nesta linha';
  end if;

  insert into inventory.receipt_scan_event
    (receipt_id, receipt_item_id, client_event_id, method, quantity_base, raw_code, gtin, lot_code, expiry_date,
     package_factor, reversed_event_id, created_by)
  values
    (p_receipt_id, p_receipt_item_id, p_client_event_id, p_method, p_quantity, p_raw_code, p_gtin, p_lot_code, p_expiry_date,
     p_package_factor, p_reversed_event_id, p_user)
  on conflict do nothing
  returning id into v_id;

  return query select v_id is null, v_id, inventory.sync_receipt_line(p_receipt_item_id);
end;
$$;

/**
 * "Aceitar conforme faturado": as linhas SEM evento vivo recebem o faturado.
 * Decide linha a linha, com a linha travada — decidir fora de trava deixava uma
 * leitura que chegasse no meio somar ao faturado.
 */
create function inventory.bulk_confirm_receipt(p_receipt_id uuid, p_client_event_id text, p_user uuid)
returns int
language plpgsql as $$
declare
  v_item record;
  v_count int := 0;
begin
  perform 1 from inventory.goods_receipt where id = p_receipt_id for share;
  for v_item in
    select id, invoiced_qty_base from inventory.goods_receipt_item
     where receipt_id = p_receipt_id and invoiced_qty_base is not null
     order by id
     for update
  loop
    continue when exists (select 1 from inventory.receipt_line_live_events(v_item.id));
    perform 1 from inventory.record_receipt_event(
      p_receipt_id, v_item.id, p_client_event_id || '-' || v_item.id::text, 'bulk_confirm', v_item.invoiced_qty_base, p_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

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
  v_unexplained text;
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

  -- (20260920250000) Linha que difere da nota sem motivo não efetiva — e a
  -- checagem mora AQUI, depois da trava do recebimento: no servidor, antes da
  -- RPC, uma leitura que chegasse no meio passava uma falta sem motivo como
  -- `definitive`. A tolerância é a mesma do recálculo da linha (0,001).
  select string_agg(coalesce(i.description, gri.id::text), ', ' order by i.description)
    into v_unexplained
    from inventory.goods_receipt_item gri
    left join kitchen.ingredient i on i.id = gri.ingredient_id
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and abs(gri.invoiced_qty_base - gri.received_qty_base) >= 0.001
     and nullif(btrim(coalesce(gri.divergence_reason, '')), '') is null;
  if v_unexplained is not null then
    raise exception 'Linha(s) diferem da nota sem motivo registrado (%) — informe o motivo da divergência antes de efetivar', v_unexplained;
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
      -- lote zerado pela conferência (recusa, leitura desfeita) fica como
      -- registro — com código, validade e temperatura —, mas não vira estoque
      select * from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id and quantity_base > 0
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
