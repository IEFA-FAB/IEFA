-- Teto da administração (20261001120000): `admin:3` — conceder, alterar, revogar, anexar a
-- política que o contém, ou mexer no acesso de quem o detém — só com `admin:3` efetivo do ator.
-- Roda depois da fase 2 (triggers ligados): o semeio usa o bypass explícito.

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

-- ── Fixtures: d2 = admin:2, d3 = admin:3, t = alvo comum, v = alvo com admin:3, x = admin:3 bloqueado
begin;
select set_config('iefa.audit_bypass', 'fixtures do teto de administração', true);
insert into auth.users (id, email) values
	('00000000-0000-0000-0000-0000000000d2', 'admin2@x'),
	('00000000-0000-0000-0000-0000000000d3', 'admin3@x'),
	('00000000-0000-0000-0000-0000000000e1', 'alvo@x'),
	('00000000-0000-0000-0000-0000000000e3', 'alvo-top@x'),
	('00000000-0000-0000-0000-0000000000e4', 'top-bloqueado@x');
insert into access_control.user_permissions (user_id, module, level) values
	('00000000-0000-0000-0000-0000000000d2', 'admin', 2),
	('00000000-0000-0000-0000-0000000000d3', 'admin', 3),
	('00000000-0000-0000-0000-0000000000e3', 'admin', 3),
	('00000000-0000-0000-0000-0000000000e4', 'admin', 3),
	('00000000-0000-0000-0000-0000000000e4', 'admin', 0);
insert into access_control.policy (id, name) values
	('00000000-0000-0000-0000-0000000000f1', 'Teto: comum'),
	('00000000-0000-0000-0000-0000000000f3', 'Teto: concede admin 3'),
	('00000000-0000-0000-0000-0000000000f4', 'Teto: anexada a admin 3');
insert into access_control.policy_statement (policy_id, module, level) values
	('00000000-0000-0000-0000-0000000000f1', 'kitchen', 2),
	('00000000-0000-0000-0000-0000000000f3', 'admin', 3),
	('00000000-0000-0000-0000-0000000000f4', 'kitchen', 1);
insert into access_control.user_policy_attachment (user_id, policy_id) values
	('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f4');
commit;

-- ── Auxiliares ──────────────────────────────────────────────────────────────
do $$ begin
	assert access_control.effective_admin_level('00000000-0000-0000-0000-0000000000d2') = 2;
	assert access_control.effective_admin_level('00000000-0000-0000-0000-0000000000d3') = 3;
	assert access_control.effective_admin_level('00000000-0000-0000-0000-0000000000e1') = 0;
	-- deny vence: bloqueado não é administrador, mas continua DETENDO o allow de nível 3
	assert access_control.effective_admin_level('00000000-0000-0000-0000-0000000000e4') = 0;
	assert access_control.holds_top_admin_grant('00000000-0000-0000-0000-0000000000e4');
	assert not access_control.holds_top_admin_grant('00000000-0000-0000-0000-0000000000e1');
	assert access_control.policy_touches_top_admin('00000000-0000-0000-0000-0000000000f3', false);
	assert not access_control.policy_touches_top_admin('00000000-0000-0000-0000-0000000000f4', false);
	assert access_control.policy_touches_top_admin('00000000-0000-0000-0000-0000000000f4', true);
	assert not access_control.policy_touches_top_admin('00000000-0000-0000-0000-0000000000f1', true);
end $$;

