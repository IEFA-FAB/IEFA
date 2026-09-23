-- ============================================================================
-- Lanche de Bordo e Lanche de Apoio — padrões pedíveis e requisição (Anexo E)
-- ============================================================================
--
-- Fonte normativa: Módulo 7 do Manual Eletrônico do SISUB (SDAB, 27 NOV 2025).
-- Change OpenSpec: `sisub-snack-support-requests`.
--
--  1. `kitchen.menu_template` ganha a classificação de PADRÃO DE LANCHE. Só a
--     exceção (`template_type = 'exception'`) pode ser padrão; num padrão,
--     `headcount_override` do item é porções por kit e
--     `expected_monthly_occurrences` é kits por mês — a conta da Ata
--     (porções × ocorrências × vigência) continua a mesma.
--  2. `kitchen.meal_type.system_key` + o tipo global "Lanches de Bordo/Apoio".
--     O pedido aceito entra no quadro de produção sob esse tipo, separado das
--     refeições do rancho. Tipo de sistema não aparece nos seletores de
--     cardápio (o `fetchMealTypes` o filtra) e não pode ser editado/apagado.
--  3. `kitchen.snack_request` (+ linhas, eventos, cautela). A transição de
--     status trava a linha e grava o evento na mesma transação (operation em
--     `@iefa/sisub-domain`); o evento é apenas-inserção.
--  4. `kitchen.menu_items.origin_snack_request_id` — o item de produção sabe de
--     qual pedido veio (o quadro discrimina por ele).
--
-- Tudo aqui é do servidor: RLS ligada sem policy, e nenhum grant a
-- anon/authenticated (nada entra na CLIENT_TABLE_ALLOWLIST).
-- ============================================================================

-- ── 1. Padrão de lanche ─────────────────────────────────────────────────────

alter table kitchen.menu_template
  add column snack_family text,
  add column snack_class text,
  add column snack_variant text,
  add column requires_galley boolean not null default false,
  add column requires_oven boolean not null default false,
  add column reviewed_at date,
  add column shelf_life_hours smallint,
  add column orderable boolean not null default false;

alter table kitchen.menu_template
  add constraint menu_template_snack_family_check
    check (snack_family is null or snack_family in ('bordo', 'apoio')),
  add constraint menu_template_snack_class_check
    check (snack_class is null or snack_class in ('A', 'B', 'C')),
  add constraint menu_template_snack_variant_check
    check (snack_variant is null or snack_variant in ('lanche', 'refeicao')),
  -- Classificação é tudo ou nada, e só em exceção.
  add constraint menu_template_snack_complete_check
    check (
      (snack_family is null and snack_class is null and snack_variant is null and orderable = false)
      or (snack_family is not null and snack_class is not null and snack_variant is not null and template_type = 'exception')
    ),
  -- Lanche de Apoio só tem classes A e B (7.2.2).
  add constraint menu_template_snack_apoio_class_check
    check (snack_family is distinct from 'apoio' or snack_class in ('A', 'B')),
  add constraint menu_template_shelf_life_hours_check
    check (shelf_life_hours is null or shelf_life_hours between 1 and 720);

comment on column kitchen.menu_template.snack_family is
  'Padrão de lanche (Módulo 7): bordo | apoio. Não nulo ⇒ headcount_override dos itens é porções por kit e expected_monthly_occurrences é kits por mês.';
comment on column kitchen.menu_template.orderable is
  'O padrão aparece para pedido no módulo Comensal. Só padrão da própria cozinha é pedível.';
comment on column kitchen.menu_template.reviewed_at is
  'Última revisão do cardápio do lanche — a norma pede revisão trimestral (7.4.18).';
comment on column kitchen.menu_template.shelf_life_hours is
  'Validade impressa na etiqueta, em horas a partir da fabricação. Nulo = 24 h.';

-- ── 2. Tipo de refeição de sistema ─────────────────────────────────────────

alter table kitchen.meal_type add column system_key text;
alter table kitchen.meal_type
  add constraint meal_type_system_key_check check (system_key is null or system_key in ('snack_request'));
create unique index meal_type_system_key_unique on kitchen.meal_type (system_key) where system_key is not null;
comment on column kitchen.meal_type.system_key is
  'Tipo de refeição mantido pelo sistema (não aparece nos seletores de cardápio). snack_request = produção de pedidos de lanche.';

