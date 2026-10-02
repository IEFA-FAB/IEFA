-- 20261001150000 + 20261001150100: a concessão do /controller só muda por função auditada, só
-- nannijpsn@fab.mil.br fica ativo, e o anônimo lê `person` só da edição ativa.
-- Roda depois de assignment-selection.stub.sql e das duas migrations (aplicadas duas vezes).

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

-- ── Normalização: só o mantenedor ativo, a outra concessão desativada (não apagada) ──
do $$ begin
	assert (select array_agg(email order by email) from assignment_selection.access_grant where active) = array['nannijpsn@fab.mil.br'],
		'só nannijpsn@fab.mil.br deveria estar ativo';
	assert exists (select 1 from assignment_selection.access_grant where email = 'outro@fab.mil.br' and not active),
		'a concessão extra deveria ficar como histórico, desativada';
	assert (select role from assignment_selection.access_grant where email = 'nannijpsn@fab.mil.br') = 'admin';
end $$;

-- ── Escrita direta recusada ──────────────────────────────────────────────────
do $$ begin
	perform pg_temp.expect_error($q$ insert into assignment_selection.access_grant (email) values ('x@fab.mil.br') $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ update assignment_selection.access_grant set active = true $q$, 'ACCESS_CHANGE_UNAUDITED');
	perform pg_temp.expect_error($q$ delete from assignment_selection.access_grant $q$, 'ACCESS_CHANGE_UNAUDITED');
end $$;

-- ── Funções: mudança + log na mesma transação ───────────────────────────────
do $$
declare r jsonb; n_before bigint;
begin
	select count(*) into n_before from access_control.sensitive_operation_log;

	r := assignment_selection.grant_controller_access('00000000-0000-0000-0000-00000000000a', '  Novo@FAB.mil.br ', 'operator');
	assert r ->> 'email' = 'novo@fab.mil.br' and (r ->> 'active')::boolean, 'grant normaliza o e-mail e ativa';
	assert exists (
		select 1 from access_control.sensitive_operation_log
			where id = (r ->> 'log_id')::uuid
				and operation = 'assignment-selection.controller.grant'
				and actor_id = '00000000-0000-0000-0000-00000000000a'
				and target ->> 'target_email' = 'novo@fab.mil.br'
				and target -> 'previous' = 'null'::jsonb
	), 'grant grava o log com ator, operação e alvo';

	perform pg_temp.expect_error($q$ select assignment_selection.grant_controller_access('00000000-0000-0000-0000-00000000000a', 'novo@fab.mil.br', 'operator') $q$, 'CONTROLLER_ACCESS_ALREADY_ACTIVE');
	perform pg_temp.expect_error($q$ select assignment_selection.grant_controller_access('00000000-0000-0000-0000-00000000000a', 'sem-arroba', 'operator') $q$, 'ACCESS_CHANGE_INVALID');
	perform pg_temp.expect_error($q$ select assignment_selection.grant_controller_access('00000000-0000-0000-0000-00000000000a', 'a@b', 'root') $q$, 'ACCESS_CHANGE_INVALID');

	r := assignment_selection.revoke_controller_access('00000000-0000-0000-0000-00000000000a', 'novo@fab.mil.br');
	assert not (select active from assignment_selection.access_grant where email = 'novo@fab.mil.br'), 'revoke desativa';
	assert exists (
		select 1 from access_control.sensitive_operation_log
			where id = (r ->> 'log_id')::uuid and operation = 'assignment-selection.controller.revoke'
				and target -> 'previous' ->> 'role' = 'operator'
	), 'revoke grava o log com o antes';
	perform pg_temp.expect_error($q$ select assignment_selection.revoke_controller_access('00000000-0000-0000-0000-00000000000a', 'novo@fab.mil.br') $q$, 'CONTROLLER_ACCESS_NOT_FOUND');

	-- reativar com outro papel registra o antes
	r := assignment_selection.grant_controller_access('00000000-0000-0000-0000-00000000000a', 'novo@fab.mil.br', 'admin');
	assert exists (
		select 1 from access_control.sensitive_operation_log
			where id = (r ->> 'log_id')::uuid and target -> 'previous' = '{"role": "operator", "active": false}'::jsonb
	), 'reativação registra o estado anterior';

	assert (select count(*) from access_control.sensitive_operation_log) = n_before + 3, 'uma linha de log por mudança';
end $$;

-- Ator inexistente: nada é gravado (a concessão é desfeita junto com o log que falhou).
do $$ begin
	perform pg_temp.expect_error($q$ select assignment_selection.grant_controller_access('00000000-0000-0000-0000-0000000000ff', 'fantasma@fab.mil.br') $q$, 'ACCESS_ACTOR_NOT_FOUND');
	assert not exists (select 1 from assignment_selection.access_grant where email = 'fantasma@fab.mil.br'), 'sem ator, sem concessão';
end $$;

-- ── EXECUTE só da service role ──────────────────────────────────────────────
do $$ begin
	assert not has_function_privilege('anon', 'assignment_selection.grant_controller_access(uuid, text, text, text)', 'execute');
	assert not has_function_privilege('authenticated', 'assignment_selection.revoke_controller_access(uuid, text, text)', 'execute');
	assert has_function_privilege('service_role', 'assignment_selection.grant_controller_access(uuid, text, text, text)', 'execute');
	assert has_function_privilege('service_role', 'assignment_selection.revoke_controller_access(uuid, text, text)', 'execute');
end $$;

-- ── person: anônimo só vê a edição ativa ─────────────────────────────────────
set role anon;
do $$ begin
	assert (select array_agg(id order by id) from assignment_selection.person) = array[2, 3]::bigint[],
		'anon deveria ver só a edição ativa, confirmados inclusive';
end $$;
reset role;

-- Troca de edição ativa: a visibilidade acompanha.
update assignment_selection.edition set active = (name = '2025');
set role anon;
do $$ begin
	assert (select array_agg(id order by id) from assignment_selection.person) = array[1]::bigint[], 'a visibilidade segue a edição ativa';
end $$;
reset role;

-- Sem edição ativa: nada.
update assignment_selection.edition set active = false;
set role anon;
do $$ begin
	assert not exists (select 1 from assignment_selection.person), 'sem edição ativa o anônimo não vê ninguém';
end $$;
reset role;
update assignment_selection.edition set active = (name = '2026');

\echo 'assignment_selection: OK'
