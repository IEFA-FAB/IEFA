-- ============================================================================
-- Conferência do recebimento: o total e os lotes da linha saem dos eventos,
-- sob trava, num lugar só
-- ============================================================================
--
-- A tela de conferência por leitura (Fase 3C) registrava cada leitura como
-- evento, mas a linha era recalculada no servidor por ler-somar-gravar sem
-- trava — duas leituras simultâneas podiam gravar um total velho —, e nada
-- mantinha os LOTES da linha: a importação da nota cria um lote com a quantidade
-- faturada, a leitura mudava só a quantidade conferida, e toda entrega a menor
-- travava a efetivação com "Soma dos lotes difere da quantidade conferida". O
-- lote e a validade de uma etiqueta GS1 lida nunca chegavam à tabela de lotes.
--
-- Agora `sync_receipt_line` é o único que escreve `received_qty_base` a partir
-- dos eventos, com a linha travada:
--
--   • total = último OVERRIDE vivo + leituras vivas DEPOIS dele. Override é o
--     operador dizendo o total da linha — `typed` (edição da linha),
--     `manual_confirm` (linha sem código) e `refusal` (recusa, total zero). Sem
--     override, soma das leituras (`scanner`, `camera`, `bulk_confirm`). A regra
--     anterior deixava o `typed` vencer até leitura feita DEPOIS dele;
--   • sem evento vivo nenhum, a linha volta ao que a importação disse (o
--     faturado) — desfazer a única leitura não pode deixar a linha em zero;
--   • lotes: cada lote lido numa etiqueta GS1 recebe a soma das leituras dele;
--     o resto do total vai para o lote que NÃO veio de leitura, quando há um só
--     (o da nota, ou um "SEM-LOTE" criado aqui). Com mais de um lote manual,
--     a distribuição é do operador, e a efetivação diz se não fechar;
--   • recusa: a linha só segue recusada enquanto o evento de recusa estiver
--     vivo; desfeito (ou superado por um total informado), o motivo "Recusado:"
--     sai da linha.
--
-- `receipt_scan_event` tem 0 linhas em produção: a semântica muda sem dado a
-- migrar.
-- ============================================================================

alter table inventory.receipt_scan_event drop constraint receipt_scan_event_method_check;
alter table inventory.receipt_scan_event add constraint receipt_scan_event_method_check
  check (method in ('scanner', 'camera', 'manual_confirm', 'typed', 'bulk_confirm', 'reversal', 'refusal'));

-- Eventos VIVOS de uma linha: tudo menos os estornos e o que foi estornado.
create function inventory.receipt_line_live_events(p_receipt_item_id uuid)
returns table (seq bigint, method text, quantity_base numeric, lot_code text, expiry_date date)
language sql stable as $$
  select e.seq, e.method, e.quantity_base, e.lot_code, e.expiry_date
    from inventory.receipt_scan_event e
   where e.receipt_item_id = p_receipt_item_id
     and e.method <> 'reversal'
     and not exists (select 1 from inventory.receipt_scan_event r where r.reversed_event_id = e.id);
$$;

create function inventory.sync_receipt_line(p_receipt_item_id uuid)
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
  v_other_count int;
  v_other_id uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- Ordem de trava: RECEBIMENTO antes da LINHA — a mesma da efetivação
  -- (`finalize_goods_receipt` trava o recebimento e toca as linhas pela FK dos
  -- lotes). Na ordem inversa, conferir e efetivar ao mesmo tempo dava deadlock.
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
       where l.method in ('scanner', 'camera', 'bulk_confirm')
         and l.seq > coalesce(v_override.seq, 0)
    ), 0);
  end if;

  -- ── lotes lidos: cada código recebe a soma das leituras que CONTAM ─────────
  -- (as depois do último override; as de antes foram superadas pelo total informado)
  for v_lot in
    select l.lot_code, max(l.expiry_date) as expiry_date, sum(l.quantity_base) as quantity
      from inventory.receipt_line_live_events(p_receipt_item_id) l
     where l.lot_code is not null and btrim(l.lot_code) <> ''
       and l.method in ('scanner', 'camera')
       and l.seq > coalesce(v_override.seq, 0)
     group by l.lot_code
  loop
    insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
      values (p_receipt_item_id, v_lot.lot_code, v_lot.expiry_date, v_lot.quantity, v_item.unit_cost)
    on conflict (receipt_item_id, lot_code) do update
      set quantity_base = excluded.quantity_base,
          expiry_date = coalesce(excluded.expiry_date, inventory.goods_receipt_item_lot.expiry_date);
    v_scanned := v_scanned + v_lot.quantity;
  end loop;

  -- lote que veio de leitura e não conta mais (leitura desfeita, total informado depois) sai
  delete from inventory.goods_receipt_item_lot gl
   where gl.receipt_item_id = p_receipt_item_id
     and gl.lot_code in (
       select e.lot_code from inventory.receipt_scan_event e
        where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null
     )
     and not exists (
       select 1 from inventory.receipt_line_live_events(p_receipt_item_id) l
        where l.lot_code = gl.lot_code and l.method in ('scanner', 'camera') and l.seq > coalesce(v_override.seq, 0)
     );

  -- ── o resto do total vai para o lote que não veio de leitura ───────────────
  v_residual := greatest(v_total - v_scanned, 0);
  select count(*), min(gl.id::text)::uuid into v_other_count, v_other_id
    from inventory.goods_receipt_item_lot gl
   where gl.receipt_item_id = p_receipt_item_id
     and gl.lot_code not in (
       select e.lot_code from inventory.receipt_scan_event e
        where e.receipt_item_id = p_receipt_item_id and e.lot_code is not null
     );

  if v_other_count = 0 then
    if v_residual > 0 then
      insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, quantity_base, unit_cost)
        values (p_receipt_item_id, 'SEM-LOTE-' || to_char(v_today, 'YYYY-MM-DD'), v_residual, v_item.unit_cost)
      on conflict (receipt_item_id, lot_code) do update set quantity_base = excluded.quantity_base;
    end if;
  elsif v_other_count = 1 then
    if v_residual > 0 then
      update inventory.goods_receipt_item_lot set quantity_base = v_residual where id = v_other_id;
    else
      delete from inventory.goods_receipt_item_lot where id = v_other_id;
    end if;
  end if;
  -- mais de um lote manual: a distribuição é do operador

  update inventory.goods_receipt_item
     set received_qty_base = v_total,
         -- a recusa só vale enquanto o evento dela estiver vivo e for o último override
         divergence_reason = case
           when coalesce(v_override.method, '') <> 'refusal' and divergence_reason like 'Recusado:%' then null
           else divergence_reason
         end
   where id = p_receipt_item_id;

  return v_total;
end;
$$;

comment on function inventory.sync_receipt_line is
  'Único escritor de received_qty_base a partir dos eventos de conferência, com recebimento e linha travados (nessa ordem): total = último override (typed/manual_confirm/refusal) + leituras depois dele; mantém os lotes lidos e o lote residual coerentes com o total.';
