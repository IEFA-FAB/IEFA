-- 20260926218000 (legacy_access_profiles): profiles_admin arquivada fora do alcance de cliente,
-- cadastro do Auth sem perfil do journal, perfil nascendo no primeiro uso pela função auditada,
-- painel editorial com submissão de quem não tem perfil. Roda depois de phase2.test.sql: semeia o
-- estado de antes e aplica a migration DUAS vezes, pelos dois caminhos:
--
--   1. como em PRODUÇÃO: um papel `migrator` (o `postgres` do Supabase) dono das tabelas do app
--      mas NÃO de auth.users, que é de `supabase_auth_admin`. O DROP TRIGGER cai no
--      `insufficient_privilege`, o NOTICE sai (o run.sh confere no stderr) e o trigger segue
--      disparando o no-op como o dono do Auth, sem privilégio extra;
--   2. como dono de tudo (superusuário): o trigger e a função saem. Reaplicar é a idempotência.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

create function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
	begin
		execute p_sql;
	exception when others then
		if sqlerrm is distinct from p_msg then
			raise exception 'esperava %, veio % (%) em: %', p_msg, sqlerrm, sqlstate, p_sql;
		end if;
		return;
	end;
	raise exception 'esperava %, mas passou: %', p_msg, p_sql;
end;
$$;

-- ── Antes: como produção em 2026-09-26 ──────────────────────────────────────
insert into auth.users (id, email) values
	('00000000-0000-0000-0000-0000000000a1', 'admin.antigo@x'),
	('00000000-0000-0000-0000-0000000000a2', 'nunca.usou@x'),
	('00000000-0000-0000-0000-0000000000a3', 'autora@x');
insert into access_control.profiles_admin (id, saram, name, email, role, om)
	values ('00000000-0000-0000-0000-0000000000a1', '1234567', 'Admin Antigo', 'admin.antigo@x', 'superadmin', 'IEFA');
do $$ begin
	-- o trigger antigo criou perfil para os três; a3 submeteu um artigo
	assert (select count(*) from journal.user_profiles where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3')) = 3;
end $$;
insert into journal.articles (id, submitter_id, submission_number, title_pt, title_en, status, submitted_at)
	values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'S-1', 'Com perfil', 'With profile', 'submitted', now());

-- ── Papéis como no Supabase ─────────────────────────────────────────────────
create role supabase_auth_admin nologin;
create role migrator nologin;
alter schema auth owner to supabase_auth_admin;
alter table auth.users owner to supabase_auth_admin;
-- O `postgres` do Supabase: dono do que as migrations criaram, só TRIGGER em auth.users.
grant create on database access_audit to migrator;
grant usage on schema auth to migrator;
grant trigger on auth.users to migrator;
grant usage, create on schema public, journal, access_control to migrator;
grant select on journal.articles, journal.review_assignments, journal.user_profiles to migrator;
alter table access_control.profiles_admin owner to migrator;
alter type public."userLevels" owner to migrator;
alter view journal.editorial_dashboard owner to migrator;
alter function public.handle_new_user() owner to migrator;

-- ── 1. Caminho de produção: sem posse de auth.users ─────────────────────────
set role migrator;
set client_min_messages = notice;
\ir ../../supabase/migrations/20260926218000_legacy_access_profiles.sql
set client_min_messages = warning;
reset role;

do $$
declare fn record;
begin
	assert exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'), 'sem posse, o trigger fica';
	select p.prosrc, p.prosecdef, p.proconfig into fn from pg_proc p where p.oid = 'public.handle_new_user()'::regprocedure;
	assert fn.prosrc !~* 'insert', 'a função virou no-op';
	assert not fn.prosecdef, 'no-op é security invoker';
	assert fn.proconfig = array['search_path=""'], 'search_path vazio';
	-- o resto da migration valeu mesmo sem a posse
	assert to_regclass('legacy_access.profiles_admin') is not null;
	assert (select relowner from pg_class where oid = 'legacy_access.profiles_admin'::regclass) = 'migrator'::regrole;
end $$;

-- O cadastro, como o GoTrue faz: o dono de auth.users insere, o trigger roda o no-op com o
-- privilégio dele — que não tem nada em journal nem grant na função.
set role supabase_auth_admin;
insert into auth.users (id, email, raw_user_meta_data)
	values ('00000000-0000-0000-0000-0000000000a5', 'cadastro.gotrue@x', '{"full_name":"Cadastro GoTrue"}');
reset role;
do $$ begin
	assert not exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a5'), 'cadastro pelo dono do Auth não cria perfil';
end $$;

-- ── 2. Como dono de tudo: trigger e função saem; reaplicação idempotente ────
\ir ../../supabase/migrations/20260926218000_legacy_access_profiles.sql

