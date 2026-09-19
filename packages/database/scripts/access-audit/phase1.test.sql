-- Fase 1 (20260921130000): cada função auditada grava a mudança e UMA linha de log, na mesma
-- transação; erro em qualquer ponto (inclusive no log) desfaz tudo. Roda depois de stub.sql e
-- da migration de fase 1, ANTES dos triggers. Falha = exceção (psql -v ON_ERROR_STOP=1).

\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
	('00000000-0000-0000-0000-00000000000a', 'actor@x'),
	('00000000-0000-0000-0000-00000000000b', 'target@x'),
	('00000000-0000-0000-0000-00000000000c', 'other@x');
insert into core.units values (1), (2);
insert into kitchen.kitchen values (10);
insert into kitchen.mess_halls values (20);

-- Espera um erro com a mensagem exata; qualquer outro desfecho reprova.
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
create function pg_temp.last_log() returns access_control.sensitive_operation_log language sql as $$
	-- Tudo dentro de um DO é UMA transação (mesmo now()): a ordem de inserção é a do ctid
	select * from access_control.sensitive_operation_log order by ctid desc limit 1
$$;

-- ── Infraestrutura ──────────────────────────────────────────────────────────
do $$ begin
	-- gravador fora de contexto não grava
	perform pg_temp.expect_error($q$ select access_control.record_access_change('00000000-0000-0000-0000-00000000000a', 'x.y', 'session', '{}') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.audit_context('com espaço') $q$, 'ACCESS_CHANGE_INVALID');
	assert pg_temp.log_count() = 0;
end $$;

-- ── change_module_permission (por chave) ────────────────────────────────────
do $$
declare r jsonb; l access_control.sensitive_operation_log;
begin
	r := access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'contrate', 'grant', '00000000-0000-0000-0000-00000000000b', 'alpha-admin', 3, 1, null, null, null);
	assert pg_temp.log_count() = 1, 'grant: uma linha de log';
	l := pg_temp.last_log();
	assert l.operation = 'contrate.permission.grant' and l.target ->> 'target_user_id' = '00000000-0000-0000-0000-00000000000b';
	-- o contexto aberto é o da operação
	assert current_setting('iefa.audit_operation', true) = 'contrate.permission.grant';
	r := access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'contrate', 'revoke', '00000000-0000-0000-0000-00000000000b', 'alpha-admin', null, 1, null, null, null, 'session', 'allow');
	assert pg_temp.log_count() = 2 and (r ->> 'removed')::int = 1;
	-- ator inexistente: nada fica gravado, nem o grant
	perform pg_temp.expect_error($q$ select access_control.change_module_permission('00000000-0000-0000-0000-0000000000ff', 'contrate', 'grant', '00000000-0000-0000-0000-00000000000b', 'alpha-admin', 3, 1, null, null, null) $q$, 'PERMISSION_ACTOR_NOT_FOUND');
	assert not exists (select 1 from access_control.user_permissions where module = 'alpha-admin'), 'o grant do ator inexistente foi desfeito';
	assert pg_temp.log_count() = 2;
end $$;

