-- Fase 2 (20260921130100): escrita em tabela de acesso sem contexto de auditoria FALHA; as
-- funções, as cascatas de FK, o cadastro (`handle_new_user`) e o bypass explícito passam.
-- Roda depois de phase1.test.sql e da migration de fase 2.

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

-- ── Escrita direta: recusada em TODA tabela vigiada ─────────────────────────
do $$
declare pol uuid; q uuid; v uuid;
begin
	select id into pol from access_control.policy where name = 'Turma Y';
	select id into q from forms.questionnaire limit 1;

	perform pg_temp.expect_error($q$ insert into access_control.user_permissions (user_id, module, level) values ('00000000-0000-0000-0000-00000000000c', 'global', 3) $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ update access_control.user_permissions set level = 3 $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ delete from access_control.user_permissions $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ insert into access_control.policy (name) values ('p') $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ update access_control.policy set deleted_at = now() $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error(format($q$ insert into access_control.policy_statement (policy_id, module, level) values (%L, 'global', 3) $q$, pol), 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error(format($q$ insert into access_control.user_policy_attachment (user_id, policy_id) values ('00000000-0000-0000-0000-00000000000c', %L) $q$, pol), 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ delete from access_control.user_policy_attachment $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ insert into access_control.mcp_api_keys (user_id, label, key_hash, key_prefix) values ('00000000-0000-0000-0000-00000000000c', 'x', 'h9', 'p') $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error(format($q$ insert into forms.response_viewer (questionnaire_id, viewer_id, viewer_email, added_by) values (%L, '00000000-0000-0000-0000-00000000000c', 'o', '00000000-0000-0000-0000-00000000000c') $q$, q), 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error(format($q$ insert into forms.questionnaire_editor (questionnaire_id, editor_id, editor_email, added_by) values (%L, '00000000-0000-0000-0000-00000000000c', 'o', '00000000-0000-0000-0000-00000000000c') $q$, q), 'ACCESS_CHANGE_UNAUDITED');
	-- journal: só o papel é vigiado
	perform pg_temp.expect_error($q$ update journal.user_profiles set role = 'reviewer' where id = '00000000-0000-0000-0000-00000000000b' $q$, 'ACCESS_CHANGE_UNAUDITED');
	update journal.user_profiles set full_name = 'Nome novo' where id = '00000000-0000-0000-0000-00000000000b';
	perform pg_temp.expect_error($q$ insert into journal.user_profiles (id, full_name, role) values ('00000000-0000-0000-0000-00000000000c', 'c', 'editor') $q$, 'ACCESS_CHANGE_UNAUDITED');
	-- (o perfil de C já existe: nasceu no cadastro, pelo handle_new_user)
	perform pg_temp.expect_error($q$ delete from journal.user_profiles where id = '00000000-0000-0000-0000-00000000000b' $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;

-- ── As funções passam ───────────────────────────────────────────────────────
do $$
declare r jsonb; pid uuid; pol uuid; st uuid; k uuid; q uuid; v uuid; e uuid;
begin
	r := access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000c', 'storage', 1, 2, null, null, null);
	pid := (r ->> 'permission_id')::uuid;
	perform access_control.update_user_permission('00000000-0000-0000-0000-00000000000a', 'updateUserPermissionFn', pid, 2, 2, null, null, null, false);
	perform access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'sucont', 'grant', '00000000-0000-0000-0000-00000000000c', 'sucont-1', 1, null, null, null, null);
	perform access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'sucont', 'revoke', '00000000-0000-0000-0000-00000000000c', 'sucont-1', null, null, null, null, null);
	r := access_control.create_policy('00000000-0000-0000-0000-00000000000a', 'createPolicyFn', 'Turma Z', null);
	pol := (r ->> 'id')::uuid;
	st := (access_control.add_policy_statement('00000000-0000-0000-0000-00000000000a', 'addPolicyStatementFn', pol, 'kitchen', 1, null, 10, null) ->> 'statement_id')::uuid;
	perform access_control.update_policy_statement('00000000-0000-0000-0000-00000000000a', 'updatePolicyStatementFn', st, 'kitchen', 2, null, 10, null);
	perform access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000c', pol, null);
	perform access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000c', pol, '2031-01-01');
	perform access_control.update_policy('00000000-0000-0000-0000-00000000000a', 'updatePolicyFn', pol, null, 'nova', true);
	perform access_control.delete_policy('00000000-0000-0000-0000-00000000000a', 'deletePolicyFn', pol);
	perform access_control.restore_policy('00000000-0000-0000-0000-00000000000a', 'restorePolicy', pol);
	perform access_control.remove_policy_statement('00000000-0000-0000-0000-00000000000a', 'removePolicyStatementFn', st);
	perform access_control.detach_policy('00000000-0000-0000-0000-00000000000a', 'detachPolicyFn', '00000000-0000-0000-0000-00000000000c', pol);
	k := (access_control.create_mcp_api_key('00000000-0000-0000-0000-00000000000c', 'createMcpKeyFn', 'k', 'hash-2', 'smcp_def', now() + interval '1 day') ->> 'id')::uuid;
	select id into q from forms.questionnaire limit 1;
	v := (forms.add_response_viewer('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-00000000000c', 'c@x', 'scoped', '[{"attribute_key":"om","effect":"deny","value":"IAE"}]') ->> 'id')::uuid;
	perform forms.update_response_viewer_policy('00000000-0000-0000-0000-00000000000a', q, v, 'scoped', '[{"attribute_key":"om","effect":"allow","value":"IAE"}]');
	e := (forms.add_questionnaire_editor('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-00000000000c', 'c@x') ->> 'id')::uuid;
	perform journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'reviewer');
end $$;

-- Transação NOVA (sem contexto): o DO acima já abriu o contexto, e dentro dele a escrita direta
-- passaria — é o limite documentado na fase 1, fechado no código pela regra opengrep.
do $$
declare k uuid;
begin
	select id into k from access_control.mcp_api_keys where key_hash = 'hash-2';
	-- telemetria do sisub-mcp: `last_used_at` não é acesso
	update access_control.mcp_api_keys set last_used_at = now() where id = k;
	perform pg_temp.expect_error(format($q$ update access_control.mcp_api_keys set is_active = false where id = %L $q$, k), 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error(format($q$ update access_control.mcp_api_keys set expires_at = now() + interval '9 years' where id = %L $q$, k), 'ACCESS_CHANGE_UNAUDITED');
	perform access_control.revoke_mcp_api_key('00000000-0000-0000-0000-00000000000c', 'revokeMcpKeyFn', k);
end $$;

-- ── journal.save_user_profile passa com a fase 2 (sem papel: nem abre contexto) ──
do $$ begin
	perform journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'upsert', '{"full_name":"F2"}');
end $$;
do $$ begin
	perform journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'update', '{"bio":"b"}', 'editor');
	assert (select role from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000f1') = 'editor';
end $$;

-- ── set_module_block (contrate, #388) sob a fase 2 ─────────────────────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'b1@x');
-- sem contexto, o mesmo deny que a função grava é recusado
do $$ begin
	perform pg_temp.expect_error($q$ insert into access_control.user_permissions (user_id, module, level) values ('00000000-0000-0000-0000-0000000000b1', 'alpha-aci', 0) $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;
do $$
declare r jsonb; n bigint := (select count(*) from access_control.sensitive_operation_log);
begin
	-- um allow pré-existente: o bloqueio não o toca
	perform access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'contrate', 'grant', '00000000-0000-0000-0000-0000000000b1', 'alpha-requester', 1, 1, null, null, null);
	n := n + 1;
	r := access_control.set_module_block('00000000-0000-0000-0000-00000000000a', 'contrate', '00000000-0000-0000-0000-0000000000b1',
		array['alpha-requester', 'alpha-procurement', 'alpha-aci', 'alpha-admin'], true);
	assert jsonb_array_length(r -> 'changed') = 4, 'quatro módulos bloqueados';
	assert (select count(*) from access_control.sensitive_operation_log) = n + 4, 'uma linha de log por módulo alterado';
	assert (select count(*) from access_control.sensitive_operation_log where operation = 'contrate.permission.block' and target ->> 'target_user_id' = '00000000-0000-0000-0000-0000000000b1') = 4;
	assert exists (select 1 from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000b1' and module = 'alpha-requester' and level = 1), 'o allow ficou';
end $$;
do $$
declare r jsonb; n bigint := (select count(*) from access_control.sensitive_operation_log);
begin
	-- de novo: tudo já bloqueado, nada muda, nada é registrado
	r := access_control.set_module_block('00000000-0000-0000-0000-00000000000a', 'contrate', '00000000-0000-0000-0000-0000000000b1', array['alpha-aci', 'alpha-admin'], true);
	assert jsonb_array_length(r -> 'changed') = 0 and (select count(*) from access_control.sensitive_operation_log) = n;
	-- desbloqueio de dois: dois logs, os outros dois bloqueios ficam
	r := access_control.set_module_block('00000000-0000-0000-0000-00000000000a', 'contrate', '00000000-0000-0000-0000-0000000000b1', array['alpha-aci', 'alpha-admin'], false);
	assert jsonb_array_length(r -> 'changed') = 2 and (select count(*) from access_control.sensitive_operation_log) = n + 2;
	assert (select count(*) from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000b1' and level <= 0) = 2;
	-- ninguém bloqueia a si mesmo
	perform pg_temp.expect_error($q$ select access_control.set_module_block('00000000-0000-0000-0000-00000000000a', 'contrate', '00000000-0000-0000-0000-00000000000a', array['alpha-admin'], true) $q$, 'PERMISSION_CHANGE_INVALID');
end $$;
-- ator inexistente: nenhum módulo fica bloqueado (log e escrita, uma transação)
do $$ begin
	perform pg_temp.expect_error($q$ select access_control.set_module_block('00000000-0000-0000-0000-0000000000ff', 'contrate', '00000000-0000-0000-0000-0000000000b1', array['alpha-aci', 'alpha-admin'], true) $q$, 'PERMISSION_ACTOR_NOT_FOUND');
	assert (select count(*) from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000b1' and level <= 0) = 2;
end $$;

-- ── O contexto não vaza para a PRÓXIMA transação ────────────────────────────
select access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'rumaer', 'grant', '00000000-0000-0000-0000-00000000000c', 'rumaer', 3, null, null, null, null) is not null as granted;
do $$ begin
	assert coalesce(current_setting('iefa.audit_operation', true), '') = '', 'contexto sobreviveu ao fim da transação';
	perform pg_temp.expect_error($q$ delete from access_control.user_permissions where module = 'rumaer' $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;

-- ── Bypass explícito: vale só na própria transação ──────────────────────────
begin;
select set_config('iefa.audit_bypass', 'teste de manutenção', true);
insert into access_control.policy (name, managed) values ('Seed de migration', true);
commit;
do $$ begin
	perform pg_temp.expect_error($q$ insert into access_control.policy (name) values ('sem bypass') $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;

-- ── Cadastro: `handle_new_user` cria o perfil `author` sem contexto ──────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'novo@x');
do $$ begin
	assert (select role from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000d1') = 'author';
end $$;

-- ── Cascatas de FK: sistema, passam sem contexto e sem log ──────────────────
-- Usuário E: tudo concedido por A (E nunca é ATOR — ator com log não se apaga, restrict).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'e@x');
do $$
declare q uuid;
begin
	select id into q from forms.questionnaire limit 1;
	perform access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-0000000000e1', 'kitchen', 1, null, null, null, null);
	perform forms.add_response_viewer('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-0000000000e1', 'e@x', 'scoped', '[{"attribute_key":"om","effect":"allow","value":"IAE"}]');
	perform forms.add_questionnaire_editor('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-0000000000e1', 'e@x');
	perform journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1', 'reviewer');
end $$;
-- a chave MCP é self-only (o ator seria E): semeada por bypass
begin;
select set_config('iefa.audit_bypass', 'fixture', true);
insert into access_control.mcp_api_keys (user_id, label, key_hash, key_prefix) values ('00000000-0000-0000-0000-0000000000e1', 'k', 'hash-e', 'smcp_e');
commit;

do $$
declare n bigint := (select count(*) from access_control.sensitive_operation_log);
begin
	delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
	assert not exists (select 1 from access_control.user_permissions where user_id = '00000000-0000-0000-0000-0000000000e1');
	assert not exists (select 1 from access_control.mcp_api_keys where user_id = '00000000-0000-0000-0000-0000000000e1');
	assert not exists (select 1 from forms.response_viewer where viewer_id = '00000000-0000-0000-0000-0000000000e1');
	assert not exists (select 1 from forms.questionnaire_editor where editor_id = '00000000-0000-0000-0000-0000000000e1');
	assert not exists (select 1 from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000e1');
	assert (select count(*) from access_control.sensitive_operation_log) = n, 'cascata não registra';
end $$;

-- apagar o questionário leva visualizadores (e as regras deles, cascata de 2º nível) e editores
do $$
declare q uuid;
begin
	select id into q from forms.questionnaire limit 1;
	assert exists (select 1 from forms.response_viewer_scope_binding);
	delete from forms.questionnaire where id = q;
	assert not exists (select 1 from forms.response_viewer_scope_binding);
	assert not exists (select 1 from forms.questionnaire_editor);
end $$;

do $$ begin
	-- apagar a OM leva os grants escopados nela
	perform access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'unit', 2, 2, null, null, null);
	delete from core.units where id = 2;
	assert not exists (select 1 from access_control.user_permissions where unit_id = 2);
end $$;

-- apagar a política (manutenção explícita) leva statements e anexos por cascata
begin;
select set_config('iefa.audit_bypass', 'limpeza de política de teste', true);
delete from access_control.policy where name = 'Turma Z';
commit;
do $$ begin
	assert not exists (select 1 from access_control.policy where name = 'Turma Z');
end $$;

-- O ator não pode ser apagado enquanto tiver log (on delete restrict) — inalterado.
do $$ begin
	begin
		delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
	exception when restrict_violation or foreign_key_violation then
		return;
	end;
	raise exception 'o ator com log foi apagado';
end $$;

-- Como service_role (o PostgREST): escrita direta recusada, função aceita.
begin;
set local role service_role;
do $$ begin
	perform pg_temp.expect_error($q$ insert into access_control.user_permissions (user_id, module, level) values ('00000000-0000-0000-0000-00000000000b', 'global', 3) $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'contrate', 'grant', '00000000-0000-0000-0000-00000000000b', 'alpha-aci', 1, 1, null, null, null);
end $$;
rollback;

\echo 'fase 2: OK'
