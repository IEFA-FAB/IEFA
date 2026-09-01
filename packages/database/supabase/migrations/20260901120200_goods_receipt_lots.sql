-- ============================================================================
-- Recebimento: N lotes por item + temperatura medida
-- ============================================================================
-- O grão estava errado por um nível. `inventory.goods_receipt_item` tem UM
-- lot_code e UMA expiry_date, e finalize_goods_receipt cria exatamente um
-- inventory.stock_lot por linha de item. Uma entrega com caixas de validade X
-- e caixas de validade Y não tem como ser representada: o conferente teria
-- que escolher uma validade e mentir, ou duplicar a linha do item e
-- desalinhar a conferência contra a NF-e.
--
-- Isso não é detalhe: validade é o que dirige o FEFO. Colapsar duas validades
-- numa só faz o sistema consumir o lote errado, e é um erro que só aparece
-- quando o alimento vence na prateleira.
--
--   goods_receipt_item      — o que a NOTA diz (item, qtd faturada, qtd recebida)
--     └── goods_receipt_item_lot — o que CHEGOU (lote, validade, qtd, temperatura)
--
-- Também aqui entra a temperatura medida (decisão: registrar, nunca
-- bloquear). Ela desce para o LOTE, não para o item: as caixas congeladas e
-- as resfriadas da mesma entrega podem chegar em condições diferentes.
--
-- Momento: inventory.stock_movement = 0 linhas, goods_receipt = 0, stock_lot
-- = 0. Depois do primeiro recebimento em produção isto vira migração de dado
-- com ledger append-only no meio.
-- ============================================================================

create table inventory.goods_receipt_item_lot (
  id uuid primary key default gen_random_uuid(),
  receipt_item_id uuid not null
    references inventory.goods_receipt_item (id) on delete cascade,

  lot_code text not null check (btrim(lot_code) <> ''),
  expiry_date date,
  quantity_base numeric(14,4) not null check (quantity_base > 0),
  unit_cost numeric(12,4),

  -- Decisão 3: medir é opcional e NUNCA bloqueia. Nulo = não mediram, e isso
  -- é informação diferente de "mediram e estava fora".
  measured_temperature_c numeric(5,2),
  -- Quem aceitou o lote mesmo fora da faixa exigida. Mesmo desenho de
  -- procurement.supply_order.sicaf_status/sicaf_ack_by: registra o alerta e
  -- quem decidiu prosseguir, em vez de travar o fluxo e ser contornado.
  temperature_ack_by uuid references auth.users (id),
  temperature_ack_at timestamptz,

  divergence_reason text,
  created_at timestamptz not null default now(),

  constraint goods_receipt_item_lot_code_key unique (receipt_item_id, lot_code),
  constraint goods_receipt_item_lot_ack_pair
    check ((temperature_ack_by is null) = (temperature_ack_at is null))
);

comment on table inventory.goods_receipt_item_lot is
  'Lote físico dentro de uma linha do recebimento. Uma entrega traz caixas de validades diferentes do mesmo item — e é a validade que dirige o FEFO, então colapsá-las num lote só faz o sistema consumir o lote errado. A soma das quantidades tem de fechar com received_qty_base do item, verificado na efetivação.';
comment on column inventory.goods_receipt_item_lot.measured_temperature_c is
  'Temperatura aferida na entrega. Opcional por decisão: cozinha sem termômetro calibrado deixa nulo, e nulo é honesto. Obrigar produziria número inventado, que é pior que ausência porque parece prova.';
comment on column inventory.goods_receipt_item_lot.temperature_ack_by is
  'Quem aceitou o lote apesar de a temperatura estar fora da faixa exigida pelo item de compra. Sem isto, aceitar fora da faixa não deixa rastro de decisão.';

create index goods_receipt_item_lot_item_idx
  on inventory.goods_receipt_item_lot (receipt_item_id);
create index goods_receipt_item_lot_expiry_idx
  on inventory.goods_receipt_item_lot (expiry_date) where expiry_date is not null;

alter table inventory.goods_receipt_item_lot enable row level security;
create policy goods_receipt_item_lot_read on inventory.goods_receipt_item_lot
  for select to authenticated using (true);
grant select on inventory.goods_receipt_item_lot to authenticated;

-- ----------------------------------------------------------------------------
-- Migração do lote embutido na linha do item
-- ----------------------------------------------------------------------------
-- Zero linhas hoje. O INSERT existe mesmo assim: uma migration que só
-- funciona em base vazia é uma armadilha para quem restaurar um dump.
insert into inventory.goods_receipt_item_lot
  (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
select gri.id,
       coalesce(nullif(btrim(gri.lot_code), ''), 'SEM-LOTE-' || to_char(coalesce(gr.created_at, now()), 'YYYY-MM-DD')),
       gri.expiry_date,
       gri.received_qty_base,
       gri.unit_cost
  from inventory.goods_receipt_item gri
  join inventory.goods_receipt gr on gr.id = gri.receipt_id
 where gri.received_qty_base > 0;

alter table inventory.goods_receipt_item
  drop column lot_code,
  drop column expiry_date;

-- ----------------------------------------------------------------------------
-- Lote de estoque: rastro fino + classe de conservação
-- ----------------------------------------------------------------------------
alter table inventory.stock_lot
  add column goods_receipt_item_lot_id uuid
    references inventory.goods_receipt_item_lot (id) on delete set null,
  -- Copiada do purchase_item na efetivação. Fica DESNORMALIZADA aqui de
  -- propósito: o ledger não deve atravessar o schema procurement para
  -- descobrir se o que ele guarda estraga, e a classe vigente na compra pode
  -- mudar depois sem que o lote já recebido mude de natureza.
  add column conservation_class text
    check (conservation_class in ('seco', 'resfriado', 'congelado', 'climatizado', 'nao_aplicavel'));

comment on column inventory.stock_lot.conservation_class is
  'Classe de conservação vigente na especificação de compra no momento do recebimento. Congelada no lote: o edital pode mudar depois, este lote não muda de natureza.';

create index stock_lot_conservation_idx
  on inventory.stock_lot (kitchen_id, conservation_class)
  where conservation_class is not null;

-- ----------------------------------------------------------------------------
-- Efetivação — agora um stock_lot por LOTE recebido
-- ----------------------------------------------------------------------------
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
begin
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;

  for v_item in
    select * from inventory.goods_receipt_item where receipt_id = p_receipt_id
  loop
    if v_item.received_qty_base <= 0 then continue; end if;

    -- A soma dos lotes tem de fechar com a quantidade conferida. A checagem
    -- é AQUI e não numa constraint: durante a conferência a soma fica
    -- legitimamente parcial enquanto o operador digita, e uma constraint
    -- rejeitaria o primeiro lote de uma entrega de três.
    select coalesce(sum(quantity_base), 0) into v_lot_total
      from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id;

    if v_lot_total = 0 then
      -- Nenhum lote informado: sintético com a quantidade inteira. Sufixo
      -- numérico porque duas linhas sem código na mesma entrega colidiriam
      -- no unique (receipt_item_id, lot_code) do mesmo dia.
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

  -- Divergência agora também nasce do lote (temperatura fora da faixa,
  -- quantidade por lote), não só da linha do item.
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
  'Efetivação atômica do recebimento definitivo: um stock_lot + um stock_movement por LOTE recebido (não por linha de item). Recusa efetivar se a soma dos lotes não fechar com a quantidade conferida.';