-- ── create/update/delete_user_permission (por linha, console do sisub) ──────
do $$
declare r jsonb; pid uuid; l access_control.sensitive_operation_log; n bigint := pg_temp.log_count();
begin
	r := access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'kitchen', 2, null, 10, null, '2030-01-01', 'fresh');
	pid := (r ->> 'permission_id')::uuid;
	assert pg_temp.log_count() = n + 1;
	l := pg_temp.last_log();
	assert l.operation = 'createUserPermissionFn' and l.assurance = 'fresh' and l.target ->> 'action' = 'grant' and (l.target ->> 'kitchen_id')::int = 10;

	-- estrita: repetir a chave é erro legível, e NÃO registra
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'kitchen', 1, null, 10, null, null) $q$, 'PERMISSION_ALREADY_EXISTS');
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'kitchen', 1, 2, 10, null, null) $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'kitchen', 1, 999, null, null, null) $q$, 'PERMISSION_REFERENCE_NOT_FOUND');
	perform pg_temp.expect_error($q$ select access_control.create_user_permission('00000000-0000-0000-0000-0000000000ff', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'unit', 1, null, null, null, null) $q$, 'ACCESS_ACTOR_NOT_FOUND');
	assert not exists (select 1 from access_control.user_permissions where module = 'unit'), 'o grant do ator inexistente foi desfeito';
	assert pg_temp.log_count() = n + 1;

	-- update: PATCH do prazo (p_set_expires_at = false preserva)
	r := access_control.update_user_permission('00000000-0000-0000-0000-00000000000a', 'updateUserPermissionFn', pid, 1, 1, null, null, null, false, 'fresh');
	l := pg_temp.last_log();
	assert (select expires_at from access_control.user_permissions where id = pid) = '2030-01-01'::timestamptz, 'prazo preservado';
	assert l.target ->> 'target_user_id' = '00000000-0000-0000-0000-00000000000b' and (l.target -> 'previous' ->> 'level')::int = 2
		and (l.target -> 'previous' ->> 'kitchen_id')::int = 10 and (l.target ->> 'unit_id')::int = 1 and l.target ->> 'module' = 'kitchen', 'antes e depois no log';
	r := access_control.update_user_permission('00000000-0000-0000-0000-00000000000a', 'updateUserPermissionFn', pid, 1, 1, null, null, null, true, 'fresh');
	assert (select expires_at from access_control.user_permissions where id = pid) is null, 'null explícito limpa o prazo';
	assert pg_temp.log_count() = n + 3;
	perform pg_temp.expect_error(format($q$ select access_control.update_user_permission('00000000-0000-0000-0000-00000000000a', 'updateUserPermissionFn', %L, 1, null, null, null, null, false) $q$, gen_random_uuid()), 'PERMISSION_NOT_FOUND');

	-- mover para a chave de outro grant do mesmo lado colide
	perform access_control.create_user_permission('00000000-0000-0000-0000-00000000000a', 'createUserPermissionFn', '00000000-0000-0000-0000-00000000000b', 'kitchen', 2, 2, null, null, null);
	perform pg_temp.expect_error(format($q$ select access_control.update_user_permission('00000000-0000-0000-0000-00000000000a', 'updateUserPermissionFn', %L, 2, 2, null, null, null, false) $q$, pid), 'PERMISSION_ALREADY_EXISTS');
	assert (select unit_id from access_control.user_permissions where id = pid) = 1, 'update recusado não mexeu na linha';

	-- delete registra a linha inteira
	r := access_control.delete_user_permission('00000000-0000-0000-0000-00000000000a', 'deleteUserPermissionFn', pid, 'fresh');
	l := pg_temp.last_log();
	assert l.target ->> 'action' = 'revoke' and (l.target -> 'previous' ->> 'level')::int = 1 and l.target ->> 'module' = 'kitchen' and (l.target ->> 'unit_id')::int = 1;
	assert not exists (select 1 from access_control.user_permissions where id = pid);
	perform pg_temp.expect_error(format($q$ select access_control.delete_user_permission('00000000-0000-0000-0000-00000000000a', 'deleteUserPermissionFn', %L) $q$, pid), 'PERMISSION_NOT_FOUND');
end $$;

