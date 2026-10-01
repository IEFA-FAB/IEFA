-- 20261001100000 (signup_allowlist), 20261001100100 (before_user_created_hook) e
-- 20261001100200 (link_own_saram). Roda depois de phase2.test.sql (o trigger de recusa já existe)
-- e de legacy-access-profiles.test.sql. Aplica cada migration DUAS vezes (idempotência) e prova:
--
--   * a autorização de e-mail externo só muda por função auditada, com UMA linha de log por
--     mudança e nenhuma quando a função recusa;
--   * o hook permite @fab.mil.br (domínio exato) e e-mail autorizado ativo, e recusa o resto —
--     inclusive executando como `supabase_auth_admin`, com o privilégio mínimo que ganhou;
--   * o vínculo de SARAM do sucont é write-once e exclusivo, como `syncUserSaram`.

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

create function pg_temp.log_count() returns bigint language sql as $$ select count(*) from access_control.sensitive_operation_log $$;

-- O role do GoTrue, como no Supabase (o teste do arquivamento já pode tê-lo criado).
do $$ begin
	create role supabase_auth_admin nologin;
exception when duplicate_object then null;
end $$;

insert into auth.users (id, email) values
	('00000000-0000-0000-0000-0000000000c1', 'admin.sisub@fab.mil.br'),
	('00000000-0000-0000-0000-0000000000c2', 'parceiro@gs1br.org');

\ir ../../supabase/migrations/20261001100000_signup_allowlist.sql
\ir ../../supabase/migrations/20261001100000_signup_allowlist.sql

-- ── Escrita direta: recusada pelo trigger ───────────────────────────────────
do $$ begin
	perform pg_temp.expect_error($q$ insert into access_control.signup_allowlist (email, reason, authorized_by) values ('x@y.org', 'motivo qualquer', '00000000-0000-0000-0000-0000000000c1') $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;

-- ── authorize_external_signup ───────────────────────────────────────────────
do $$
declare r jsonb; l access_control.sensitive_operation_log; n bigint := pg_temp.log_count();
begin
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'sem-arroba', 'parceria GS1 Brasil') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'a@b@c.org', 'parceria GS1 Brasil') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'novo@gs1br.org', 'curto') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup(null, 'authorizeExternalSignupFn', 'novo@gs1br.org', 'parceria GS1 Brasil') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'Fulano@FAB.mil.br', 'parceria GS1 Brasil') $q$, 'SIGNUP_ALLOWLIST_INSTITUTIONAL');
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000ff', 'authorizeExternalSignupFn', 'novo@gs1br.org', 'parceria GS1 Brasil') $q$, 'ACCESS_ACTOR_NOT_FOUND');
	assert not exists (select 1 from access_control.signup_allowlist), 'recusa não grava autorização';
	assert pg_temp.log_count() = n, 'recusa não grava log';

	-- e-mail normalizado: espaço e caixa somem antes de gravar
	r := access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', '  Novo.Parceiro@GS1BR.org ', ' parceria GS1 Brasil — catálogo GTIN ', 'fresh');
	assert r ->> 'email' = 'novo.parceiro@gs1br.org', 'e-mail normalizado';
	assert r ->> 'reason' = 'parceria GS1 Brasil — catálogo GTIN', 'motivo sem espaço nas pontas';
	assert (r ->> 'authorized_by')::uuid = '00000000-0000-0000-0000-0000000000c1';
	assert pg_temp.log_count() = n + 1, 'uma linha de log';
	select * into l from access_control.sensitive_operation_log order by ctid desc limit 1;
	assert l.operation = 'authorizeExternalSignupFn' and l.assurance = 'fresh' and l.actor_id = '00000000-0000-0000-0000-0000000000c1';
	assert l.target ->> 'action' = 'grant' and l.target ->> 'email' = 'novo.parceiro@gs1br.org' and (l.target ->> 'allowlist_id')::uuid = (r ->> 'id')::uuid;
	assert (r ->> 'log_id')::uuid = l.id;

	-- já ativa: erro legível, sem segunda linha nem segundo log
	perform pg_temp.expect_error($q$ select access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'novo.parceiro@gs1br.org', 'de novo, outro motivo') $q$, 'SIGNUP_ALLOWLIST_ALREADY_ACTIVE');
	assert (select count(*) from access_control.signup_allowlist) = 1;
	assert pg_temp.log_count() = n + 1;
