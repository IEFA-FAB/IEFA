-- Pastas do catálogo global de eventos e cardápios de apoio, e procedência da refeição.
--
-- A SDAB organiza os modelos em dois níveis: Eventos Modelo em padrão (A/B/C) → formato de
-- serviço (café da manhã, brunch, almoço, coquetel, jantar); Cardápios de Apoio em família →
-- classe. A organização é dela (nomes, descrições, ordem), então mora numa tabela editável, não
-- em colunas de classificação. A pasta não tem regra: o sistema não deriva nada dela.
--
-- Cada modelo de evento global passa a ser UMA variante (uma refeição). A cozinha monta o evento
-- real compondo modelos, e cada refeição copiada guarda de qual modelo veio
-- (`menu_template_event_meal.source_template_id`). Ver openspec/changes/sisub-occasion-catalog-variants.
--
-- Sem `kitchen_id`/`unit_id`/`mess_hall_id` na tabela nova: o guard do reset de treino não a cobra.

create table kitchen.menu_template_folder (
	id uuid primary key default gen_random_uuid(),
	template_type text not null check (template_type in ('event', 'apoio')),
	parent_id uuid references kitchen.menu_template_folder (id),
	name text not null check (length(btrim(name)) between 1 and 120),
	description text,
	sort_order smallint not null default 0,
	created_at timestamptz not null default now(),
	deleted_at timestamptz,
	constraint menu_template_folder_not_own_parent check (parent_id is distinct from id)
);

comment on table kitchen.menu_template_folder is
	'Pastas do catálogo global de eventos e cardápios de apoio (dois níveis, conferidos no domínio). Só organizam: nenhuma regra é derivada da pasta.';
comment on column kitchen.menu_template_folder.sort_order is
	'Ordem entre as irmãs. A ordem da SDAB não é alfabética (Café da Manhã, Brunch, Almoço, Coquetel, Jantar).';

-- Nome único entre irmãs ativas, sem distinguir caixa.
create unique index menu_template_folder_sibling_name
	on kitchen.menu_template_folder (template_type, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
	where deleted_at is null;
create index menu_template_folder_parent_id_fk_idx on kitchen.menu_template_folder (parent_id);

alter table kitchen.menu_template_folder enable row level security;
revoke all on kitchen.menu_template_folder from anon, authenticated;
grant select, insert, update, delete on kitchen.menu_template_folder to service_role;

-- Pasta do modelo global. Modelo de cozinha não tem pasta (conferido no domínio): ele aparece
-- agrupado pela pasta do modelo de origem.
alter table kitchen.menu_template add column folder_id uuid references kitchen.menu_template_folder (id);
create index menu_template_folder_id_fk_idx on kitchen.menu_template (folder_id);
comment on column kitchen.menu_template.folder_id is
	'Pasta do catálogo global. Nulo em modelo de cozinha e em modelo global "sem pasta".';

-- Duas opções na mesma pasta têm nomes diferentes (decisão da SDAB, 2026-10-05).
create unique index menu_template_folder_model_name
	on kitchen.menu_template (folder_id, lower(btrim(name)))
	where folder_id is not null and deleted_at is null;

-- De qual modelo a refeição foi copiada (composição do evento, adaptação). Procedência, não
-- referência viva: editar o modelo não muda a cópia.
alter table kitchen.menu_template_event_meal
	add column source_template_id uuid references kitchen.menu_template (id) on delete set null;
create index menu_template_event_meal_source_template_id_fk_idx on kitchen.menu_template_event_meal (source_template_id);
comment on column kitchen.menu_template_event_meal.source_template_id is
	'Modelo de onde a refeição foi copiada (composição ou adaptação). Só procedência: a cópia não acompanha o modelo.';