-- ── profiles_admin arquivada, linhas intactas, sem acesso de cliente ────────
do $$ begin
	assert to_regclass('access_control.profiles_admin') is null, 'saiu de access_control';
	assert to_regclass('legacy_access.profiles_admin') is not null, 'está em legacy_access';
	assert (select role::text from legacy_access.profiles_admin where id = '00000000-0000-0000-0000-0000000000a1') = 'superadmin', 'linha preservada';
	assert to_regtype('public."userLevels"') is null and to_regtype('legacy_access."userLevels"') is not null, 'enum foi junto';
	assert not has_schema_privilege('anon', 'legacy_access', 'USAGE');
	assert not has_schema_privilege('authenticated', 'legacy_access', 'USAGE');
	assert not has_schema_privilege('service_role', 'legacy_access', 'USAGE');
	assert not has_table_privilege('service_role', 'legacy_access.profiles_admin', 'SELECT'), 'service_role perdeu o grant que tinha';
	assert not has_table_privilege('authenticated', 'legacy_access.profiles_admin', 'SELECT');
	assert obj_description('legacy_access.profiles_admin'::regclass, 'pg_class') like '%DROP%2026-12-26%', 'comentário diz quando apagar';
	-- a FK segue: quem sai do Auth sai do arquivo
	assert exists (select 1 from pg_constraint where conrelid = 'legacy_access.profiles_admin'::regclass and contype = 'f' and confdeltype = 'c');
end $$;

-- ── Cadastro não cria perfil; os que existiam ficam ─────────────────────────
insert into auth.users (id, email, raw_user_meta_data)
	values ('00000000-0000-0000-0000-0000000000a4', 'nova.pessoa@x', '{"full_name":"Nova Pessoa"}');
do $$ begin
	assert not exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a4'), 'cadastro não cria perfil';
	assert exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'perfil existente não foi apagado pela migration';
	-- aqui o dono de auth.users roda a migration: trigger e função saem
	assert not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created');
	assert to_regprocedure('public.handle_new_user()') is null;
end $$;

-- ── Sem perfil: leitura vazia, papel recusado com frase ─────────────────────
do $$ begin
	perform pg_temp.expect_error($q$ select journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'reviewer') $q$, 'PROFILE_NOT_FOUND');
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4', 'update', '{"bio":"x"}') $q$, 'PROFILE_NOT_FOUND');
	-- nome é obrigatório: o perfil não nasce vazio
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4', 'upsert', '{"bio":"x"}') $q$, 'PROFILE_FIELD_INVALID');
end $$;

-- ── Submissão de quem ainda não tem perfil aparece no painel ────────────────
insert into journal.articles (id, submitter_id, submission_number, title_pt, title_en, status, submitted_at)
	values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a4', 'S-2', 'Sem perfil', 'Without profile', 'submitted', now());
do $$ begin
	assert (select count(*) from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b2' and submitter_name is null) = 1, 'LEFT JOIN: sem perfil, com nome nulo';
	assert (select submitter_name from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b1') = 'autora', 'com perfil, com nome';
	assert (select reloptions from pg_class where oid = 'journal.editorial_dashboard'::regclass) = array['security_invoker=on'];
	assert (select title_pt from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b1') = 'Com perfil', 'title_pt na view';
	-- as colunas de antes, na mesma ordem, e title_pt no fim
	assert (
		select array_agg(attname::text order by attnum)
		from pg_attribute
		where attrelid = 'journal.editorial_dashboard'::regclass and attnum > 0
	) = array['id', 'submission_number', 'title_en', 'status', 'article_type', 'subject_area', 'submitted_at', 'days_since_submission', 'submitter_name', 'completed_reviews', 'pending_reviews', 'title_pt'];
end $$;

-- ── Primeiro uso do journal: perfil pela função auditada, papel author ──────
do $$
declare r jsonb; n bigint := (select count(*) from access_control.sensitive_operation_log);
begin
	r := journal.save_user_profile('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4', 'upsert', '{"full_name":"Nova Pessoa"}');
	assert r ->> 'role' = 'author' and r ->> 'full_name' = 'Nova Pessoa';
	assert (select count(*) from access_control.sensitive_operation_log) = n, 'author não é concessão: sem log';
	assert (select submitter_name from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b2') = 'Nova Pessoa';
	-- e a partir daí o papel troca pela função auditada, com log
	perform journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'reviewer');
	assert (select count(*) from access_control.sensitive_operation_log) = n + 1;
end $$;

-- ── Proposta do PR: apagar os perfis `author` ociosos (decisão do mantenedor) ─
-- A mesma query do PR. `author` fica fora do trigger de recusa (DELETE só é vigiado para quem
-- não é author), então não precisa de bypass.
do $$
declare v_deleted bigint;
begin
	with idle as (
		select p.id
		from journal.user_profiles p
		where p.role = 'author'
			and not exists (select 1 from journal.articles a where a.submitter_id = p.id)
			and not exists (select 1 from journal.article_versions v where v.uploaded_by = p.id)
			and not exists (select 1 from journal.review_assignments r where r.reviewer_id = p.id or r.invited_by = p.id)
			and not exists (select 1 from journal.article_events e where e.user_id = p.id)
			and not exists (select 1 from journal.notifications n where n.user_id = p.id)
	)
	delete from journal.user_profiles p using idle where p.id = idle.id;
	get diagnostics v_deleted = row_count;
	assert v_deleted > 0;
	assert not exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'ocioso saiu';
	assert exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a3'), 'quem submeteu fica';
	assert exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000a4'), 'revisor fica (não é author)';
end $$;

\echo 'legacy_access_profiles: OK'
