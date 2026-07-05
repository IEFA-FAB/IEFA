-- assignment_selection_access_grant
-- App: @iefa/assignment-selection — controle de acesso (PBAC) do painel /controller.
-- O telão "/" é público; o painel de controle exige um usuário autenticado E com
-- concessão de acesso registrada aqui. Hoje só nannijpsn@fab.mil.br tem acesso.

create table assignment_selection.access_grant (
	email text primary key,
	role text not null default 'operator' check (role in ('admin', 'operator')),
	active boolean not null default true,
	created_at timestamptz not null default now()
);

-- Acesso só via service_role (server functions). Sem leitura pública/autenticada:
-- a verificação de autorização acontece no servidor, evitando enumeração de e-mails.
alter table assignment_selection.access_grant enable row level security;
revoke select on assignment_selection.access_grant from anon, authenticated;
grant all on assignment_selection.access_grant to service_role;

-- Seed: único operador com acesso hoje.
insert into assignment_selection.access_grant (email, role) values ('nannijpsn@fab.mil.br', 'admin');