end $$;

-- ── revoke_external_signup ──────────────────────────────────────────────────
do $$
declare r jsonb; v_id uuid; l access_control.sensitive_operation_log; n bigint := pg_temp.log_count();
begin
	select a.id into v_id from access_control.signup_allowlist a where a.email = 'novo.parceiro@gs1br.org';
	perform pg_temp.expect_error($q$ select access_control.revoke_external_signup('00000000-0000-0000-0000-0000000000c1', 'revokeExternalSignupFn', '00000000-0000-0000-0000-0000000000ee') $q$, 'SIGNUP_ALLOWLIST_NOT_FOUND');
	assert pg_temp.log_count() = n;

	r := access_control.revoke_external_signup('00000000-0000-0000-0000-0000000000c1', 'revokeExternalSignupFn', v_id);
	assert (r ->> 'changed')::boolean and r ->> 'log_id' is not null;
	assert exists (select 1 from access_control.signup_allowlist a where a.id = v_id and a.revoked_at is not null and a.revoked_by = '00000000-0000-0000-0000-0000000000c1');
	assert pg_temp.log_count() = n + 1;
	select * into l from access_control.sensitive_operation_log order by ctid desc limit 1;
	assert l.operation = 'revokeExternalSignupFn' and l.target ->> 'action' = 'revoke' and l.target -> 'previous' ->> 'reason' is not null;

	-- revogar o revogado: nada acontece, nada é registrado
	r := access_control.revoke_external_signup('00000000-0000-0000-0000-0000000000c1', 'revokeExternalSignupFn', v_id);
	assert not (r ->> 'changed')::boolean and r ->> 'log_id' is null;
	assert pg_temp.log_count() = n + 1;

	-- nova autorização do mesmo e-mail é OUTRA linha; a revogada fica como histórico
	r := access_control.authorize_external_signup('00000000-0000-0000-0000-0000000000c1', 'authorizeExternalSignupFn', 'novo.parceiro@gs1br.org', 'parceria renovada em 2026');
	assert (select count(*) from access_control.signup_allowlist a where a.email = 'novo.parceiro@gs1br.org') = 2;
	assert (select count(*) from access_control.signup_allowlist a where a.email = 'novo.parceiro@gs1br.org' and a.revoked_at is null) = 1;
end $$;

-- ── Manutenção explícita: linha sem ator só com o bypass (fixture de integração) ──
begin;
select set_config('iefa.audit_bypass', 'teste de fixture', true);
insert into access_control.signup_allowlist (email, reason) values ('test-fixture@example.invalid', 'sisub integration fixture');
commit;
do $$ begin
	assert exists (select 1 from access_control.signup_allowlist where email = 'test-fixture@example.invalid' and authorized_by is null);
	-- formato: e-mail fora do normalizado não entra nem por bypass
	perform set_config('iefa.audit_bypass', 'x', true);
	perform pg_temp.expect_error($q$ insert into access_control.signup_allowlist (email, reason) values ('Maiuscula@x.org', 'sisub integration fixture') $q$,
		'new row for relation "signup_allowlist" violates check constraint "signup_allowlist_email_normalized"');
end $$;

-- ── Hook ────────────────────────────────────────────────────────────────────
\ir ../../supabase/migrations/20261001100100_before_user_created_hook.sql
\ir ../../supabase/migrations/20261001100100_before_user_created_hook.sql

create function pg_temp.hook(p_user jsonb) returns jsonb language sql as $$
	select access_control.before_user_created(jsonb_build_object(
		'metadata', jsonb_build_object('uuid', gen_random_uuid(), 'time', now(), 'name', 'before-user-created', 'ip_address', '127.0.0.1'),
		'user', p_user
	))
$$;
create function pg_temp.allowed(p_email text) returns boolean language sql as $$
	select pg_temp.hook(jsonb_build_object('email', p_email, 'is_anonymous', false, 'app_metadata', jsonb_build_object('provider', 'email'))) = '{}'::jsonb
$$;

