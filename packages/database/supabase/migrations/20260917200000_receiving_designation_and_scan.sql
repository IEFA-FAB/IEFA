-- ============================================================================
-- Fase 3B de sisub-inventory-operations: competência, conferência e pendência fiscal
-- ============================================================================
-- Três coisas que faltavam no recebimento:
--
--  (1) COMPETÊNCIA. Efetivar o definitivo era permitido a "qualquer nível 3" do
--      PBAC. O Decreto 11.246/2022, art. 25, separa os papéis: o provisório é
--      do fiscal, o definitivo é do gestor do contrato ou de comissão
--      designada. Nível de permissão é pré-condição, não competência — e termo
--      assinado por quem não tem competência vicia a liquidação apoiada nele.
--      A designação pode vir de ato (boletim/portaria), do PRÓPRIO EMPENHO
--      (caso comum, confirmado pelo mantenedor) ou de ato permanente da unidade
--      para recebimento de gêneros.
--
--  (2) CONFERÊNCIA REGISTRADA. A leitura do código só destacava a linha na
--      tela: nada dizia quem conferiu o quê, nem como. O termo do art. 140 é
--      "circunstanciado", e sem registro ele não circunstancia nada. Cada
--      leitura, confirmação manual ou aceite em bloco vira evento append-only,
--      e a quantidade conferida é DERIVADA deles.
--
--  (3) PENDÊNCIA FISCAL. Receber a menos e seguir a vida deixa a nota dizendo
--      100 e o estoque dizendo 90. Carta de correção não conserta quantidade
--      nem valor (Ajuste SINIEF 07/05): ou vem nota de devolução do fornecedor,
--      ou nota substituta, ou a glosa é registrada. Enquanto isso, o
--      recebimento fica com pendência e não é liquidável.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Designação
-- ----------------------------------------------------------------------------
create table procurement.contract_designation (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  -- o vínculo: empenho, ARP/contrato, ou nenhum (designação permanente da OM
  -- para recebimento de gêneros, que é o caso da entrega sem contrato)
  empenho_id uuid references finance.empenho (id) on delete cascade,
  arp_id uuid references procurement.procurement_arp (id) on delete cascade,
  person_id uuid not null references auth.users (id),
  role text not null check (role in (
    'manager', 'technical_inspector', 'administrative_inspector', 'sectoral_inspector', 'committee_member')),
  is_substitute boolean not null default false,
  -- de onde vem a competência
  source text not null check (source in ('ato', 'empenho', 'permanente')),
  -- número do boletim/portaria, ou do empenho quando a fonte é ele
  source_reference text,
  valid_from date not null default (now() at time zone 'America/Sao_Paulo')::date,
  valid_to date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint contract_designation_period check (valid_to is null or valid_to >= valid_from)
);

comment on table procurement.contract_designation is
  'Designação de gestor, fiscal e comissão (Decreto 11.246/2022, art. 25). Fonte `empenho` cobre o caso em que o próprio empenho nomeia o responsável; `permanente` cobre recebimento de gêneros sem contrato.';

create index contract_designation_unit_idx on procurement.contract_designation (unit_id, role);
create index contract_designation_empenho_idx on procurement.contract_designation (empenho_id) where empenho_id is not null;
create index contract_designation_person_idx on procurement.contract_designation (person_id);

alter table procurement.contract_designation enable row level security;
revoke all on procurement.contract_designation from anon, authenticated;

/**
 * Designação vigente da pessoa para um recebimento.
 *
 * Ordem de busca: designação do empenho → da ARP/contrato → permanente da
 * unidade. Devolve o id da designação usada, que fica gravado no recebimento e
 * impresso no termo: "quem assinou" tem de ser rastreável até o ato.
 */
create function inventory.find_designation(
  p_person uuid,
  p_unit_id bigint,
  p_empenho_id uuid,
  p_roles text[]
) returns uuid
language sql stable as $$
  select d.id
    from procurement.contract_designation d
    where d.person_id = p_person
      and d.unit_id = p_unit_id
      and d.role = any(p_roles)
      and d.valid_from <= (now() at time zone 'America/Sao_Paulo')::date
      and (d.valid_to is null or d.valid_to >= (now() at time zone 'America/Sao_Paulo')::date)
      and (d.empenho_id is null or d.empenho_id = p_empenho_id)
    order by (d.empenho_id is not null) desc, d.is_substitute asc, d.valid_from desc
    limit 1;
