-- Segregação de "preparações congeladas" (semiacabados) em tabela dedicada.
--
-- Contexto: hoje preparações congeladas são linhas de kitchen.ingredient filadas
-- por convenção de nome de pasta ("Preparações" / "Pratos Prontos" / "Lanches
-- Prontos"). Não há flag de tipo. Elas colidem de nome com as receitas homônimas
-- e poluem a árvore de insumos. São o padrão de produto semiacabado de ERP: saída
-- de uma produção E entrada de outra (a regeneração + pratos compostos).
--
-- Esta migration (DDL apenas) cria a tabela e o caminho de consumo. O backfill dos
-- dados existentes está na migration seguinte (…_migrate_frozen_preparations_data).
-- DDL idempotente para ser reaplicável (db:push ou MCP apply_migration).

-- ─── Tabela dedicada ──────────────────────────────────────────────────────────

create table if not exists kitchen.frozen_preparation (
	id                      uuid primary key default gen_random_uuid(),
	description             text not null,
	measure_unit            text,
	yield_quantity          numeric,            -- rendimento de um lote de produção
	correction_factor       numeric,            -- herdado do insumo p/ manter a matemática de consumo
	density_factor          numeric,
	category                text not null default 'preparacao',
	production_recipe_id     uuid references kitchen.recipes (id),   -- receita que PRODUZ (congela)
	regeneration_recipe_id  uuid references kitchen.recipes (id),   -- receita que REGENERA p/ servir
	shelf_life_days         integer,
	storage_temperature_c   numeric,
	storage_instructions    text,
	ceafa_id                uuid references kitchen.ceafa (id),
	source_ingredient_id    uuid references kitchen.ingredient (id), -- rastreabilidade + idempotência do backfill
	legacy_id               bigint,
	created_at              timestamptz not null default now(),
	deleted_at              timestamptz,
	constraint frozen_preparation_category_check
		check (category = any (array['preparacao', 'prato_pronto', 'lanche_pronto']))
);

-- legacy_id é só correlação com o sistema externo (o próprio kitchen.ingredient NÃO
-- força unicidade nele, e há duplicatas nos dados) → índice simples, não único, p/
-- não quebrar o backfill. Parcial where deleted_at is null.
create index if not exists frozen_preparation_legacy_id_idx
	on kitchen.frozen_preparation (legacy_id) where deleted_at is null;
create index if not exists frozen_preparation_category_idx
	on kitchen.frozen_preparation (category) where deleted_at is null;
create index if not exists frozen_preparation_production_recipe_idx
	on kitchen.frozen_preparation (production_recipe_id) where deleted_at is null;
create index if not exists frozen_preparation_source_ingredient_idx
	on kitchen.frozen_preparation (source_ingredient_id) where deleted_at is null;

-- ─── Caminho de consumo em receitas ───────────────────────────────────────────
-- recipe_ingredients.ingredient_id já é nullable → adição aditiva. Uma linha de
-- ficha técnica passa a apontar OU p/ um insumo cru OU p/ uma preparação congelada.
-- recipe_step_input NÃO muda: ele referencia recipe_ingredient_id (o DAG pega carona).

alter table kitchen.recipe_ingredients
	add column if not exists frozen_preparation_id uuid references kitchen.frozen_preparation (id);

alter table kitchen.recipe_ingredient_alternatives
	add column if not exists frozen_preparation_id uuid references kitchen.frozen_preparation (id);

create index if not exists recipe_ingredients_frozen_prep_idx
	on kitchen.recipe_ingredients (frozen_preparation_id) where frozen_preparation_id is not null;
create index if not exists recipe_ingredient_alt_frozen_prep_idx
	on kitchen.recipe_ingredient_alternatives (frozen_preparation_id) where frozen_preparation_id is not null;

-- XOR (no máx. 1 fonte): num_nonnulls <= 1 tolera linhas legadas com ambos nulos
-- (ingredient_id sempre foi nullable). NOT VALID agora; VALIDATE ao fim do backfill,
-- p/ que uma linha legada ruim vá pra triagem em vez de abortar a migration inteira.
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'recipe_ingredients_source_xor'
	) then
		alter table kitchen.recipe_ingredients
			add constraint recipe_ingredients_source_xor
			check (num_nonnulls(ingredient_id, frozen_preparation_id) <= 1) not valid;
	end if;
	if not exists (
		select 1 from pg_constraint where conname = 'recipe_ingredient_alt_source_xor'
	) then
		alter table kitchen.recipe_ingredient_alternatives
			add constraint recipe_ingredient_alt_source_xor
			check (num_nonnulls(ingredient_id, frozen_preparation_id) <= 1) not valid;
	end if;
end $$;

-- ─── Exposição PostgREST / realtime ───────────────────────────────────────────
-- Espelha a postura de kitchen.recipes (política realtime_select permissiva p/
-- authenticated). O acesso principal é via Drizzle (server fn, conexão direta que
-- ignora RLS); as grants abaixo servem PostgREST/realtime.
alter table kitchen.frozen_preparation enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies
		where schemaname = 'kitchen' and tablename = 'frozen_preparation' and policyname = 'realtime_select'
	) then
		create policy "realtime_select" on kitchen.frozen_preparation
			as permissive for select to authenticated using (true);
	end if;
end $$;

grant select on kitchen.frozen_preparation to authenticated, anon;
grant all on kitchen.frozen_preparation to service_role;

notify pgrst, 'reload schema';
