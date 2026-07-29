-- ============================================================================
-- Fase 4 (estoque): Ordem de Fornecimento + Recebimento em dois estágios
-- ============================================================================
-- O empenho é da UNIDADE; a entrega acontece na COZINHA — a OF é o elo que
-- faltava, com data prevista de entrega (insumo do lead time do MRP).
-- Recebimento segue a Lei 14.133 art. 140: provisório → definitivo. Só o
-- DEFINITIVO cria lotes + movimentos no ledger e abate o saldo físico do
-- empenho (efetivação atômica em função SQL).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ordem de Fornecimento
-- ----------------------------------------------------------------------------
create table procurement.supply_order (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references finance.empenho (id),
  kitchen_id bigint not null references core.kitchen (id),
  number text,
  sent_at date,
  expected_delivery date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled', 'expired')),
  -- checagem SICAF pré-emissão (Fase 7): alerta registrado + quem decidiu prosseguir
  sicaf_status text,
  sicaf_ack_by uuid references auth.users (id),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table procurement.supply_order is
  'Ordem/pedido de fornecimento: distribui um empenho (da unidade) para entrega numa cozinha. expected_delivery vs recebimento definitivo alimenta o lead time observado.';

create index supply_order_empenho_idx on procurement.supply_order (empenho_id);
create index supply_order_kitchen_idx on procurement.supply_order (kitchen_id, status);

create table procurement.supply_order_item (
  id uuid primary key default gen_random_uuid(),
  supply_order_id uuid not null references procurement.supply_order (id) on delete cascade,
  arp_item_id uuid references procurement.procurement_arp_item (id) on delete set null,
  purchase_item_id uuid references procurement.purchase_item (id) on delete set null,
  ordered_qty numeric(14,4) not null check (ordered_qty > 0),
  unit_price numeric(12,4)
);

create index supply_order_item_order_idx on procurement.supply_order_item (supply_order_id);

-- A soma das OFs não-canceladas de um empenho não pode exceder o empenhado.
create function procurement.supply_order_check_empenho() returns trigger
language plpgsql as $$
declare
  v_empenho_id uuid;
  v_empenho_qty numeric(14,4);
  v_of_total numeric(14,4);
begin
  select so.empenho_id into v_empenho_id
    from procurement.supply_order so where so.id = new.supply_order_id;
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

create constraint trigger supply_order_item_empenho_check
  after insert or update on procurement.supply_order_item
  for each row execute function procurement.supply_order_check_empenho();

-- ----------------------------------------------------------------------------
-- Recebimento em dois estágios (Lei 14.133, art. 140)
-- ----------------------------------------------------------------------------
create table inventory.goods_receipt (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  supply_order_id uuid references procurement.supply_order (id) on delete set null,
  nfe_document_id uuid references inventory.nfe_document (id) on delete set null,
  empenho_id uuid references finance.empenho (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'provisional', 'definitive', 'divergent', 'rejected')),
  provisional_by uuid references auth.users (id),
  provisional_at timestamptz,
  definitive_by uuid references auth.users (id),
  definitive_at timestamptz,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table inventory.goods_receipt is
  'Recebimento físico: provisório → definitivo (art. 140). Só o definitivo movimenta o ledger. divergent = físico ≠ faturado/autorizado, com motivo por item.';

create index goods_receipt_kitchen_idx on inventory.goods_receipt (kitchen_id, status);
create index goods_receipt_nfe_idx on inventory.goods_receipt (nfe_document_id);

create table inventory.goods_receipt_item (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references inventory.goods_receipt (id) on delete cascade,
  nfe_item_id uuid references inventory.nfe_item (id) on delete set null,
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  ingredient_item_id uuid references kitchen.ingredient_item (id) on delete set null,
  purchase_item_id uuid references procurement.purchase_item (id) on delete set null,
  invoiced_qty_base numeric(14,4),
  received_qty_base numeric(14,4) not null check (received_qty_base >= 0),
  lot_code text,
  expiry_date date,
  unit_cost numeric(12,4),
  divergence_reason text,
  constraint goods_receipt_item_xor check (num_nonnulls(ingredient_id, frozen_preparation_id) = 1)
);

create index goods_receipt_item_receipt_idx on inventory.goods_receipt_item (receipt_id);

-- Ledger passa a rastrear a origem no recebimento
alter table inventory.stock_lot
  add column goods_receipt_item_id uuid references inventory.goods_receipt_item (id) on delete set null;
alter table inventory.stock_movement
  add column goods_receipt_item_id uuid references inventory.goods_receipt_item (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Efetivação do DEFINITIVO — atômica: lotes + movimentos + status
-- ----------------------------------------------------------------------------
create function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
returns table (movements int)
language plpgsql as $$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot_id uuid;
  v_lot_code text;
  v_movements int := 0;
  v_has_divergence boolean;
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

  -- OF: parcial vs total (compara recebido acumulado vs pedido)
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

-- ----------------------------------------------------------------------------
-- Lead time observado: envio da OF → recebimento definitivo, por fornecedor
-- (ni_fornecedor da ARP) × item de compra. Desvio contra expected_delivery.
-- ----------------------------------------------------------------------------
create view inventory.v_supplier_lead_time
  with (security_invoker = true) as
select
  arpitem.ni_fornecedor,
  soi.purchase_item_id,
  so.id as supply_order_id,
  so.sent_at,
  so.expected_delivery,
  gr.definitive_at::date as received_at,
  (gr.definitive_at::date - so.sent_at) as lead_time_days,
  (gr.definitive_at::date - so.expected_delivery) as deviation_days
from procurement.supply_order so
join inventory.goods_receipt gr on gr.supply_order_id = so.id and gr.definitive_at is not null
join procurement.supply_order_item soi on soi.supply_order_id = so.id
left join procurement.procurement_arp_item arpitem on arpitem.id = soi.arp_item_id
where so.sent_at is not null;

comment on view inventory.v_supplier_lead_time is
  'Lead time observado (dias) por fornecedor×item: OF enviada → recebimento definitivo; deviation_days contra a promessa. Alimenta o estimador do MRP (Fase 7).';

-- ----------------------------------------------------------------------------
-- RLS: DENY-ALL para anon/authenticated — acesso só pelas server fns
-- (service role) com PBAC `storage` escopado por cozinha.
-- ----------------------------------------------------------------------------
alter table procurement.supply_order enable row level security;
alter table procurement.supply_order_item enable row level security;
alter table inventory.goods_receipt enable row level security;
alter table inventory.goods_receipt_item enable row level security;