$$;

-- ----------------------------------------------------------------------------
-- (2) Recebimento: origem, designação, pendência fiscal
-- ----------------------------------------------------------------------------
alter table inventory.goods_receipt
  -- `nfe`: nota já conhecida. `delivery_note`: guia de remessa (depósito de
  -- subsistência, outra OM). `ad_hoc`: entrega sem documento prévio — pão e
  -- leite diários com nota semanal caem aqui, e sem esta origem não havia onde
  -- lançar a entrega do dia.
  add column source text not null default 'nfe' check (source in ('nfe', 'delivery_note', 'ad_hoc')),
  add column delivery_note_number text,
  add column provisional_designation_id uuid references procurement.contract_designation (id),
  add column definitive_designation_id uuid references procurement.contract_designation (id),
  -- pendência fiscal: quantidade recebida a MENOR que a faturada
  add column fiscal_pending boolean not null default false,
  add column fiscal_pending_value numeric(14,2),
  add column fiscal_resolution text check (fiscal_resolution in ('return_nfe', 'replacement_nfe', 'glosa')),
  add column fiscal_resolution_reference text,
  add column fiscal_resolved_at timestamptz,
  add column fiscal_resolved_by uuid references auth.users (id);

comment on column inventory.goods_receipt.source is
  'Origem do recebimento. Sem `delivery_note`/`ad_hoc` não havia onde lançar entrega diária cuja nota é semanal, remessa de depósito ou apoio de outra OM.';
comment on column inventory.goods_receipt.fiscal_pending is
  'Recebido a menor que o faturado. Carta de correção não altera quantidade nem valor: resolve-se por NF-e de devolução, nota substituta ou glosa registrada.';