insert into kitchen.meal_type (name, kitchen_id, sort_order, system_key)
values ('Lanches de Bordo/Apoio', null, 90, 'snack_request');

-- ── 3. Requisição ──────────────────────────────────────────────────────────

create table kitchen.snack_request (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references kitchen.kitchen (id),
  requested_by uuid not null references auth.users (id),
  requester_unit_label text not null,

  -- Anexo E
  mission_kind text not null check (mission_kind in ('aerea', 'terrestre')),
  vehicle_type text,
  vehicle_registration text,
  vehicle_om text,
  mission_description text not null,
  departure_at timestamptz not null,
  origin text,
  destination text,
  stops text,
  total_minutes integer not null check (total_minutes > 0),
  longest_leg_minutes integer check (longest_leg_minutes is null or longest_leg_minutes > 0),
  stops_without_mess boolean not null default false,
  ground_minutes integer not null default 0 check (ground_minutes >= 0),
  mission_order_number text,
  is_operational boolean not null,
  has_galley boolean not null default false,
  has_oven boolean not null default false,
  crew_count integer not null check (crew_count >= 0),
  pax_count integer not null default 0 check (pax_count >= 0),
  water_quantity integer not null default 0 check (water_quantity >= 0),
  cup_quantity integer not null default 0 check (cup_quantity >= 0),
  ice_quantity integer not null default 0 check (ice_quantity >= 0),
  coffee_quantity integer not null default 0 check (coffee_quantity >= 0),
  includes_non_military boolean not null default false,
  non_military_reason text,
  preference text not null check (preference in ('lanche', 'refeicao')),
  pickup_at timestamptz not null,
  pickup_responsible text not null,
  funding_source text not null check (funding_source in ('economia_om', 'recurso_missao')),
  late_reason text,
  divergence_reason text,
  calculator_snapshot jsonb not null,

  -- Ciclo
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'rejected', 'in_production', 'ready', 'delivered', 'closed', 'cancelled')),
  unit_value numeric(12, 2) check (unit_value is null or unit_value >= 0),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_reason text,
  sample_collected_at timestamptz,
  sample_collected_by uuid references auth.users (id),
  sample_notes text,
  picked_up_at timestamptz,
  picked_up_by_name text,
  delivered_by uuid references auth.users (id),
  cancelled_by uuid references auth.users (id),
  cancel_reason text,
  material_return_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint snack_request_aerial_order_check
    check (mission_kind <> 'aerea' or nullif(btrim(mission_order_number), '') is not null),
  constraint snack_request_non_military_check
    check (not includes_non_military or nullif(btrim(non_military_reason), '') is not null),
  constraint snack_request_rejected_reason_check
    check (status <> 'rejected' or nullif(btrim(decision_reason), '') is not null),
  -- Aceite exige o valor do lanche (Anexo E, item 11, preenchido pela SSU).
  constraint snack_request_value_after_accept_check
    check (status not in ('accepted', 'in_production', 'ready', 'delivered', 'closed') or unit_value is not null),
  -- Pronto exige a amostra de 72 h (7.4.6).
  constraint snack_request_sample_before_ready_check
    check (status not in ('ready', 'delivered', 'closed') or sample_collected_at is not null),
  constraint snack_request_pickup_after_delivery_check
    check (status not in ('delivered', 'closed') or picked_up_at is not null),
  constraint snack_request_people_check check (crew_count + pax_count > 0)
);

create index snack_request_kitchen_pickup_idx on kitchen.snack_request (kitchen_id, pickup_at);
create index snack_request_requester_idx on kitchen.snack_request (requested_by, created_at desc);

comment on table kitchen.snack_request is
  'Requisição de Lanche de Bordo/Apoio (Módulo 7, Anexo E). Escrita só pelo servidor; status muda com a linha travada e o evento gravado na mesma transação.';

