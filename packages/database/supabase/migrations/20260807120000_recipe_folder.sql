-- Pastas de preparações — agrupamento SIMPLES para organização e filtragem.
--
-- Diferença deliberada para `kitchen.folder` (pastas de insumo): aqui NÃO há hierarquia.
-- A pasta de insumo é estrutural — a árvore é a própria tela de navegação, o `parent_id`
-- define categorias e a subárvore carrega semântica (ver as quick filters de
-- "Preparações"/"Pratos Prontos" derivadas da pasta raiz). A pasta de preparação é só um
-- rótulo de agrupamento: a listagem continua sendo uma lista, e a pasta serve para filtrar
-- e organizar. Sem `parent_id`, sem caminho, sem herança.
--
-- Escopo: catálogo único (não é por cozinha). Criar/renomear/excluir pasta exige `global:2`
-- — mesmo nível das pastas de insumo. ARQUIVAR uma preparação numa pasta é autorizado pela
-- POSSE da preparação (global → global:2; local → kitchen:2 daquela cozinha), então uma
-- cozinha organiza as próprias preparações sem poder mexer no conjunto de pastas.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create table if not exists kitchen.recipe_folder (
	id         uuid primary key default gen_random_uuid(),
	name       text not null,
	created_at timestamptz not null default now(),
	deleted_at timestamptz,
	constraint recipe_folder_name_not_blank check (btrim(name) <> '')
);

-- Unicidade case/space-insensitive apenas entre as pastas ATIVAS: um nome excluído pode ser
-- reaproveitado, e a exclusão é soft. UNIQUE simples ignoraria `deleted_at` e travaria a
-- recriação de uma pasta com o mesmo nome de uma já excluída.
create unique index if not exists recipe_folder_name_active_unique
	on kitchen.recipe_folder (lower(btrim(name)))
	where deleted_at is null;

create index if not exists recipe_folder_deleted_at_idx
	on kitchen.recipe_folder (deleted_at);

-- Uma preparação está em no máximo uma pasta. `on delete set null` é a rede de segurança do
-- hard delete; o caminho normal (soft delete da pasta) desarquiva as preparações na própria
-- operação de domínio, para que nunca fiquem apontando para uma pasta invisível.
alter table kitchen.recipes
	add column if not exists folder_id uuid references kitchen.recipe_folder(id) on delete set null;

create index if not exists recipes_folder_id_idx
	on kitchen.recipes (folder_id);

alter table kitchen.recipe_folder enable row level security;

comment on table kitchen.recipe_folder is
	'Pastas de preparações: agrupamento plano (sem hierarquia) para organização e filtragem da listagem. RLS ligada sem policy: acesso via conexão direta (Drizzle) / service key.';

comment on column kitchen.recipes.folder_id is
	'Pasta de organização da preparação (kitchen.recipe_folder). Metadado de agrupamento: não participa da ficha técnica nem do versionamento — é copiado para a nova versão ao salvar uma edição.';