do $$
declare refusal jsonb;
begin
	-- domínio FAB, sem caixa e com espaço nas pontas
	assert pg_temp.allowed('fulano@fab.mil.br');
	assert pg_temp.allowed('Fulano.Silva@FAB.MIL.BR');
	assert pg_temp.allowed('  ciclano@fab.mil.br ');
	-- o domínio é EXATO
	assert not pg_temp.allowed('x@fab.mil.br.evil.com'), 'sufixo depois do domínio';
	assert not pg_temp.allowed('x@evil.fab.mil.br'), 'subdomínio';
	assert not pg_temp.allowed('x@fabxmil.br'), 'ponto é literal';
	assert not pg_temp.allowed('x@fab.mil.br@evil.com'), 'dois arrobas';
	assert not pg_temp.allowed('a@b@fab.mil.br'), 'dois arrobas antes do domínio';
	assert not pg_temp.allowed('@fab.mil.br'), 'sem parte local';
	assert not pg_temp.allowed(E'x@fab.mil.br\nevil'), 'quebra de linha não encerra o domínio';
	assert not pg_temp.allowed(E'x y@fab.mil.br'), 'espaço no meio';
	assert not pg_temp.allowed('fulano@gmail.com');
	-- autorização ativa, sem caixa; a revogada e a inexistente não passam
	assert pg_temp.allowed('Novo.Parceiro@GS1BR.org');
	assert pg_temp.allowed('test-fixture@example.invalid');
	assert not pg_temp.allowed('outro@gs1br.org');
	-- sem e-mail, só telefone, anônimo
	assert pg_temp.hook(jsonb_build_object('phone', '5561999999999', 'app_metadata', jsonb_build_object('provider', 'phone'))) <> '{}'::jsonb, 'só telefone';
	assert pg_temp.hook('{}'::jsonb) <> '{}'::jsonb, 'usuário vazio';
	assert access_control.before_user_created('{}'::jsonb) <> '{}'::jsonb, 'evento vazio';
	assert pg_temp.hook(jsonb_build_object('email', 'fulano@fab.mil.br', 'is_anonymous', true)) <> '{}'::jsonb, 'anônimo';
	-- OAuth/SSO: a mesma regra, pelo e-mail
	assert pg_temp.hook(jsonb_build_object('email', 'fulano@fab.mil.br', 'app_metadata', jsonb_build_object('provider', 'azure'))) = '{}'::jsonb;
	assert pg_temp.hook(jsonb_build_object('email', 'fulano@outlook.com', 'app_metadata', jsonb_build_object('provider', 'azure'))) <> '{}'::jsonb;

	-- forma da recusa: o GoTrue devolve http_code e message ao cliente
	refusal := pg_temp.hook(jsonb_build_object('email', 'fulano@gmail.com'));
	assert (refusal -> 'error' ->> 'http_code')::int = 403, 'http_code 403';
	assert refusal -> 'error' ->> 'message' like 'Cadastro restrito a e-mails institucionais @fab.mil.br.%', 'mensagem em português';
end $$;

-- ── Como o GoTrue: supabase_auth_admin, com o privilégio mínimo ────────────
do $$ begin
	assert has_function_privilege('supabase_auth_admin', 'access_control.before_user_created(jsonb)', 'execute');
	assert has_function_privilege('service_role', 'access_control.before_user_created(jsonb)', 'execute');
	assert not has_function_privilege('anon', 'access_control.before_user_created(jsonb)', 'execute');
	assert not has_function_privilege('authenticated', 'access_control.before_user_created(jsonb)', 'execute');
	assert not has_function_privilege('supabase_auth_admin', 'access_control.authorize_external_signup(uuid, text, text, text, text)', 'execute');
	assert not has_function_privilege('anon', 'access_control.authorize_external_signup(uuid, text, text, text, text)', 'execute');
	assert not has_function_privilege('authenticated', 'access_control.revoke_external_signup(uuid, text, uuid, text)', 'execute');
	assert has_function_privilege('service_role', 'access_control.revoke_external_signup(uuid, text, uuid, text)', 'execute');
	assert not has_table_privilege('supabase_auth_admin', 'access_control.signup_allowlist', 'insert');
	assert not has_column_privilege('supabase_auth_admin', 'access_control.signup_allowlist', 'reason', 'select');
	assert has_column_privilege('supabase_auth_admin', 'access_control.signup_allowlist', 'email', 'select');