-- ── admin:2 recusado (e nada gravado, nem log) ──────────────────────────────
do $$
declare n bigint := (select count(*) from access_control.sensitive_operation_log);
begin
	-- grant inline de admin:3 (a escalada pelo caminho inline)
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-0000000000d2', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000d2', 'admin', 3, null, null, null, null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- subir o próprio grant de 2 para 3
	perform pg_temp.expect_error(format($q$ select access_control.update_user_permission('00000000-0000-0000-0000-0000000000d2', 'updateUserPermissionFn', %L, 3, null, null, null, null, false) $q$,
		(select id from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000d2' and module = 'admin')), 'ADMIN_LEVEL_3_REQUIRED');
	-- revogar o admin:3 de outra pessoa
	perform pg_temp.expect_error(format($q$ select access_control.delete_user_permission('00000000-0000-0000-0000-0000000000d2', 'deleteUserPermissionFn', %L) $q$,
		(select id from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000e3' and module = 'admin')), 'ADMIN_LEVEL_3_REQUIRED');
	-- bloquear quem detém admin:3 (grant novo sobre ele, deny ou não)
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-0000000000d2', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000e3', 'admin', 0, null, null, null, null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- tirar o deny de quem detém admin:3 devolveria o admin:3
	perform pg_temp.expect_error(format($q$ select access_control.delete_user_permission('00000000-0000-0000-0000-0000000000d2', 'deleteUserPermissionFn', %L) $q$,
		(select id from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000e4' and level = 0)), 'ADMIN_LEVEL_3_REQUIRED');
	-- a escalada pela política: statement admin:3 numa política comum
	perform pg_temp.expect_error($q$ select access_control.add_policy_statement('00000000-0000-0000-0000-0000000000d2', 'addPolicyStatementFn', '00000000-0000-0000-0000-0000000000f1', 'admin', 3, null, null, null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- …ou transformar um statement existente em admin:3
	perform pg_temp.expect_error(format($q$ select access_control.update_policy_statement('00000000-0000-0000-0000-0000000000d2', 'updatePolicyStatementFn', %L, 'admin', 3, null, null, null) $q$,
		(select id from access_control.policy_statement where policy_id = '00000000-0000-0000-0000-0000000000f1')), 'ADMIN_LEVEL_3_REQUIRED');
	-- anexar a si mesmo (ou a qualquer um) a política que concede admin:3
	perform pg_temp.expect_error($q$ select access_control.attach_policy('00000000-0000-0000-0000-0000000000d2', 'attachPolicyFn', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f3', null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- deny admin:0 numa política anexada a quem detém admin:3
	perform pg_temp.expect_error($q$ select access_control.add_policy_statement('00000000-0000-0000-0000-0000000000d2', 'addPolicyStatementFn', '00000000-0000-0000-0000-0000000000f4', 'admin', 0, null, null, null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- desanexar / anexar quem detém admin:3
	perform pg_temp.expect_error($q$ select access_control.detach_policy('00000000-0000-0000-0000-0000000000d2', 'detachPolicyFn', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f4') $q$, 'ADMIN_LEVEL_3_REQUIRED');
	perform pg_temp.expect_error($q$ select access_control.attach_policy('00000000-0000-0000-0000-0000000000d2', 'attachPolicyFn', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f1', null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
	-- remover a política anexada a quem detém admin:3 / a que concede admin:3
	perform pg_temp.expect_error($q$ select access_control.delete_policy('00000000-0000-0000-0000-0000000000d2', 'deletePolicyFn', '00000000-0000-0000-0000-0000000000f4') $q$, 'ADMIN_LEVEL_3_REQUIRED');
	perform pg_temp.expect_error($q$ select access_control.delete_policy('00000000-0000-0000-0000-0000000000d2', 'deletePolicyFn', '00000000-0000-0000-0000-0000000000f3') $q$, 'ADMIN_LEVEL_3_REQUIRED');
	assert (select count(*) from access_control.sensitive_operation_log) = n, 'recusa não grava log';
	assert not exists (select 1 from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000d2' and level = 3);
	assert not exists (select 1 from access_control.user_policy_attachment where user_id = '00000000-0000-0000-0000-0000000000d2');
end $$;

-- ── admin:2 segue administrando quem está abaixo do teto ─────────────────────
do $$
declare r jsonb;
begin
	r := access_control.create_user_permission('00000000-0000-0000-0000-0000000000d2', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000e1', 'admin', 2, null, null, null, null);
	perform access_control.update_user_permission('00000000-0000-0000-0000-0000000000d2', 'updateUserPermissionFn', (r ->> 'permission_id')::uuid, 1, null, null, null, null, false);
	perform access_control.delete_user_permission('00000000-0000-0000-0000-0000000000d2', 'deleteUserPermissionFn', (r ->> 'permission_id')::uuid);
	r := access_control.add_policy_statement('00000000-0000-0000-0000-0000000000d2', 'addPolicyStatementFn', '00000000-0000-0000-0000-0000000000f1', 'storage', 1, null, null, null);
	perform access_control.attach_policy('00000000-0000-0000-0000-0000000000d2', 'attachPolicyFn', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', null);
	perform access_control.detach_policy('00000000-0000-0000-0000-0000000000d2', 'detachPolicyFn', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1');
	perform access_control.remove_policy_statement('00000000-0000-0000-0000-0000000000d2', 'removePolicyStatementFn', (r ->> 'statement_id')::uuid);
end $$;

-- ── admin:3 passa ───────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
	r := access_control.create_user_permission('00000000-0000-0000-0000-0000000000d3', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000e1', 'admin', 3, null, null, null, null);
	perform access_control.delete_user_permission('00000000-0000-0000-0000-0000000000d3', 'deleteUserPermissionFn', (r ->> 'permission_id')::uuid);
	perform access_control.attach_policy('00000000-0000-0000-0000-0000000000d3', 'attachPolicyFn', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f3', null);
	perform access_control.detach_policy('00000000-0000-0000-0000-0000000000d3', 'detachPolicyFn', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f3');
	r := access_control.add_policy_statement('00000000-0000-0000-0000-0000000000d3', 'addPolicyStatementFn', '00000000-0000-0000-0000-0000000000f4', 'storage', 1, null, null, null);
	perform access_control.remove_policy_statement('00000000-0000-0000-0000-0000000000d3', 'removePolicyStatementFn', (r ->> 'statement_id')::uuid);
end $$;

-- ── admin:3 BLOQUEADO não vale como teto ────────────────────────────────────
do $$ begin
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-0000000000e4', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000e1', 'admin', 3, null, null, null, null) $q$, 'ADMIN_LEVEL_3_REQUIRED');
end $$;

\echo 'teto de administração: OK'