-- ----------------------------------------------------------------------------
-- (3) Eventos de conferência
-- ----------------------------------------------------------------------------
create table inventory.receipt_scan_event (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references inventory.goods_receipt (id) on delete cascade,
  receipt_item_id uuid references inventory.goods_receipt_item (id) on delete cascade,
  -- ordem total dos eventos do recebimento: `created_at` é o início da
  -- transação e empata quando duas leituras entram juntas
  seq bigserial not null,
  -- idempotência: retry de rede com leitor na mão é comum, e sem isto a mesma
  -- caixa entra duas vezes
  client_event_id text not null,
  method text not null check (method in ('scanner', 'camera', 'manual_confirm', 'typed', 'bulk_confirm', 'reversal')),
  raw_code text,
  gtin text,
  lot_code text,
  expiry_date date,
  /** Fator aplicado: 1 para embalagem comercial, qCom/qTrib para unidade. */
  package_factor numeric(14,6),
  quantity_base numeric(14,4) not null,
  /** Evento estornado por este (quando method = 'reversal'). */
  reversed_event_id uuid references inventory.receipt_scan_event (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint receipt_scan_event_client_key unique (receipt_id, client_event_id),
  constraint receipt_scan_event_reversal check (method <> 'reversal' or reversed_event_id is not null)
);

comment on table inventory.receipt_scan_event is
  'Conferência do recebimento, append-only. A quantidade conferida da linha é derivada daqui — é o que torna o termo do art. 140 circunstanciado: quem conferiu o quê, como e quando.';

-- estorno só uma vez: desfazer duas vezes a mesma leitura devolveria caixa que
-- não existe
create unique index receipt_scan_event_reversal_key on inventory.receipt_scan_event (reversed_event_id)
  where reversed_event_id is not null;
create index receipt_scan_event_receipt_idx on inventory.receipt_scan_event (receipt_id, seq);

alter table inventory.receipt_scan_event enable row level security;
revoke all on inventory.receipt_scan_event from anon, authenticated;

-- append-only, como o ledger
create function inventory.receipt_scan_event_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'receipt_scan_event é append-only: para desfazer uma leitura, grave um evento de estorno';
end;
$$;

create trigger receipt_scan_event_no_update_delete
  before update or delete on inventory.receipt_scan_event
  for each row execute function inventory.receipt_scan_event_immutable();

-- Recebimento EFETIVADO não aceita mais escrita — nem de item, nem de lote,
-- nem de evento. A API já barrava (Fase 0); aqui o banco barra, que é o que
-- vale quando a checagem e a escrita estão em requisições diferentes.
create or replace function inventory.receipt_must_be_open() returns trigger
language plpgsql as $$
declare
  v_row record;
  v_receipt_id uuid;
  v_status text;
  v_definitive timestamptz;
begin
  -- DELETE não tem NEW; INSERT não tem OLD. Escolher a linha ANTES de tocar em
  -- qualquer campo evita "record new is not assigned yet", e cada tabela tem um
  -- caminho próprio até o recebimento (a de lotes só conhece o ITEM).
  v_row := case when tg_op = 'DELETE' then old else new end;

  if tg_table_name = 'goods_receipt_item_lot' then
    select gri.receipt_id into v_receipt_id
      from inventory.goods_receipt_item gri
      where gri.id = v_row.receipt_item_id;
  else
    v_receipt_id := v_row.receipt_id;
  end if;

  if v_receipt_id is null then return v_row; end if;

  select status, definitive_at into v_status, v_definitive
    from inventory.goods_receipt where id = v_receipt_id for share;

  if v_definitive is not null or v_status in ('definitive', 'divergent', 'rejected') then
    raise exception 'Recebimento já efetivado (%) — não aceita mais escrita', v_status;
  end if;
  return v_row;
end;
$$;

create trigger goods_receipt_item_open_only
  before insert or update or delete on inventory.goods_receipt_item
  for each row execute function inventory.receipt_must_be_open();

create trigger goods_receipt_item_lot_open_only
  before insert or update or delete on inventory.goods_receipt_item_lot
  for each row execute function inventory.receipt_must_be_open();

create trigger receipt_scan_event_open_only
  before insert on inventory.receipt_scan_event
  for each row execute function inventory.receipt_must_be_open();

-- ----------------------------------------------------------------------------
-- (4) Tolerância de quantidade por item de compra
-- ----------------------------------------------------------------------------
alter table procurement.purchase_item
  add column quantity_tolerance_pct numeric(5,2) not null default 2
    check (quantity_tolerance_pct between 0 and 100);

comment on column procurement.purchase_item.quantity_tolerance_pct is
  'Tolerância de quantidade na entrega. Peso variável (carne, hortifrúti) nunca bate exatamente com a nota, e tratar 300 g de diferença como divergência faz o operador escolher "outro" em tudo.';

-- ----------------------------------------------------------------------------
-- (5) Alias de GTIN aprendido na operação
-- ----------------------------------------------------------------------------
-- O operador lê um GTIN desconhecido (embalagem nova do mesmo produto) e o
-- associa à linha. Isso NÃO pode escrever em `ingredient_item.gtin`: a coluna é
-- única, e sobrescrever quebraria o casamento das notas antigas. Vira alias,
-- que vale já para a cozinha e entra na fila de revisão global.
create table gs1_integration.gtin_alias (
  id uuid primary key default gen_random_uuid(),
  gtin text not null check (gtin ~ '^[0-9]{14}$'),
  ingredient_item_id uuid not null references kitchen.ingredient_item (id) on delete cascade,
  supplier_cnpj text,
  kitchen_id bigint references kitchen.kitchen (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  constraint gtin_alias_unique unique (gtin, ingredient_item_id)
);

comment on table gs1_integration.gtin_alias is
  'GTIN aprendido na conferência. Vale imediatamente para a cozinha que criou e para notas do mesmo fornecedor; aprovado por `global` nível 2, passa a valer para todos.';

create index gtin_alias_gtin_idx on gs1_integration.gtin_alias (gtin) where status <> 'rejected';
create index gtin_alias_pending_idx on gs1_integration.gtin_alias (status) where status = 'pending';

alter table gs1_integration.gtin_alias enable row level security;
revoke all on gs1_integration.gtin_alias from anon, authenticated;