create table kitchen.snack_request_line (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references kitchen.snack_request (id) on delete cascade,
  standard_id uuid not null references kitchen.menu_template (id),
  audience text not null check (audience in ('crew', 'pax')),
  quantity integer not null check (quantity > 0),
  -- Quantidade após o aceite (a cozinha pode reduzir o que a calculadora marcou como opcional).
  approved_quantity integer check (approved_quantity is null or approved_quantity >= 0),
  optional boolean not null default false,
  standard_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index snack_request_line_request_idx on kitchen.snack_request_line (request_id);
create index snack_request_line_standard_idx on kitchen.snack_request_line (standard_id);

-- O padrão tem que ser pedível e da mesma cozinha do pedido. A operation também confere;
-- o banco fecha a porta para quem escrever por outro caminho.
create or replace function kitchen.snack_request_line_check_standard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_request_kitchen bigint;
  v_standard record;
begin
  select kitchen_id into v_request_kitchen from kitchen.snack_request where id = new.request_id;
  select kitchen_id, snack_family, orderable, deleted_at into v_standard
    from kitchen.menu_template where id = new.standard_id;

  if v_standard is null or v_standard.snack_family is null then
    raise exception 'SNACK_STANDARD_INVALID: % não é padrão de lanche', new.standard_id using errcode = '23514';
  end if;
  if v_standard.kitchen_id is distinct from v_request_kitchen then
    raise exception 'SNACK_STANDARD_OTHER_KITCHEN: padrão % não é da cozinha do pedido', new.standard_id using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and (not v_standard.orderable or v_standard.deleted_at is not null) then
    raise exception 'SNACK_STANDARD_NOT_ORDERABLE: padrão % não está disponível para pedido', new.standard_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger snack_request_line_check_standard
  before insert or update of standard_id, request_id on kitchen.snack_request_line
  for each row execute function kitchen.snack_request_line_check_standard();

create table kitchen.snack_request_event (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references kitchen.snack_request (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references auth.users (id),
  note text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index snack_request_event_request_idx on kitchen.snack_request_event (request_id, created_at);

comment on table kitchen.snack_request_event is
  'Histórico apenas-inserção das transições do pedido de lanche. O ator vem sempre da sessão.';

-- Apenas-inserção: nem o servidor reescreve histórico. O `delete` em cascata do reset de
-- treino passa porque o trigger é de UPDATE e de DELETE direto na tabela — a cascata de FK
-- dispara o trigger também, então ela é liberada pelo `pg_trigger_depth()` (> 1 na cascata).
create or replace function kitchen.snack_request_event_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'SNACK_REQUEST_EVENT_APPEND_ONLY: histórico do pedido não se altera' using errcode = '42501';
end;
$$;

create trigger snack_request_event_append_only
  before update or delete on kitchen.snack_request_event
  for each row execute function kitchen.snack_request_event_append_only();

create table kitchen.snack_request_material (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references kitchen.snack_request (id) on delete cascade,
  item text not null check (item in ('garrafa_termica', 'caixa_termica', 'hotbox', 'cooler', 'outro')),
  description text,
  quantity integer not null check (quantity > 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  issued_at timestamptz not null default now(),
  returned_at timestamptz,
  constraint snack_request_material_returned_check check (returned_quantity <= quantity),
  constraint snack_request_material_other_check check (item <> 'outro' or nullif(btrim(description), '') is not null)
);

create index snack_request_material_request_idx on kitchen.snack_request_material (request_id);

comment on table kitchen.snack_request_material is
  'Cautela do material de rancho entregue com o lanche (7.4.19): garrafas e caixas térmicas voltam ao rancho no fim da missão.';

-- ── 4. Origem do item de produção ──────────────────────────────────────────

alter table kitchen.menu_items
  add column origin_snack_request_id uuid references kitchen.snack_request (id);
create index menu_items_origin_snack_request_idx on kitchen.menu_items (origin_snack_request_id)
  where origin_snack_request_id is not null;
comment on column kitchen.menu_items.origin_snack_request_id is
  'Pedido de lanche que originou o item (aceite da requisição). O quadro de produção discrimina por ele.';

-- ── Acesso ─────────────────────────────────────────────────────────────────

alter table kitchen.snack_request enable row level security;
alter table kitchen.snack_request_line enable row level security;
alter table kitchen.snack_request_event enable row level security;
alter table kitchen.snack_request_material enable row level security;

revoke all on kitchen.snack_request from anon, authenticated;
revoke all on kitchen.snack_request_line from anon, authenticated;
revoke all on kitchen.snack_request_event from anon, authenticated;
revoke all on kitchen.snack_request_material from anon, authenticated;

grant select, insert, update, delete on kitchen.snack_request to service_role;
grant select, insert, update, delete on kitchen.snack_request_line to service_role;
grant select, insert, delete on kitchen.snack_request_event to service_role;
grant select, insert, update, delete on kitchen.snack_request_material to service_role;

revoke all on function kitchen.snack_request_line_check_standard() from public;
revoke all on function kitchen.snack_request_event_append_only() from public;
