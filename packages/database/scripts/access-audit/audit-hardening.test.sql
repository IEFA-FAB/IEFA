-- 20261001140000…140300: log de auditoria append-only, TRUNCATE nas tabelas vigiadas, troca de
-- e-mail em auth.users e as portas inertes (policies `using (true)` sem grant, default de
-- privilégios em `storage`). Roda depois de signup-allowlist.test.sql (a allowlist, o hook e as
-- funções auditadas já existem). Aplica cada migration DUAS vezes (idempotência) e prova:
--
--   * o log só aceita INSERT — UPDATE/DELETE/TRUNCATE recusados para todo mundo, e o único
--     DELETE que passa é o do faxineiro de fixtures (bypass + conta @example.invalid);
--   * TRUNCATE em tabela vigiada é recusado sem o bypass, inclusive em cascata;
--   * trocar e-mail para fora de @fab.mil.br sem autorização é recusado, e nada do que o GoTrue
--     faz sem trocar e-mail (login, refresh, recovery, limpeza de email_change, ofuscação) é;
--   * as policies inertes somem e objeto novo do `postgres` em `storage` nasce fechado.

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

create function pg_temp.expect_sqlstate(p_sql text, p_state text) returns void language plpgsql as $$
begin
	begin
		execute p_sql;
	exception when others then
		if sqlstate is distinct from p_state then
			raise exception 'esperava sqlstate %, veio % (%) em: %', p_state, sqlstate, sqlerrm, p_sql;
		end if;
		return;
	end;
	raise exception 'esperava sqlstate %, mas passou: %', p_state, p_sql;
end;
$$;

/** Roda `p_sql` e desfaz (exceção de sentinela), devolvendo se passou. */
create function pg_temp.passes(p_sql text) returns boolean language plpgsql as $$
begin
	begin
		execute p_sql;
		raise exception using errcode = 'P0099', message = 'sentinela';
	exception
		when sqlstate 'P0099' then return true;
	end;
end;
$$;

-- ── Esqueleto do que o stub não tem ─────────────────────────────────────────
-- Colunas de auth.users que o GoTrue usa nos fluxos testados.
alter table auth.users add column if not exists email_change text default '';
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists recovery_token text default '';

-- 20260911120200, como em produção.
create table if not exists access_control.mfa_reset_log (
	id             uuid primary key default gen_random_uuid(),
	target_user_id uuid not null references auth.users(id) on delete restrict,
	performed_by   uuid not null references auth.users(id) on delete restrict,
	method         text not null check (method in ('recovery-code', 'admin-reset')),
	reason         text,
	created_at     timestamptz not null default now()
);
alter table access_control.mfa_reset_log enable row level security;
-- O default `arwdDxtm` do schema que produção tinha.
grant all on table access_control.sensitive_operation_log, access_control.mfa_reset_log to service_role;

-- `rumaer`, `core.measure_unit` e o default de `storage`, como estavam em produção em 2026-10-01.
create schema if not exists rumaer;
create schema if not exists storage;
do $$
declare t text;
begin
	foreach t in array array['piece', 'piece_item', 'uniform', 'uniform_category', 'uniform_variant', 'uniform_variant_image', 'uniform_variant_piece'] loop
		execute format('create table if not exists rumaer.%I (id uuid primary key)', t);
		execute format('alter table rumaer.%I enable row level security', t);
		execute format('drop policy if exists %I on rumaer.%I', 'public read ' || t, t);
		execute format('create policy %I on rumaer.%I for select to anon, authenticated using (true)', 'public read ' || t, t);
	end loop;
end $$;
create table if not exists core.measure_unit (code text primary key);
alter table core.measure_unit enable row level security;
drop policy if exists measure_unit_read on core.measure_unit;
create policy measure_unit_read on core.measure_unit for select to anon, authenticated using (true);
-- O default global do dono desde 20260920210000: função nova não nasce executável por PUBLIC.
alter default privileges for role postgres revoke execute on routines from public;
alter default privileges for role postgres in schema storage grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema storage grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema storage grant all on routines to postgres, anon, authenticated, service_role;

