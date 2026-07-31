-- Políticas nomeadas de acesso — modelo AWS IAM.
--
--   policy                  → política nomeada (a "managed policy")
--   policy_statement        → N statements por política, cada um com a MESMA forma de um
--                             grant: (module, level, no máximo um escopo)
--   user_policy_attachment  → anexo política ↔ usuário
--
-- `access_control.user_permissions` continua existindo e é a *inline policy*: grant direto,
-- exatamente como na AWS. As permissões efetivas são a união das duas origens, com deny
-- (level 0) de precedência absoluta — ver packages/pbac/src/effective-permissions.ts.
--
-- Dois níveis, não três: uma managed policy da AWS JÁ É o conjunto de permissões; não existe
-- "policy set" agrupando policies. O agrupamento se dá anexando N políticas ao principal.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

-- ─── Política ────────────────────────────────────────────────────────────────

create table if not exists access_control.policy (
	id          uuid primary key default gen_random_uuid(),
	name        text not null,
	description text,
	-- Política criada por seed: imutável pela UI. Impede que alguém edite a política que
	-- define o ambiente de treino e produza um "Conjunto Treino" que escreve em produção.
	managed     boolean not null default false,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz,
	deleted_at  timestamptz
);

-- Nome único entre as políticas VIVAS. Índice parcial porque o soft delete não deve
-- bloquear a reutilização do nome (mesmo motivo do resto do schema).
create unique index if not exists policy_name_unique_alive_idx
	on access_control.policy (name)
	where deleted_at is null;

-- ─── Statements ──────────────────────────────────────────────────────────────

create table if not exists access_control.policy_statement (
	id           uuid primary key default gen_random_uuid(),
	policy_id    uuid not null references access_control.policy (id) on delete cascade,
	module       text not null,
	level        smallint not null,
	unit_id      bigint references core.units (id),
	kitchen_id   bigint references core.kitchen (id),
	mess_hall_id bigint references core.mess_halls (id),
	created_at   timestamptz not null default now(),
	-- Mesma regra de user_permissions: no máximo um escopo por linha. Sem isto, um statement
	-- com dois escopos teria significado indefinido na resolução.
	constraint policy_statement_single_scope_check
		check (
			(case when unit_id      is not null then 1 else 0 end) +
			(case when kitchen_id   is not null then 1 else 0 end) +
			(case when mess_hall_id is not null then 1 else 0 end) <= 1
		),
	constraint policy_statement_level_check check (level between 0 and 3)
);

create index if not exists policy_statement_policy_idx
	on access_control.policy_statement (policy_id);

-- ─── Anexo a usuário ─────────────────────────────────────────────────────────

create table if not exists access_control.user_policy_attachment (
	id         uuid primary key default gen_random_uuid(),
	user_id    uuid not null,
	policy_id  uuid not null references access_control.policy (id) on delete cascade,
	created_at timestamptz not null default now(),
	created_by uuid,
	constraint user_policy_attachment_unique unique (user_id, policy_id)
);

-- Lookup do caminho quente: resolver as permissões efetivas de UM usuário.
create index if not exists user_policy_attachment_user_idx
	on access_control.user_policy_attachment (user_id);
create index if not exists user_policy_attachment_policy_idx
	on access_control.user_policy_attachment (policy_id);

-- ─── RLS deny-all ────────────────────────────────────────────────────────────
-- Sem policy: acesso exclusivo pela service key (server functions). Estas tabelas DEFINEM
-- a autorização — leitura por cliente já é divulgação de superfície de ataque.

alter table access_control.policy                 enable row level security;
alter table access_control.policy_statement       enable row level security;
alter table access_control.user_policy_attachment enable row level security;

comment on table access_control.policy is
	'Política nomeada de acesso (managed policy, modelo IAM). RLS ligada sem policy: acesso exclusivo via service key.';
comment on table access_control.policy_statement is
	'Statements de uma política: (module, level, no máximo um escopo). Mesma forma de um grant em user_permissions.';
comment on table access_control.user_policy_attachment is
	'Anexo política ↔ usuário. As permissões efetivas são a união dos statements anexados com os grants inline de user_permissions.';
