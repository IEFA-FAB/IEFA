-- ============================================================================
-- RUMAER — Regulamento de Uniformes da Aeronáutica (schema interativo)
-- ============================================================================
-- Modelo: uniforme -> variantes (por círculo/gênero/subvariação, cada uma com
-- imagem) -> peças com obrigatoriedade. Categorias (quem usa) e equivalências
-- (MB/EB/civil) ficam no uniforme.
--
-- RLS: leitura pública (anon + authenticated); escrita só via service_role
-- (server functions admin), que bypassa RLS.
-- ============================================================================

create schema if not exists rumaer;

grant usage on schema rumaer to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type rumaer.grupo_uniforme as enum (
	'historicos', 'representacao', 'servicos', 'educacao_fisica', 'desfile'
);

create type rumaer.categoria_militar as enum (
	'oficiais', 'cadetes', 'suboficiais', 'sargentos', 'alunos_formacao', 'pracas'
);

create type rumaer.circulo_hierarquico as enum (
	'oficiais', 'sargentos', 'suboficiais', 'cadetes', 'alunos'
);

create type rumaer.genero as enum ('masculino', 'feminino', 'unissex');

create type rumaer.obrigatoriedade as enum ('obrigatorio', 'eventual', 'facultativo');

create type rumaer.equivalencia_civil as enum (
	'esporte', 'esporte_fino', 'passeio', 'passeio_completo', 'gala'
);

create type rumaer.tipo_peca as enum (
	'cabeca', 'torso', 'pernas', 'calcado', 'acessorio', 'insignia',
	'distintivo', 'identificacao', 'arma'
);

-- ----------------------------------------------------------------------------
-- Trigger helper: updated_at
-- ----------------------------------------------------------------------------
create or replace function rumaer.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- uniform — base do uniforme
-- ----------------------------------------------------------------------------
create table rumaer.uniform (
	id uuid primary key default gen_random_uuid(),
	numero int,                       -- 1..17 (null para históricos)
	letra text,                       -- A / B / C
	nome text not null,
	grupo rumaer.grupo_uniforme not null,
	subgrupo text,                    -- gala / rigor / passeio_completo / passeio / servicos_administrativos / ...
	traje text,                       -- ex.: "passeio completo"
	descricao_md text,
	art_referencia text,              -- ex.: "Art. 24"
	eq_mb text,                       -- equivalência Marinha do Brasil
	eq_eb text,                       -- equivalência Exército Brasileiro
	eq_civil rumaer.equivalencia_civil,
	ordem int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);

create trigger uniform_set_updated_at
	before update on rumaer.uniform
	for each row execute function rumaer.set_updated_at();

create index uniform_grupo_idx on rumaer.uniform (grupo) where deleted_at is null;
create index uniform_numero_idx on rumaer.uniform (numero) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- uniform_category — "a) Categoria" (quem pode usar), M:N
-- ----------------------------------------------------------------------------
create table rumaer.uniform_category (
	id uuid primary key default gen_random_uuid(),
	uniform_id uuid not null references rumaer.uniform (id) on delete cascade,
	categoria rumaer.categoria_militar not null,
	unique (uniform_id, categoria)
);

create index uniform_category_uniform_idx on rumaer.uniform_category (uniform_id);

-- ----------------------------------------------------------------------------
-- uniform_variant — combinação renderável (tem a imagem)
-- ----------------------------------------------------------------------------
create table rumaer.uniform_variant (
	id uuid primary key default gen_random_uuid(),
	uniform_id uuid not null references rumaer.uniform (id) on delete cascade,
	circulo rumaer.circulo_hierarquico not null,
	genero rumaer.genero not null,
	sub_variacao text,                -- gestante / tropa_montada / null
	image_path text,                  -- chave no bucket rumaer-uniforms
	descricao_md text,
	ordem int not null default 0,
	unique (uniform_id, circulo, genero, sub_variacao)
);

create index uniform_variant_uniform_idx on rumaer.uniform_variant (uniform_id);

-- ----------------------------------------------------------------------------
-- piece — catálogo de peças (inclui insígnias/distintivos/identificações)
-- ----------------------------------------------------------------------------
create table rumaer.piece (
	id uuid primary key default gen_random_uuid(),
	nome text not null,
	slug text not null unique,
	tipo rumaer.tipo_peca not null,
	descricao_md text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);

create trigger piece_set_updated_at
	before update on rumaer.piece
	for each row execute function rumaer.set_updated_at();

-- ----------------------------------------------------------------------------
-- uniform_variant_piece — composição (b/c/d do artigo)
-- ----------------------------------------------------------------------------
create table rumaer.uniform_variant_piece (
	id uuid primary key default gen_random_uuid(),
	variant_id uuid not null references rumaer.uniform_variant (id) on delete cascade,
	piece_id uuid not null references rumaer.piece (id) on delete restrict,
	obrigatoriedade rumaer.obrigatoriedade not null,
	observacao text,                  -- ex.: "para oficiais"
	restricao_posto text[],           -- platina: só postos respectivos
	restricao_quadro text[],          -- platina: só quadros respectivos
	ordem int not null default 0
);

create index uvp_variant_idx on rumaer.uniform_variant_piece (variant_id);
create index uvp_piece_idx on rumaer.uniform_variant_piece (piece_id);

-- ----------------------------------------------------------------------------
-- RLS — leitura pública, escrita só service_role
-- ----------------------------------------------------------------------------
alter table rumaer.uniform enable row level security;
alter table rumaer.uniform_category enable row level security;
alter table rumaer.uniform_variant enable row level security;
alter table rumaer.piece enable row level security;
alter table rumaer.uniform_variant_piece enable row level security;

create policy "public read uniform" on rumaer.uniform
	for select to anon, authenticated using (true);
create policy "public read uniform_category" on rumaer.uniform_category
	for select to anon, authenticated using (true);
create policy "public read uniform_variant" on rumaer.uniform_variant
	for select to anon, authenticated using (true);
create policy "public read piece" on rumaer.piece
	for select to anon, authenticated using (true);
create policy "public read uniform_variant_piece" on rumaer.uniform_variant_piece
	for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
-- Grants (RLS gate de linhas; grants são gate de tabela)
-- ----------------------------------------------------------------------------
grant select on all tables in schema rumaer to anon, authenticated;
grant all on all tables in schema rumaer to service_role;

alter default privileges in schema rumaer
	grant select on tables to anon, authenticated;
alter default privileges in schema rumaer
	grant all on tables to service_role;

-- ----------------------------------------------------------------------------
-- Storage bucket (privado; servido via signed URL)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('rumaer-uniforms', 'rumaer-uniforms', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Expor o schema rumaer via PostgREST (adiciona à lista existente).
-- Idempotente; aplicado em ambientes novos via db:push.
-- ----------------------------------------------------------------------------
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer';
notify pgrst, 'reload config';