end $$;

set role supabase_auth_admin;
do $$ begin
	assert pg_temp.allowed('fulano@fab.mil.br');
	assert pg_temp.allowed('novo.parceiro@gs1br.org'), 'o GoTrue enxerga a autorização ativa';
	assert not pg_temp.allowed('outro@gs1br.org');
	-- a policy só mostra as ativas, e só as duas colunas
	assert (select count(*) from access_control.signup_allowlist where email = 'novo.parceiro@gs1br.org') = 1, 'a revogada não aparece';
	perform pg_temp.expect_error($q$ select reason from access_control.signup_allowlist $q$, 'permission denied for table signup_allowlist');
end $$;
reset role;

-- ── link_own_saram (sucont) ─────────────────────────────────────────────────
-- Esqueleto de core.user_data e core.military_identity como em produção (colunas usadas).
create table core.user_data (
	id uuid primary key references auth.users(id) on delete cascade,
	created_at timestamptz not null default now(),
	email text not null constraint user_data_email_key unique,
	default_mess_hall_id bigint,
	saram text
);
create table core.military_identity (saram text, posto text, nome_guerra text, sg_org text, data_atualizacao timestamptz);
insert into core.military_identity (saram, posto, nome_guerra) values ('1234567', '3S', 'FULANO'), ('7654321', '1T', 'CICLANO');
insert into auth.users (id, email) values
	('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br'),
	('00000000-0000-0000-0000-000000000052', 'dois@fab.mil.br'),
	('00000000-0000-0000-0000-000000000053', null);

\ir ../../supabase/migrations/20261001100200_link_own_saram.sql
\ir ../../supabase/migrations/20261001100200_link_own_saram.sql

do $$
declare r jsonb;
begin
	assert has_function_privilege('service_role', 'core.link_own_saram(uuid, text, text)', 'execute');
	assert not has_function_privilege('anon', 'core.link_own_saram(uuid, text, text)', 'execute');
	assert not has_function_privilege('authenticated', 'core.link_own_saram(uuid, text, text)', 'execute');

	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', '12a') $q$, 'SARAM_INVALID');

	-- sem linha: insere com o e-mail da sessão; SARAM que não localiza ninguém segue corrigível
	r := core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', ' 111111 ');
	assert r ->> 'saram' = '111111' and (r ->> 'changed')::boolean;
	r := core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', '1234567');
	assert (select saram from core.user_data where id = '00000000-0000-0000-0000-000000000051') = '1234567';
	-- reenvio do mesmo valor é idempotente
	r := core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', '1234567');
	assert not (r ->> 'changed')::boolean;
	-- write-once: o SARAM que localiza cadastro militar não troca nem limpa
	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', '7654321') $q$, 'SARAM_LOCKED');
	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000051', 'um@fab.mil.br', '') $q$, 'SARAM_LOCKED');
	-- exclusivo: o de outra conta é recusado, e nada muda na conta que pediu
	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000052', 'dois@fab.mil.br', '1234567') $q$, 'SARAM_TAKEN');
	assert not exists (select 1 from core.user_data where id = '00000000-0000-0000-0000-000000000052');
	-- conta sem e-mail e sem linha: não há o que atualizar
	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000053', null, '222222') $q$, 'USER_DATA_NOT_FOUND');
	-- e-mail detido por outra linha: recusa sem apagar a rival
	perform pg_temp.expect_error($q$ select core.link_own_saram('00000000-0000-0000-0000-000000000052', 'um@fab.mil.br', '333333') $q$, 'EMAIL_TAKEN');
	assert exists (select 1 from core.user_data where id = '00000000-0000-0000-0000-000000000051' and email = 'um@fab.mil.br');
	-- conta com linha e sem e-mail na sessão: atualiza o SARAM, mantém o e-mail
	r := core.link_own_saram('00000000-0000-0000-0000-000000000052', 'dois@fab.mil.br', '444444');
	r := core.link_own_saram('00000000-0000-0000-0000-000000000052', null, '555555');
	assert (select email = 'dois@fab.mil.br' and saram = '555555' from core.user_data where id = '00000000-0000-0000-0000-000000000052');
end $$;

\echo 'signup-allowlist: verde'
