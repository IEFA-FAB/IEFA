-- ============================================================================
-- ARQUIVO DE REGISTRO — esta migration JÁ ESTÁ APLICADA em produção.
-- ============================================================================
-- `20260818140000 recipe_ingredient_alternatives_revive` foi aplicada direto no
-- banco (dashboard/MCP) e nunca teve arquivo: `supabase_migrations.schema_migrations`
-- tem a linha com `statements = NULL` e nenhum branch do repositório continha o SQL.
--
-- Consequência prática: `supabase db push` abortava com LegacyDbPushMissingLocalError
-- e a CLI sugeria `migration repair --status reverted` — que marcaria uma migration
-- viva como revertida e a recolocaria na fila de aplicação. Este arquivo fecha o
-- buraco pelo lado certo: reconstrói o estado a partir do schema real de produção.
--
-- Escrito IDEMPOTENTE de propósito. No banco onde já rodou é no-op; num banco novo
-- (`db reset`) reproduz o mesmo estado. Não alterar sem conferir contra o remoto.
--
-- Contexto: a substituição de insumo voltou a ser decisão POR LINHA de ficha
-- técnica. O par global de `kitchen.ingredient_substitution` não expressava
-- "nesta preparação, com esta gramatura"; aquela tabela ficou aposentada, com as
-- 4 linhas preservadas como origem do backfill.
-- ============================================================================

create table if not exists kitchen.recipe_ingredient_alternatives (
	id                     uuid primary key default gen_random_uuid(),
	created_at             timestamptz not null default now(),
	recipe_ingredient_id   uuid not null references kitchen.recipe_ingredients (id) on delete cascade,
	ingredient_id          uuid references kitchen.ingredient (id),
	net_quantity           numeric,
	priority_order         smallint,
	frozen_preparation_id  uuid references kitchen.frozen_preparation (id),
	-- Exatamente uma origem: insumo OU preparação congelada, nunca as duas nem nenhuma.
	constraint recipe_ingredient_alt_source_xor check (num_nonnulls(ingredient_id, frozen_preparation_id) = 1)
);

-- Índices únicos PARCIAIS: a coluna nula do XOR faria um único total nunca casar.
create unique index if not exists recipe_ingredient_alt_ingredient_unique
	on kitchen.recipe_ingredient_alternatives (recipe_ingredient_id, ingredient_id)
	where ingredient_id is not null;

create unique index if not exists recipe_ingredient_alt_frozen_unique
	on kitchen.recipe_ingredient_alternatives (recipe_ingredient_id, frozen_preparation_id)
	where frozen_preparation_id is not null;

create index if not exists recipe_ingredient_alt_recipe_ingredient_idx
	on kitchen.recipe_ingredient_alternatives (recipe_ingredient_id);

create index if not exists recipe_ingredient_alt_frozen_prep_idx
	on kitchen.recipe_ingredient_alternatives (frozen_preparation_id)
	where frozen_preparation_id is not null;

alter table kitchen.recipe_ingredient_alternatives enable row level security;

grant select, insert, update, delete on kitchen.recipe_ingredient_alternatives to anon, authenticated;

comment on table kitchen.recipe_ingredient_alternatives is
	'Substitutos de UMA linha de ficha técnica, com a quantidade própria da substituta. Reativada em 2026-08-18: o par global de kitchen.ingredient_substitution não conseguia expressar "nesta preparação, com esta gramatura". Copiada adiante a cada versão da receita (saveRecipeEdit).';

comment on column kitchen.recipe_ingredient_alternatives.net_quantity is
	'Peso líquido TOTAL da substituta na preparação — não um fator. É o ponto do modelo por linha: 2 kg de biscoito champagne podem virar 1,6 kg de amanteigado.';

comment on table kitchen.ingredient_substitution is
	'APOSENTADA em 2026-08-18. As 4 linhas ficam como origem do backfill de kitchen.recipe_ingredient_alternatives; nenhum código lê ou escreve aqui. A substituição voltou a ser por linha de ficha técnica.';
