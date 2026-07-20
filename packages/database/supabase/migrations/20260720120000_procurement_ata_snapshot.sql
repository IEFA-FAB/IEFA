-- freeze-ata-snapshot-on-publish (1/2): estrutura
--
-- Congela a composição da ATA no momento em que sai do rascunho e desacopla a
-- proveniência do menu_template mutável/soft-deletável.
--
-- 1. procurement_list_snapshot_selection — cópia imutável das seleções resolvidas
--    (nome/tipo do cardápio, repetições) no instante da publicação.
-- 2. procurement_list_snapshot_component — cópia imutável do breakdown de itens
--    (memória de cálculo agregada por ingrediente) no instante da publicação.
-- 3. procurement_list_item.computed_at — instante do cálculo dos quantitativos,
--    base para detecção de defasagem (stale) no rascunho.
-- 4. procurement_list_selection.origin_template_id — rebaixa template_id a origem
--    informativa (nullable, ON DELETE SET NULL). template_id é mantido nesta fase;
--    o drop fica para uma migration posterior após as leituras migrarem.

-- ── 1. snapshot de seleções ───────────────────────────────────────────────────
create table if not exists procurement.procurement_list_snapshot_selection (
	id uuid primary key default gen_random_uuid(),
	list_id uuid not null references procurement.procurement_list(id) on delete cascade,
	origin_template_id uuid,
	template_name text,
	template_type text,
	kitchen_id integer,
	kitchen_name text,
	repetitions integer not null default 1,
	snapshot_source text not null default 'native' check (snapshot_source in ('native', 'backfill')),
	created_at timestamptz not null default now()
);

create index if not exists idx_proc_snapshot_selection_list_id
	on procurement.procurement_list_snapshot_selection (list_id);

-- ── 2. snapshot de componentes (itens congelados) ─────────────────────────────
create table if not exists procurement.procurement_list_snapshot_component (
	id uuid primary key default gen_random_uuid(),
	list_id uuid not null references procurement.procurement_list(id) on delete cascade,
	ingredient_id uuid,
	ingredient_name text not null,
	folder_description text,
	measure_unit text,
	total_quantity numeric(14, 4) not null,
	purchase_item_id uuid,
	purchase_item_description text,
	purchase_measure_unit text,
	purchase_quantity numeric(14, 4),
	catmat_item_codigo integer,
	unit_price numeric(12, 4),
	snapshot_source text not null default 'native' check (snapshot_source in ('native', 'backfill')),
	computed_at timestamptz not null default now()
);

create index if not exists idx_proc_snapshot_component_list_id
	on procurement.procurement_list_snapshot_component (list_id);

-- ── 3. computed_at nos itens ──────────────────────────────────────────────────
alter table procurement.procurement_list_item
	add column if not exists computed_at timestamptz;

-- ── 4. origin_template_id nas seleções ────────────────────────────────────────
alter table procurement.procurement_list_selection
	add column if not exists origin_template_id uuid;

-- backfill a partir do template_id existente
update procurement.procurement_list_selection
	set origin_template_id = template_id
	where origin_template_id is null;

-- FK informativa: apagar o cardápio de origem apenas anula a referência, sem tocar a ATA
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'procurement_list_selection_origin_template_id_fkey'
	) then
		alter table procurement.procurement_list_selection
			add constraint procurement_list_selection_origin_template_id_fkey
			foreign key (origin_template_id)
			references kitchen.menu_template(id)
			on delete set null;
	end if;
end $$;
