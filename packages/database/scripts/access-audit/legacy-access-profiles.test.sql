-- 20260926218000 (legacy_access_profiles): profiles_admin arquivada fora do alcance de cliente,
-- cadastro do Auth sem perfil do journal, perfil nascendo no primeiro uso pela função auditada,
-- painel editorial com submissão de quem não tem perfil. Roda depois de phase2.test.sql: semeia o
-- estado de antes, aplica a migration DUAS vezes (idempotência) e confere o de depois.

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
insert into journal.articles (id, submitter_id, submission_number, title_en, status, submitted_at)
	values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'S-1', 'With profile', 'submitted', now());

\ir ../../supabase/migrations/20260926218000_legacy_access_profiles.sql
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
insert into journal.articles (id, submitter_id, submission_number, title_en, status, submitted_at)
	values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a4', 'S-2', 'Without profile', 'submitted', now());
do $$ begin
	assert (select count(*) from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b2' and submitter_name is null) = 1, 'LEFT JOIN: sem perfil, com nome nulo';
	assert (select submitter_name from journal.editorial_dashboard where id = '00000000-0000-0000-0000-0000000000b1') = 'autora', 'com perfil, com nome';
	assert (select reloptions from pg_class where oid = 'journal.editorial_dashboard'::regclass) = array['security_invoker=on'];
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