-- ── Políticas ───────────────────────────────────────────────────────────────
do $$
declare r jsonb; pol uuid; st uuid; managed uuid; l access_control.sensitive_operation_log; n bigint;
begin
	r := access_control.create_policy('00000000-0000-0000-0000-00000000000a', 'createPolicyFn', 'Turma X', 'desc', 'fresh');
	pol := (r ->> 'id')::uuid;
	perform pg_temp.expect_error($q$ select access_control.create_policy('00000000-0000-0000-0000-00000000000a', 'createPolicyFn', 'Turma X', null) $q$, 'POLICY_NAME_TAKEN');

	r := access_control.add_policy_statement('00000000-0000-0000-0000-00000000000a', 'addPolicyStatementFn', pol, 'analytics', 2, 1, null, null);
	st := (r ->> 'statement_id')::uuid;
	perform pg_temp.expect_error(format($q$ select access_control.add_policy_statement('00000000-0000-0000-0000-00000000000a', 'addPolicyStatementFn', %L, 'analytics', 9, null, null, null) $q$, pol), 'ACCESS_CHANGE_INVALID');

	-- anexo novo = concessão; reanexo = mudança de prazo, com o prazo anterior
	r := access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000b', pol, '2030-01-01');
	l := pg_temp.last_log();
	assert r ->> 'change' = 'attach' and l.target ->> 'change' = 'attach' and l.target ->> 'action' = 'grant' and l.target -> 'previous' = 'null'::jsonb;
	assert (select created_by from access_control.user_policy_attachment where policy_id = pol) = '00000000-0000-0000-0000-00000000000a';
	r := access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000b', pol, null);
	l := pg_temp.last_log();
	assert r ->> 'change' = 'expiry' and l.target ->> 'action' = 'change' and (l.target -> 'previous' ->> 'expires_at')::timestamptz = '2030-01-01'::timestamptz;
	perform access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000c', pol, null);

	-- statement alterado registra antes/depois E quem é alcançado
	r := access_control.update_policy_statement('00000000-0000-0000-0000-00000000000a', 'updatePolicyStatementFn', st, 'analytics', 1, null, null, 20);
	l := pg_temp.last_log();
	assert (l.target -> 'previous' ->> 'level')::int = 2 and (l.target -> 'statement' ->> 'mess_hall_id')::int = 20 and l.target ->> 'policy_id' = pol::text;
	assert (l.target ->> 'affected_member_count')::int = 2 and l.target -> 'affected_user_ids' ? '00000000-0000-0000-0000-00000000000b';

	r := access_control.update_policy('00000000-0000-0000-0000-00000000000a', 'updatePolicyFn', pol, 'Turma Y', null, false);
	l := pg_temp.last_log();
	assert l.target -> 'previous' ->> 'policy_name' = 'Turma X' and l.target ->> 'policy_name' = 'Turma Y' and l.target ->> 'description' = 'desc';

	-- remover a política registra os afetados (revogação em massa)
	n := pg_temp.log_count();
	r := access_control.delete_policy('00000000-0000-0000-0000-00000000000a', 'deletePolicyFn', pol);
	l := pg_temp.last_log();
	assert pg_temp.log_count() = n + 1 and l.target ->> 'action' = 'revoke' and (l.target ->> 'affected_member_count')::int = 2
		and jsonb_array_length(l.target -> 'statements') = 1;
	perform pg_temp.expect_error(format($q$ select access_control.add_policy_statement('00000000-0000-0000-0000-00000000000a', 'addPolicyStatementFn', %L, 'kitchen', 1, null, null, null) $q$, pol), 'POLICY_NOT_FOUND');
	perform pg_temp.expect_error(format($q$ select access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000c', %L, null) $q$, pol), 'POLICY_NOT_FOUND');

	r := access_control.restore_policy('00000000-0000-0000-0000-00000000000a', 'restorePolicy', pol);
	l := pg_temp.last_log();
	assert l.target ->> 'action' = 'grant' and (l.target ->> 'affected_member_count')::int = 2;
	perform pg_temp.expect_error(format($q$ select access_control.restore_policy('00000000-0000-0000-0000-00000000000a', 'restorePolicy', %L) $q$, pol), 'POLICY_NOT_DELETED');

	r := access_control.remove_policy_statement('00000000-0000-0000-0000-00000000000a', 'removePolicyStatementFn', st);
	l := pg_temp.last_log();
	assert l.target -> 'previous' ->> 'module' = 'analytics' and l.target ->> 'policy_id' = pol::text;
	perform pg_temp.expect_error(format($q$ select access_control.remove_policy_statement('00000000-0000-0000-0000-00000000000a', 'removePolicyStatementFn', %L) $q$, st), 'STATEMENT_NOT_FOUND');

	r := access_control.detach_policy('00000000-0000-0000-0000-00000000000a', 'detachPolicyFn', '00000000-0000-0000-0000-00000000000b', pol);
	l := pg_temp.last_log();
	assert l.target ->> 'target_user_id' = '00000000-0000-0000-0000-00000000000b' and l.target ->> 'policy_name' = 'Turma Y' and l.target -> 'previous' ->> 'created_by' = '00000000-0000-0000-0000-00000000000a';
	perform pg_temp.expect_error(format($q$ select access_control.detach_policy('00000000-0000-0000-0000-00000000000a', 'detachPolicyFn', '00000000-0000-0000-0000-00000000000b', %L) $q$, pol), 'ATTACHMENT_NOT_FOUND');

	-- gerenciada: conteúdo imutável, anexo permitido
	insert into access_control.policy (name, managed) values ('Conjunto Treino', true) returning id into managed;
	perform pg_temp.expect_error(format($q$ select access_control.add_policy_statement('00000000-0000-0000-0000-00000000000a', 'addPolicyStatementFn', %L, 'kitchen', 1, null, null, null) $q$, managed), 'POLICY_MANAGED');
	perform pg_temp.expect_error(format($q$ select access_control.delete_policy('00000000-0000-0000-0000-00000000000a', 'deletePolicyFn', %L) $q$, managed), 'POLICY_MANAGED');
	perform access_control.attach_policy('00000000-0000-0000-0000-00000000000a', 'attachPolicyFn', '00000000-0000-0000-0000-00000000000b', managed, null);
end $$;

-- ── Chaves MCP (self-only) ──────────────────────────────────────────────────
do $$
declare r jsonb; k uuid; l access_control.sensitive_operation_log; n bigint;
begin
	r := access_control.create_mcp_api_key('00000000-0000-0000-0000-00000000000a', 'createMcpKeyFn', 'notebook', 'hash-1', 'smcp_abc1234', now() + interval '30 days', 'fresh');
	k := (r ->> 'id')::uuid;
	l := pg_temp.last_log();
	assert l.target ->> 'key_prefix' = 'smcp_abc1234' and not (l.target ? 'key_hash') and not (r ? 'key_hash'), 'o hash nunca vai ao log nem volta';
	-- outra pessoa não alcança a chave
	perform pg_temp.expect_error(format($q$ select access_control.revoke_mcp_api_key('00000000-0000-0000-0000-00000000000b', 'revokeMcpKeyFn', %L) $q$, k), 'MCP_KEY_NOT_FOUND');
	r := access_control.revoke_mcp_api_key('00000000-0000-0000-0000-00000000000a', 'revokeMcpKeyFn', k);
	assert (r ->> 'changed')::boolean and not (select is_active from access_control.mcp_api_keys where id = k);
	n := pg_temp.log_count();
	r := access_control.revoke_mcp_api_key('00000000-0000-0000-0000-00000000000a', 'revokeMcpKeyFn', k);
	assert not (r ->> 'changed')::boolean and pg_temp.log_count() = n, 'revogar o revogado não registra';
	r := access_control.delete_mcp_api_key('00000000-0000-0000-0000-00000000000a', 'deleteMcpKeyFn', k);
	assert pg_temp.log_count() = n + 1 and (pg_temp.last_log()).target -> 'previous' ->> 'is_active' = 'false';
	perform pg_temp.expect_error(format($q$ select access_control.delete_mcp_api_key('00000000-0000-0000-0000-00000000000a', 'deleteMcpKeyFn', %L) $q$, k), 'MCP_KEY_NOT_FOUND');
end $$;

-- ── forms ───────────────────────────────────────────────────────────────────
do $$
declare r jsonb; q uuid; v uuid; e uuid; l access_control.sensitive_operation_log; n bigint;
begin
	insert into forms.questionnaire (created_by) values ('00000000-0000-0000-0000-00000000000a') returning id into q;
	r := forms.add_response_viewer('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-00000000000b', 'target@x', 'scoped',
		'[{"attribute_key":"om","effect":"allow","value":"GAP-SJ"}]');
	v := (r ->> 'id')::uuid;
	l := pg_temp.last_log();
	assert l.operation = 'forms.viewer.grant' and jsonb_array_length(l.target -> 'bindings') = 1 and l.target ->> 'scope_mode' = 'scoped';
	assert (select count(*) from forms.response_viewer_scope_binding where response_viewer_id = v) = 1;
	perform pg_temp.expect_error(format($q$ select forms.add_response_viewer('00000000-0000-0000-0000-00000000000a', %L, '00000000-0000-0000-0000-00000000000b', 'target@x', 'global', '[]') $q$, q), 'VIEWER_ALREADY_EXISTS');

	-- regra inválida: nem o visualizador fica (as duas escritas são uma só)
	n := pg_temp.log_count();
	perform pg_temp.expect_error(format($q$ select forms.add_response_viewer('00000000-0000-0000-0000-00000000000a', %L, '00000000-0000-0000-0000-00000000000c', 'other@x', 'scoped', '[{"attribute_key":"om","effect":"talvez","value":"X"}]') $q$, q), 'ACCESS_CHANGE_INVALID');
	assert not exists (select 1 from forms.response_viewer where viewer_id = '00000000-0000-0000-0000-00000000000c') and pg_temp.log_count() = n;

	r := forms.update_response_viewer_policy('00000000-0000-0000-0000-00000000000a', q, v, 'global', '[]');
	l := pg_temp.last_log();
	assert l.target -> 'previous' ->> 'scope_mode' = 'scoped' and jsonb_array_length(l.target -> 'previous' -> 'bindings') = 1 and jsonb_array_length(l.target -> 'bindings') = 0;
	assert not exists (select 1 from forms.response_viewer_scope_binding where response_viewer_id = v);
	perform pg_temp.expect_error(format($q$ select forms.update_response_viewer_policy('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), %L, 'global', '[]') $q$, v), 'VIEWER_NOT_FOUND');

	r := forms.remove_response_viewer('00000000-0000-0000-0000-00000000000a', q, v);
	assert (pg_temp.last_log()).target ->> 'target_user_id' = '00000000-0000-0000-0000-00000000000b';
	perform pg_temp.expect_error(format($q$ select forms.remove_response_viewer('00000000-0000-0000-0000-00000000000a', %L, %L) $q$, q, v), 'VIEWER_NOT_FOUND');

	r := forms.add_questionnaire_editor('00000000-0000-0000-0000-00000000000a', q, '00000000-0000-0000-0000-00000000000c', 'other@x');
	e := (r ->> 'id')::uuid;
	perform pg_temp.expect_error(format($q$ select forms.add_questionnaire_editor('00000000-0000-0000-0000-00000000000a', %L, '00000000-0000-0000-0000-00000000000c', 'other@x') $q$, q), 'EDITOR_ALREADY_EXISTS');
	r := forms.remove_questionnaire_editor('00000000-0000-0000-0000-00000000000a', q, e);
	assert (pg_temp.last_log()).operation = 'forms.editor.revoke';
end $$;

-- ── journal ─────────────────────────────────────────────────────────────────
do $$
declare r jsonb; n bigint;
begin
	-- o perfil nasce no cadastro (handle_new_user), como author
	r := journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'editor');
	assert (select role from journal.user_profiles where id = '00000000-0000-0000-0000-00000000000b') = 'editor';
	assert (pg_temp.last_log()).target -> 'previous' ->> 'role' = 'author';
	n := pg_temp.log_count();
	r := journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'editor');
	assert not (r ->> 'changed')::boolean and pg_temp.log_count() = n, 'mesmo papel não registra';
	perform pg_temp.expect_error($q$ select journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ee', 'editor') $q$, 'PROFILE_NOT_FOUND');
	perform pg_temp.expect_error($q$ select journal.change_user_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'dono') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select journal.change_user_role('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000b', 'reviewer') $q$, 'ACCESS_ACTOR_NOT_FOUND');
	assert (select role from journal.user_profiles where id = '00000000-0000-0000-0000-00000000000b') = 'editor', 'troca com ator inexistente foi desfeita';
end $$;

-- ── journal.save_user_profile: perfil + papel, uma transação ────────────────
do $$
declare r jsonb; n bigint;
begin
	insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'f1@x');
	delete from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000f1';
	-- insert: nasce author, sem log
	n := pg_temp.log_count();
	r := journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'insert', '{"full_name":"F","expertise":["a","b"]}');
	assert r ->> 'role' = 'author' and r -> 'expertise' = '["a","b"]'::jsonb and pg_temp.log_count() = n;
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'insert', '{"full_name":"F"}') $q$, 'PROFILE_ALREADY_EXISTS');
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'update', '{"role":"editor"}') $q$, 'PROFILE_FIELD_INVALID');
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ee', 'update', '{"bio":"x"}') $q$, 'PROFILE_NOT_FOUND');
	-- update + papel: os dois, e um log
	r := journal.save_user_profile('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'update', '{"bio":"nova"}', 'reviewer');
	assert r ->> 'bio' = 'nova' and r ->> 'role' = 'reviewer' and r ->> 'full_name' = 'F' and pg_temp.log_count() = n + 1;
	-- troca de papel que falha (ator inexistente) desfaz os campos também
	perform pg_temp.expect_error($q$ select journal.save_user_profile('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000f1', 'update', '{"bio":"perdida"}', 'editor') $q$, 'ACCESS_ACTOR_NOT_FOUND');
	assert (select bio from journal.user_profiles where id = '00000000-0000-0000-0000-0000000000f1') = 'nova', 'campos da troca recusada foram desfeitos';
end $$;

-- ── Privilégios: só a service role ──────────────────────────────────────────
do $$
declare f record;
begin
	for f in
		select p.oid::regprocedure as sig
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname in ('access_control', 'forms', 'journal')
				-- funções de trigger (como journal.update_updated_at do stub) não são RPC
				and p.prorettype <> 'trigger'::regtype
	loop
		assert not has_function_privilege('anon', f.sig, 'execute'), format('anon executa %s', f.sig);
		assert not has_function_privilege('authenticated', f.sig, 'execute'), format('authenticated executa %s', f.sig);
		assert has_function_privilege('service_role', f.sig, 'execute'), format('service_role não executa %s', f.sig);
	end loop;
end $$;

-- As funções rodam COMO service role (é assim que o PostgREST as chama).
begin;
set local role service_role;
select access_control.change_module_permission('00000000-0000-0000-0000-00000000000a', 'rumaer', 'grant', '00000000-0000-0000-0000-00000000000c', 'rumaer', 2, null, null, null, null) is not null as service_role_ok;
rollback;

\echo 'fase 1: OK'
