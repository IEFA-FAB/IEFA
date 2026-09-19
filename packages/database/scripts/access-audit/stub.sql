-- Esqueleto mínimo do banco de produção para validar as migrations de auditoria de acesso
-- (20260921130000 + 20260921130100) num Postgres DESCARTÁVEL. Espelha as colunas, FKs
-- (inclusive as ações ON DELETE), índices únicos e CHECKs das tabelas de acesso como estão
-- em produção (conferido por leitura do catálogo em 2026-09-19). NÃO é migration: só roda
-- em cluster local, por `run.sh`.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema core;
create schema kitchen;
create schema access_control;
create schema forms;
create schema journal;
grant usage on schema access_control, forms, journal, core, kitchen, auth to service_role;
grant usage on schema access_control to anon, authenticated;

create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create table core.units (id bigint primary key);
create table kitchen.kitchen (id bigint primary key);
create table kitchen.mess_halls (id bigint primary key);

create table access_control.sensitive_operation_log (
	id uuid primary key default gen_random_uuid(),
	actor_id uuid not null references auth.users(id) on delete restrict,
	operation text not null,
	assurance text not null check (assurance in ('session', 'fresh')),
	target jsonb,
	created_at timestamptz not null default now()
);

create table access_control.user_permissions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	module text not null,
	level integer not null default 1,
	mess_hall_id bigint references kitchen.mess_halls(id) on delete cascade,
	kitchen_id bigint references kitchen.kitchen(id) on delete cascade,
	unit_id bigint references core.units(id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz,
	constraint exclusive_scope check (num_nonnulls(mess_hall_id, kitchen_id, unit_id) <= 1)
);
create unique index user_permissions_allow_uniq on access_control.user_permissions (user_id, module, mess_hall_id, kitchen_id, unit_id) nulls not distinct where level > 0;
create unique index user_permissions_deny_uniq on access_control.user_permissions (user_id, module, mess_hall_id, kitchen_id, unit_id) nulls not distinct where level <= 0;

create table access_control.policy (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	description text,
	managed boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz,
	deleted_at timestamptz
);
create unique index policy_name_unique_alive_idx on access_control.policy (name) where deleted_at is null;

create table access_control.policy_statement (
	id uuid primary key default gen_random_uuid(),
	policy_id uuid not null references access_control.policy(id) on delete cascade,
	module text not null,
	level smallint not null check (level >= 0 and level <= 3),
	unit_id bigint references core.units(id),
	kitchen_id bigint references kitchen.kitchen(id),
	mess_hall_id bigint references kitchen.mess_halls(id),
	created_at timestamptz not null default now(),
	constraint policy_statement_single_scope_check check (num_nonnulls(unit_id, kitchen_id, mess_hall_id) <= 1)
);

-- Sem FK para auth.users em `user_id`: é assim em produção.
create table access_control.user_policy_attachment (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null,
	policy_id uuid not null references access_control.policy(id) on delete cascade,
	created_at timestamptz not null default now(),
	created_by uuid,
	expires_at timestamptz,
	constraint user_policy_attachment_unique unique (user_id, policy_id)
);

create table access_control.mcp_api_keys (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	label text not null,
	key_hash text not null unique,
	key_prefix text not null,
	is_active boolean not null default true,
	last_used_at timestamptz,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default (now() + interval '90 days')
);

create type forms.response_scope_mode as enum ('global', 'scoped');
create type forms.response_scope_effect as enum ('allow', 'deny');
create table forms.questionnaire (id uuid primary key default gen_random_uuid(), created_by uuid);
create table forms.response_viewer (
	id uuid primary key default gen_random_uuid(),
	questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
	viewer_id uuid not null references auth.users(id) on delete cascade,
	viewer_email text not null,
	added_by uuid not null references auth.users(id),
	created_at timestamptz not null default now(),
	scope_mode forms.response_scope_mode not null default 'global',
	unique (questionnaire_id, viewer_id)
);
create table forms.response_viewer_scope_binding (
	id uuid primary key default gen_random_uuid(),
	response_viewer_id uuid not null references forms.response_viewer(id) on delete cascade,
	attribute_key text not null check (attribute_key = 'om'),
	effect forms.response_scope_effect not null,
	value text not null,
	created_at timestamptz not null default now(),
	unique (response_viewer_id, attribute_key, effect, value)
);
create table forms.questionnaire_editor (
	id uuid primary key default gen_random_uuid(),
	questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
	editor_id uuid not null references auth.users(id) on delete cascade,
	editor_email text not null,
	added_by uuid not null references auth.users(id),
	created_at timestamptz not null default now(),
	unique (questionnaire_id, editor_id)
);

create table journal.user_profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	role text not null default 'author' check (role in ('author', 'editor', 'reviewer')),
	full_name text not null,
	updated_at timestamptz not null default now()
);

-- O trigger de cadastro, igual ao de produção.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
	insert into journal.user_profiles (id, full_name, role)
		values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'author')
		on conflict (id) do nothing;
	return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Privilégios de tabela da service role, como no Supabase.
grant select, insert, update, delete on all tables in schema access_control, forms, journal to service_role;
grant select on all tables in schema auth, core, kitchen to service_role;