insert into auth.users (id, email) values
	('00000000-0000-0000-0000-0000000007d1', 'admin.hardening@fab.mil.br'),
	('00000000-0000-0000-0000-0000000007d2', 'cabo.silva@fab.mil.br'),
	('00000000-0000-0000-0000-0000000007d3', 'legado@empresa.com.br'),
	('00000000-0000-0000-0000-0000000007d4', 'test-abc123def4-1@example.invalid'),
	('00000000-0000-0000-0000-0000000007d5', 'test-abc123def4-2@example.invalid');

-- ═════════════════════════════════════════════════════════════════════════════
-- 20261001140000 — log append-only
-- ═════════════════════════════════════════════════════════════════════════════

\ir ../../supabase/migrations/20261001140000_audit_log_append_only.sql
\ir ../../supabase/migrations/20261001140000_audit_log_append_only.sql

insert into access_control.sensitive_operation_log (id, actor_id, operation, assurance, target) values
	('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000007d1', 'hardening.real', 'session', '{}'),
	('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000007d4', 'hardening.fixture', 'session', '{}');
insert into access_control.mfa_reset_log (id, target_user_id, performed_by, method, reason) values
	('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007d1', 'admin-reset', 'perdeu o celular'),
	('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-0000000007d4', '00000000-0000-0000-0000-0000000007d5', 'admin-reset', 'fixture'),
	-- Alvo de fixture, mas quem executou é real: a prova do ato dele não sai pela faxina.
	('00000000-0000-0000-0000-00000000e103', '00000000-0000-0000-0000-0000000007d4', '00000000-0000-0000-0000-0000000007d1', 'admin-reset', 'misto');

-- Privilégios: INSERT e SELECT ficam; o resto só com o dono.
do $$
declare r text; t text;
begin
	foreach t in array array['access_control.sensitive_operation_log', 'access_control.mfa_reset_log'] loop
		assert has_table_privilege('service_role', t, 'INSERT') and has_table_privilege('service_role', t, 'SELECT'), t || ': service_role insere e lê';
		foreach r in array array['service_role', 'authenticated', 'anon'] loop
			assert not has_table_privilege(r, t, 'UPDATE'), t || ': ' || r || ' sem UPDATE';
			assert not has_table_privilege(r, t, 'DELETE'), t || ': ' || r || ' sem DELETE';
			assert not has_table_privilege(r, t, 'TRUNCATE'), t || ': ' || r || ' sem TRUNCATE';
		end loop;
	end loop;
	assert not has_function_privilege('service_role', 'access_control.refuse_audit_log_change()', 'EXECUTE');
	assert not has_function_privilege('anon', 'access_control.refuse_audit_log_change()', 'EXECUTE');
end $$;

-- service_role: barrado já no privilégio.
set role service_role;
do $$ begin
	perform pg_temp.expect_error($q$ delete from access_control.sensitive_operation_log $q$, 'permission denied for table sensitive_operation_log');
	perform pg_temp.expect_error($q$ update access_control.mfa_reset_log set reason = 'x' $q$, 'permission denied for table mfa_reset_log');
	perform pg_temp.expect_error($q$ truncate access_control.sensitive_operation_log $q$, 'permission denied for table sensitive_operation_log');
end $$;
-- Mas continua gravando o log (é o caminho das funções auditadas).
insert into access_control.sensitive_operation_log (actor_id, operation, assurance, target)
	values ('00000000-0000-0000-0000-0000000007d1', 'hardening.service_role', 'session', '{}');
reset role;

