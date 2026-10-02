-- Esqueleto de `assignment_selection` como está em produção (conferido no catálogo em
-- 2026-10-01), para validar 20261001150000 e 20261001150100 por `run.sh`. NÃO é migration.
-- Roda depois da fase 2: a semente abaixo é o estado ANTERIOR às migrations (sem trigger).

create schema assignment_selection;
grant usage on schema assignment_selection to anon, authenticated, service_role;

create table assignment_selection.access_grant (
	email text primary key,
	role text not null default 'operator' check (role in ('admin', 'operator')),
	active boolean not null default true,
	created_at timestamptz not null default now()
);
alter table assignment_selection.access_grant enable row level security;
grant all on assignment_selection.access_grant to service_role;

create table assignment_selection.edition (
	id uuid primary key default gen_random_uuid(),
	name text not null unique,
	active boolean not null default false,
	locked boolean not null default false,
	created_at timestamptz not null default now()
);
create table assignment_selection.person (
	id bigint primary key,
	edition_id uuid not null references assignment_selection.edition(id) on delete cascade,
	classificacao bigint not null,
	nome text not null,
	localidade text,
	estado text,
	show_card boolean not null default false,
	show_om boolean not null default false,
	hide_card boolean not null default false,
	created_at timestamptz not null default now()
);
alter table assignment_selection.edition enable row level security;
alter table assignment_selection.person enable row level security;
create policy "public read edition" on assignment_selection.edition for select to anon, authenticated using (true);
create policy "public read person" on assignment_selection.person for select to anon, authenticated using (true);
grant select on assignment_selection.edition, assignment_selection.person to anon, authenticated;
grant all on assignment_selection.edition, assignment_selection.person to service_role;

-- Estado de antes: o dono atual mais uma concessão extra (que a migration tem de desativar).
insert into assignment_selection.access_grant (email, role) values
	('nannijpsn@fab.mil.br', 'admin'),
	('outro@fab.mil.br', 'operator');

insert into assignment_selection.edition (id, name, active) values
	('00000000-0000-0000-0000-000000002025', '2025', false),
	('00000000-0000-0000-0000-000000002026', '2026', true);
insert into assignment_selection.person (id, edition_id, classificacao, nome, hide_card) values
	(1, '00000000-0000-0000-0000-000000002025', 1, 'Antigo', true),
	(2, '00000000-0000-0000-0000-000000002026', 1, 'Atual', false),
	(3, '00000000-0000-0000-0000-000000002026', 2, 'Confirmado', true);
