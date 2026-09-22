-- ============================================================================
-- Conferência do recebimento: `sync_receipt_line` sem DELETE sem WHERE
-- ============================================================================
--
-- A função limpava a tabela temporária com `delete from pg_temp.counted_lot;`.
-- Pelo PostgREST o papel `authenticator` carrega `session_preload_libraries =
-- safeupdate`, que recusa DELETE sem WHERE — e toda chamada de
-- `record_receipt_event`/`bulk_confirm_receipt` passa por aqui. Resultado: pelo
-- app NENHUMA conferência gravava ("DELETE requires a WHERE clause"): leitura,
-- total informado, confirmar à mão, aceitar conforme faturado. A suíte de
-- integração conecta direto no Postgres, sem o safeupdate, e passava.
--
-- Corpo idêntico ao de 20260921180000, só com `where true` no DELETE.
-- ============================================================================

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
  delete from pg_temp.counted_lot where true; -- safeupdate: ver cabeçalho
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

  -- ── arredondamento: a soma dos lotes lidos acompanha o total ajustado ──────
  -- 3 caixas de 3,3333 dão total 10 (ajustado ao faturado) e lotes lidos com
  -- 9,9999: o 0,0001 ia para outro lote e virava estoque sem validade. A
  -- diferença de arredondamento vai para o maior lote lido.
  v_residual := v_total - v_scanned;
  if v_residual <> 0 and abs(v_residual) < 0.001 and v_scanned > 0 then
    update inventory.goods_receipt_item_lot
       set quantity_base = quantity_base + v_residual
     where id = (
       select gl.id from inventory.goods_receipt_item_lot gl
         join pg_temp.counted_lot c on c.lot_code = gl.lot_code
        where gl.receipt_item_id = p_receipt_item_id
        order by c.quantity desc, gl.lot_code
        limit 1);
    v_residual := 0;
  end if;
  v_residual := greatest(v_residual, 0);

  -- ── o resíduo vai para o ÚNICO lote de destino ─────────────────────────────
  -- Destino é lote que não veio de leitura, mais o da nota enquanto nenhuma
  -- leitura o conta. Com um só, ele recebe o resíduo. Com dois ou mais — o
  -- operador dividiu a entrega entre lotes (nota L1 = 100 virou L1 60 + L2 40)
  -- — a distribuição é dele: jogar o resíduo inteiro no lote da nota refazia
  -- L1 = 100 e a soma dos lotes passava de 140, travando a efetivação.
  --
  -- O "SEM-LOTE-<data>" que ESTA função cria não é divisão do operador: é
  -- onde o resíduo mora quando não há lote de verdade. Contado como destino,
  -- ele e o lote da nota davam dois, e o resíduo não ia a lugar nenhum mais
  -- (20260921180000). Ele só recebe o resíduo quando não há outro destino, e é
  -- zerado quando passa a haver.
  select count(*), min(gl.id::text)::uuid into v_manual_count, v_target
    from inventory.goods_receipt_item_lot gl
   where gl.receipt_item_id = p_receipt_item_id
     and gl.lot_code not in (select lot_code from pg_temp.counted_lot)
     and gl.lot_code not like 'SEM-LOTE-%'
     and (gl.lot_code = v_invoice_lot
          or gl.lot_code not in (select e.lot_code from inventory.receipt_scan_event e
                                  where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null));
  if v_manual_count > 1 then
    v_target := null;
  else
    if v_manual_count = 0 then
      -- sem lote de verdade: o SEM-LOTE do sistema, se já existe
      select gl.id into v_target
        from inventory.goods_receipt_item_lot gl
       where gl.receipt_item_id = p_receipt_item_id and gl.lot_code like 'SEM-LOTE-%'
       order by gl.lot_code desc
       limit 1;
    end if;
    -- os demais SEM-LOTE do sistema não guardam resíduo nenhum
    update inventory.goods_receipt_item_lot gl
       set quantity_base = 0
     where gl.receipt_item_id = p_receipt_item_id
       and gl.lot_code like 'SEM-LOTE-%'
       and gl.id is distinct from v_target
       and gl.quantity_base <> 0;
    if v_target is null and v_residual > 0 then
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