-- O dono (aqui, o superusuário do cluster): barrado pelo trigger.
do $$ begin
	perform pg_temp.expect_error($q$ update access_control.sensitive_operation_log set operation = 'x' where id = '00000000-0000-0000-0000-00000000e001' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ delete from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e001' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ truncate access_control.sensitive_operation_log $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ update access_control.mfa_reset_log set reason = 'x' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ delete from access_control.mfa_reset_log $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ truncate access_control.mfa_reset_log $q$, 'AUDIT_LOG_APPEND_ONLY');
	-- Nem o contexto de função auditada abre: auditar não é reescrever o log.
	perform set_config('iefa.audit_operation', 'hardening.test', true);
	perform pg_temp.expect_error($q$ delete from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e002' $q$, 'AUDIT_LOG_APPEND_ONLY');
end $$;

-- Com o bypass: só DELETE de linha cujos usuários são TODOS de fixture.
do $$ begin
	perform set_config('iefa.audit_bypass', 'purge-test-fixtures', true);
	perform pg_temp.expect_error($q$ delete from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e001' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ update access_control.sensitive_operation_log set operation = 'x' where id = '00000000-0000-0000-0000-00000000e002' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ truncate access_control.sensitive_operation_log $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ delete from access_control.mfa_reset_log where id = '00000000-0000-0000-0000-00000000e103' $q$, 'AUDIT_LOG_APPEND_ONLY');
	perform pg_temp.expect_error($q$ delete from access_control.mfa_reset_log where id = '00000000-0000-0000-0000-00000000e101' $q$, 'AUDIT_LOG_APPEND_ONLY');

	delete from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e002';
	delete from access_control.mfa_reset_log where id = '00000000-0000-0000-0000-00000000e102';
	assert not exists (select 1 from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e002'), 'linha de fixture sai';
	assert not exists (select 1 from access_control.mfa_reset_log where id = '00000000-0000-0000-0000-00000000e102'), 'linha de fixture sai';
	assert exists (select 1 from access_control.sensitive_operation_log where id = '00000000-0000-0000-0000-00000000e001'), 'linha real fica';
	assert exists (select 1 from access_control.mfa_reset_log where id = '00000000-0000-0000-0000-00000000e103'), 'linha mista fica';
end $$;

-- A função auditada continua gravando o log.
do $$
declare n bigint := (select count(*) from access_control.sensitive_operation_log); r jsonb;
begin
	r := access_control.authorize_external_signup('00000000-0000-0000-0000-0000000007d1', 'hardening.authorize', 'parceiro.hardening@gs1br.org', 'parceria GS1 Brasil — teste');
	assert (select count(*) from access_control.sensitive_operation_log) = n + 1, 'função auditada grava o log';
end $$;

\echo 'audit-log append-only: OK'

-- ═════════════════════════════════════════════════════════════════════════════
-- 20261001140100 — TRUNCATE nas tabelas vigiadas
-- ═════════════════════════════════════════════════════════════════════════════

-- Antes: TRUNCATE passava por cima do trigger de linha.
do $$ begin
	assert pg_temp.passes($q$ truncate access_control.user_permissions $q$), 'antes da migration o TRUNCATE escapava';
end $$;

\ir ../../supabase/migrations/20261001140100_access_tables_truncate_guard.sql
\ir ../../supabase/migrations/20261001140100_access_tables_truncate_guard.sql

do $$
declare t text;
begin
	foreach t in array array[
		'access_control.user_permissions', 'access_control.policy', 'access_control.policy_statement',
		'access_control.user_policy_attachment', 'access_control.mcp_api_keys', 'access_control.signup_allowlist',
		'forms.response_viewer', 'forms.response_viewer_scope_binding', 'forms.questionnaire_editor', 'journal.user_profiles'
	] loop
		perform pg_temp.expect_error(format('truncate %s cascade', t), 'ACCESS_CHANGE_UNAUDITED');
	end loop;
	-- Cascata a partir de quem não é vigiado também é recusada (o trigger de cada tabela alcançada dispara).
	perform pg_temp.expect_sqlstate($q$ truncate auth.users cascade $q$, '42501');
	assert not has_function_privilege('service_role', 'access_control.refuse_unaudited_truncate()', 'EXECUTE');
end $$;

-- O contexto de função auditada NÃO libera TRUNCATE; o bypass explícito, sim.
do $$ begin
	perform set_config('iefa.audit_operation', 'hardening.test', true);
	perform pg_temp.expect_error($q$ truncate access_control.user_permissions $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform set_config('iefa.audit_operation', '', true);
	perform set_config('iefa.audit_bypass', 'hardening: manutenção', true);
	assert pg_temp.passes($q$ truncate access_control.user_permissions $q$), 'bypass explícito libera';
end $$;

\echo 'truncate guard: OK'

-- ═════════════════════════════════════════════════════════════════════════════
-- 20261001140200 — troca de e-mail em auth.users
-- ═════════════════════════════════════════════════════════════════════════════

-- O GoTrue grava auth.users como supabase_auth_admin (em produção, o dono).
grant usage on schema auth to supabase_auth_admin;
grant select, update on table auth.users to supabase_auth_admin;

\ir ../../supabase/migrations/20261001140200_auth_email_change_domain_guard.sql
\ir ../../supabase/migrations/20261001140200_auth_email_change_domain_guard.sql

do $$
declare f regprocedure := 'access_control.enforce_institutional_email_change()';
begin
	assert (select prosecdef from pg_proc where oid = f), 'SECURITY DEFINER';
	assert (select pg_get_userbyid(proowner) from pg_proc where oid = f) = 'postgres', 'dono postgres';
	assert (select proconfig from pg_proc where oid = f) = array['search_path=""'], 'search_path vazio';
	assert not has_function_privilege('service_role', f, 'EXECUTE');
	assert not has_function_privilege('authenticated', f, 'EXECUTE');
	assert not has_function_privilege('anon', f, 'EXECUTE');
	assert not has_function_privilege('supabase_auth_admin', f, 'EXECUTE');
	assert (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'enforce_institutional_email') = 1, 'um trigger só, mesmo reaplicada';
end $$;

-- Recusas: para fora da FAB, subdomínio, sufixo, autorização revogada.
do $$
declare
	v_msg constant text := 'E-mail restrito a endereços institucionais @fab.mil.br. Para usar outro e-mail, peça autorização à administração do sistema.';
	v_id uuid;
begin
	perform pg_temp.expect_error($q$ update auth.users set email = 'cabo.silva@gmail.com' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);
	perform pg_temp.expect_error($q$ update auth.users set email = 'cabo.silva@evil.fab.mil.br' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);
	perform pg_temp.expect_error($q$ update auth.users set email = 'cabo.silva@fab.mil.br.evil.com' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);
	perform pg_temp.expect_error($q$ update auth.users set email_change = 'cabo.silva@gmail.com' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);
	perform pg_temp.expect_error($q$ update auth.users set email_change = ' Cabo.Silva@Gmail.com ' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);
	-- Conta legada fora da FAB: continua entrando, mas não troca para outro externo.
	perform pg_temp.expect_error($q$ update auth.users set email = 'legado@outra.com' where id = '00000000-0000-0000-0000-0000000007d3' $q$, v_msg);

	-- Autorização revogada não vale.
	v_id := (access_control.authorize_external_signup('00000000-0000-0000-0000-0000000007d1', 'hardening.authorize', 'revogado@parceiro.org', 'parceria encerrada — teste') ->> 'id')::uuid;
	perform access_control.revoke_external_signup('00000000-0000-0000-0000-0000000007d1', 'hardening.revoke', v_id);
	perform pg_temp.expect_error($q$ update auth.users set email = 'revogado@parceiro.org' where id = '00000000-0000-0000-0000-0000000007d2' $q$, v_msg);

	assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000007d2') = 'cabo.silva@fab.mil.br', 'nada mudou';
end $$;

-- O que NÃO pode ser recusado.
do $$ begin
	-- Login/refresh/recovery: UPDATE sem mudar endereço, inclusive em conta legada fora da FAB.
	assert pg_temp.passes($q$ update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'login de conta legada';
	assert pg_temp.passes($q$ update auth.users set recovery_token = 'abc', raw_user_meta_data = '{"x": 1}' where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'recovery de conta legada';
	assert pg_temp.passes($q$ update auth.users set email = email, email_change = email_change where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'UPDATE que regrava as mesmas colunas';
	assert pg_temp.passes($q$ update auth.users set email = 'LEGADO@Empresa.com.br' where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'mesmo endereço com outra caixa';
	-- Para @fab.mil.br, sem caixa.
	assert pg_temp.passes($q$ update auth.users set email = 'Cabo.Silva2@FAB.MIL.BR' where id = '00000000-0000-0000-0000-0000000007d2' $q$), 'troca para @fab.mil.br';
	assert pg_temp.passes($q$ update auth.users set email_change = 'cabo.novo@fab.mil.br' where id = '00000000-0000-0000-0000-0000000007d2' $q$), 'pedido de troca para @fab.mil.br';
	-- Para endereço autorizado (ativo), sem caixa — titular ou admin.
	assert pg_temp.passes($q$ update auth.users set email = 'Parceiro.Hardening@GS1BR.org' where id = '00000000-0000-0000-0000-0000000007d2' $q$), 'troca para autorizado';
	assert pg_temp.passes($q$ update auth.users set email = 'parceiro.hardening@gs1br.org' where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'conta legada para autorizado';
	-- Ofuscação da exclusão "soft" do GoTrue (hash sem @).
	assert pg_temp.passes($q$ update auth.users set email = 'hash-da-exclusao-soft-sem-arroba' where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'ofuscação';
	-- Remoção do e-mail (só telefone) — não é endereço a autorizar.
	assert pg_temp.passes($q$ update auth.users set email = null where id = '00000000-0000-0000-0000-0000000007d3' $q$), 'e-mail nulo';
end $$;

-- Troca com confirmação, de ponta a ponta, como o GoTrue (supabase_auth_admin): pede, confirma, limpa.
set role supabase_auth_admin;
update auth.users set email_change = 'cabo.confirmado@fab.mil.br' where id = '00000000-0000-0000-0000-0000000007d2';
update auth.users set email = email_change, email_change = '' where id = '00000000-0000-0000-0000-0000000007d2';
update auth.users set email_change = null where id = '00000000-0000-0000-0000-0000000007d2';
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000007d3';
do $$ begin
	perform pg_temp.expect_error($q$ update auth.users set email_change = 'cabo@gmail.com' where id = '00000000-0000-0000-0000-0000000007d2' $q$, 'E-mail restrito a endereços institucionais @fab.mil.br. Para usar outro e-mail, peça autorização à administração do sistema.');
end $$;
-- O definer lê a allowlist inteira, não só o que o GoTrue enxerga.
update auth.users set email_change = 'parceiro.hardening@gs1br.org' where id = '00000000-0000-0000-0000-0000000007d2';
reset role;

do $$ begin
	assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000007d2') = 'cabo.confirmado@fab.mil.br', 'confirmação aplicou';
	assert (select email_change from auth.users where id = '00000000-0000-0000-0000-0000000007d2') = 'parceiro.hardening@gs1br.org';
end $$;

\echo 'auth email guard: OK'

-- ═════════════════════════════════════════════════════════════════════════════
-- 20261001140300 — policies inertes e default de storage
-- ═════════════════════════════════════════════════════════════════════════════

\ir ../../supabase/migrations/20261001140300_drop_inert_policies_and_storage_defaults.sql
\ir ../../supabase/migrations/20261001140300_drop_inert_policies_and_storage_defaults.sql

do $$ begin
	assert not exists (select 1 from pg_policies where schemaname = 'rumaer'), 'policies do rumaer removidas';
	assert not exists (select 1 from pg_policies where schemaname = 'core' and tablename = 'measure_unit'), 'policy de measure_unit removida';
	assert not exists (
		select 1 from pg_default_acl d, unnest(d.defaclacl) a
		where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'storage'::regnamespace and a::text ~ '^(anon|authenticated)='
	), 'default de storage sem cliente';
end $$;

create table storage.hardening_probe (id serial primary key);
create function storage.hardening_probe_fn() returns int language sql set search_path = '' as $$ select 1 $$;
do $$ begin
	assert not has_table_privilege('anon', 'storage.hardening_probe', 'SELECT'), 'tabela nova em storage: anon sem SELECT';
	assert not has_table_privilege('authenticated', 'storage.hardening_probe', 'INSERT'), 'tabela nova em storage: authenticated sem INSERT';
	assert not has_sequence_privilege('anon', 'storage.hardening_probe_id_seq', 'USAGE'), 'sequência nova em storage fechada';
	assert not has_function_privilege('anon', 'storage.hardening_probe_fn()', 'EXECUTE'), 'função nova em storage: anon sem EXECUTE';
	assert has_table_privilege('service_role', 'storage.hardening_probe', 'SELECT'), 'service_role continua';
end $$;
drop function storage.hardening_probe_fn();
drop table storage.hardening_probe;

\echo 'audit-hardening: verde'
