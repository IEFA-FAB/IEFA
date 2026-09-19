-- access_change_audited_functions  (FASE 1 de 2 — só funções; seguro aplicar antes do merge)
-- Toda concessão, alteração ou revogação de acesso, em todo app, passa por uma função SQL que
-- grava a mudança E a linha de `access_control.sensitive_operation_log` na MESMA transação.
--
-- ── Por que funções, e não o log gravado pelo app ────────────────────────────
--
-- Diretriz do mantenedor (2026-09-18): conceder, alterar ou revogar acesso TEM que deixar
-- registro de quem fez, para quem, o quê e quando — e "isso deve ocorrer": um caminho
-- esquecido tem que FALHAR, não pular o log em silêncio. `change_module_permission`
-- (20260918130335) fechou o grant inline do contrate. O resto do repo ainda gravava de três
-- jeitos piores:
--
--   * sisub: o envelope `withSensitiveAudit` grava o log DEPOIS da mutação, em outra
--     instrução. Se o log falha, o acesso já está concedido e sem rastro;
--   * rumaer, sucont, forms, portal (papel do journal): nenhum log;
--   * scripts (`add-trainees.ts`): SQL cru, ator opcional.
--
-- Esta migration cria as funções. A FASE 2 (20260921130100) liga os triggers que recusam
-- escrita sem auditoria nas tabelas de acesso — ela SÓ pode ser aplicada depois que todos os
-- apps estiverem em produção chamando estas funções (a ordem está no cabeçalho dela).
--
-- ── O contexto de auditoria ──────────────────────────────────────────────────
--
-- Cada função abre o contexto com `access_control.audit_context('<operação>')` ANTES de
-- escrever. É um `set_config('iefa.audit_operation', …, true)`: LOCAL à transação, some no
-- commit/rollback — seguro no transaction pooler (6543), onde um SET de sessão vazaria para
-- o próximo cliente da mesma conexão. O trigger da fase 2 aceita a escrita quando o contexto
-- está aberto. `record_access_change` (o gravador do log) confere que a operação registrada
-- é a MESMA do contexto aberto.
--
-- Divisão de garantias, dita sem exagero: o TRIGGER garante que escrita FORA de função
-- auditada não passa. "Uma linha de log por mudança, na mesma transação" é garantia de
-- CONSTRUÇÃO de cada função (toda uma termina em `record_access_change`, e erro em qualquer
-- ponto desfaz tudo) — é o que o teste SQL local fixa função a função. Um trigger de linha não
-- enxerga se a função vai gravar o log depois; por isso função nova neste padrão tem de nascer
-- com o teste dela.
--
-- O contexto não é desligado ao fim da função: vale até o fim da transação. Via PostgREST
-- cada RPC é uma transação e nada mais roda nela; pelo Drizzle do sisub, a chamada é uma
-- instrução em autocommit. Escrita direta numa transação que JÁ chamou uma função auditada
-- passaria — é o buraco que a regra opengrep `access-table-direct-write` fecha no código.
--
-- Função nova que mexe em tabela de acesso (ex.: `set_module_block`, do PR de limpeza do α)
-- só precisa de UMA linha para passar pelo trigger:
--
--     perform access_control.audit_context('<app>.permission.block');
--
-- e, claro, gravar a própria linha de log na mesma transação.
--
-- ── O ator ───────────────────────────────────────────────────────────────────
--
-- Todas SECURITY INVOKER, executáveis só pela service role (e pelo dono, `postgres`, que é o
-- role do Drizzle do sisub). Confiam no `p_actor` que recebem: a garantia de que ele é a
-- SESSÃO, e nunca um campo da requisição, mora no app (helpers `@iefa/pbac`,
-- `@iefa/sisub-domain`, `apps/forms`, `apps/portal`). A service role não carrega sessão; não
-- há como a função descobrir a pessoa sozinha.
--
-- ── Alvo registrado ─────────────────────────────────────────────────────────
--
-- `target.target_user_id` é SEMPRE a pessoa cujo acesso mudou (quando há uma só); mudança de
-- política que alcança várias pessoas registra `affected_user_ids` (todas as anexadas, com o
-- prazo de cada anexo em `affected_members`). Toda alteração registra o ANTES (`previous`) e
-- o DEPOIS — a tela de auditoria do sisub lê exatamente essas chaves.
--
-- ── Erros ────────────────────────────────────────────────────────────────────
--
-- Mensagens ESTÁVEIS que os apps traduzem (o SQL cru nunca chega à tela):
--   22023 ACCESS_CHANGE_INVALID         argumento fora do contrato
--   23503 ACCESS_ACTOR_NOT_FOUND        o ator não existe em auth.users (nada é gravado)
--   23503 PERMISSION_REFERENCE_NOT_FOUND usuário, OM, cozinha ou refeitório inexistente
--   23505 PERMISSION_ALREADY_EXISTS     grant inline repetido (mesmo módulo, escopo e lado)
--   P0002 PERMISSION_NOT_FOUND          grant inline inexistente
--   P0002 POLICY_NOT_FOUND              política inexistente ou removida
--   55000 POLICY_MANAGED                política gerenciada (imutável)
--   55000 POLICY_NOT_DELETED            restaurar política que não está removida
--   23505 POLICY_NAME_TAKEN             nome já usado por outra política viva
--   P0002 STATEMENT_NOT_FOUND           statement inexistente
--   P0002 ATTACHMENT_NOT_FOUND          anexo inexistente
--   P0002 MCP_KEY_NOT_FOUND             chave inexistente ou de outra pessoa
--   P0002 QUESTIONNAIRE_NOT_FOUND / VIEWER_NOT_FOUND / EDITOR_NOT_FOUND
--   23505 VIEWER_ALREADY_EXISTS / EDITOR_ALREADY_EXISTS
--   P0002 PROFILE_NOT_FOUND             perfil do journal inexistente
--
-- Nenhuma tabela nova (o contrato de reset do treino varre TABELAS escopadas; funções e
-- índice não entram nele). DDL idempotente (reaplicável por db:push ou psql).

-- ═════════════════════════════════════════════════════════════════════════════
-- Infraestrutura: contexto + gravador do log
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function access_control.audit_context(p_operation text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	-- O nome vira filtro na tela de auditoria: sem espaço, sem texto livre.
	if p_operation is null or p_operation !~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,119}$' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'nome de operação inválido';
	end if;
	-- LOCAL à transação (terceiro argumento `true`): some no commit/rollback.
	perform set_config('iefa.audit_operation', p_operation, true);
end;
$$;

comment on function access_control.audit_context(text) is
	'Abre o contexto de auditoria da transação (iefa.audit_operation, local à transação). Os triggers de 20260921130100 só aceitam escrita em tabela de acesso com ele aberto. Toda função que escreve em tabela de acesso chama isto ANTES de escrever e grava a própria linha em sensitive_operation_log. Ver 20260921130000.';

create or replace function access_control.record_access_change(p_actor uuid, p_operation text, p_assurance text, p_target jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_id uuid;
begin
	if p_actor is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator obrigatório';
	end if;
	if p_assurance is null or p_assurance not in ('session', 'fresh') then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'assurance deve ser session ou fresh';
	end if;
	-- O log registra a operação do contexto aberto, e só ela: um gravador chamado fora de
	-- função auditada (ou com outro nome) não tem o que registrar.
	if coalesce(current_setting('iefa.audit_operation', true), '') is distinct from p_operation then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'contexto de auditoria ausente ou de outra operação';
	end if;

	begin
		insert into access_control.sensitive_operation_log (actor_id, operation, assurance, target)
			values (p_actor, p_operation, p_assurance, p_target)
			returning id into v_id;
	exception
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
	end;
	return v_id;
end;
$$;

comment on function access_control.record_access_change(uuid, text, text, jsonb) is
	'Grava a linha de sensitive_operation_log da mudança de acesso em curso — só com o contexto de auditoria aberto para a MESMA operação. Ator inexistente é ACCESS_ACTOR_NOT_FOUND e desfaz a transação inteira. Ver 20260921130000.';

-- A consulta "o que aconteceu com o acesso desta pessoa" (tela de auditoria do sisub).
create index if not exists sensitive_operation_log_target_user_idx
	on access_control.sensitive_operation_log ((target ->> 'target_user_id'), created_at desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- change_module_permission — o grant inline por CHAVE (contrate, rumaer, sucont)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Corpo idêntico ao de 20260919010255, com UMA linha a mais: o `audit_context`, depois da
-- validação dos argumentos. Mesma assinatura, então `create or replace` basta.

create or replace function access_control.change_module_permission(
	p_actor        uuid,
	p_app          text,
	p_action       text,
	p_user         uuid,
	p_module       text,
	p_level        integer,
	p_unit_id      bigint,
	p_kitchen_id   bigint,
	p_mess_hall_id bigint,
	p_expires_at   timestamptz,
	p_assurance    text default 'session',
	p_partition    text default 'all'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_prev_level   integer;
	v_prev_expires timestamptz;
	v_permission   uuid;
	v_removed      jsonb;
	v_removed_n    integer;
	v_target       jsonb;
	v_log_id       uuid;
	v_partition    text;
	v_deny_present boolean;
begin
	if p_actor is null or p_user is null or p_module is null or btrim(p_module) = '' then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ator, usuário e módulo são obrigatórios';
	end if;
	if p_app is null or p_app !~ '^[a-z0-9][a-z0-9-]*$' then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'app inválido';
	end if;
	if p_action is null or p_action not in ('grant', 'revoke') then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ação deve ser grant ou revoke';
	end if;
	if p_assurance is null or p_assurance not in ('session', 'fresh') then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'assurance deve ser session ou fresh';
	end if;
	if p_partition is null or p_partition not in ('allow', 'deny', 'all') then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'partição deve ser allow, deny ou all';
	end if;
	if num_nonnulls(p_unit_id, p_kitchen_id, p_mess_hall_id) > 1 then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'no máximo um escopo (OM, cozinha ou refeitório)';
	end if;
	if p_action = 'grant' and p_level is null then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'grant exige nível';
	end if;
	if p_action = 'revoke' and (p_level is not null or p_expires_at is not null) then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'revoke apaga a partição da chave: nível e prazo não se aplicam';
	end if;

	if p_action = 'grant' then
		v_partition := case when p_level > 0 then 'allow' else 'deny' end;
		if p_partition not in ('all', v_partition) then
			raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'no grant, a partição sai do nível: allow exige nível > 0, deny exige nível <= 0';
		end if;
	else
		v_partition := p_partition;
	end if;

	-- 20260921130000: a escrita abaixo só passa pelo trigger com o contexto aberto.
	perform access_control.audit_context(p_app || '.permission.' || p_action);

	begin
		if p_action = 'grant' then
			-- 20260921130000: serializa concessões concorrentes na MESMA chave. Sem isto, as duas
			-- leem "não havia" e o log das duas registra `previous_level` nulo — a segunda, na
			-- verdade, sobrescreveu a primeira. O `for update` abaixo não trava linha inexistente.
			perform pg_advisory_xact_lock(hashtextextended(
				'access_control.user_permissions:' || p_user || ':' || p_module || ':' || coalesce(p_unit_id::text, '') || ':'
					|| coalesce(p_kitchen_id::text, '') || ':' || coalesce(p_mess_hall_id::text, '') || ':' || v_partition, 0));
			select up.level, up.expires_at
				into v_prev_level, v_prev_expires
				from access_control.user_permissions up
				where up.user_id = p_user
					and up.module = p_module
					and up.unit_id is not distinct from p_unit_id
					and up.kitchen_id is not distinct from p_kitchen_id
					and up.mess_hall_id is not distinct from p_mess_hall_id
					and (case when p_level > 0 then up.level > 0 else up.level <= 0 end)
				for update;

			if p_level > 0 then
				insert into access_control.user_permissions (user_id, module, level, unit_id, kitchen_id, mess_hall_id, expires_at)
					values (p_user, p_module, p_level, p_unit_id, p_kitchen_id, p_mess_hall_id, p_expires_at)
					on conflict (user_id, module, mess_hall_id, kitchen_id, unit_id) where level > 0
					do update set level = excluded.level, expires_at = excluded.expires_at
					returning id into v_permission;
			else
				insert into access_control.user_permissions (user_id, module, level, unit_id, kitchen_id, mess_hall_id, expires_at)
					values (p_user, p_module, p_level, p_unit_id, p_kitchen_id, p_mess_hall_id, p_expires_at)
					on conflict (user_id, module, mess_hall_id, kitchen_id, unit_id) where level <= 0
					do update set level = excluded.level, expires_at = excluded.expires_at
					returning id into v_permission;
			end if;

			select exists (
				select 1
					from access_control.user_permissions up
					where up.user_id = p_user
						and up.module = p_module
						and up.unit_id is not distinct from p_unit_id
						and up.kitchen_id is not distinct from p_kitchen_id
						and up.mess_hall_id is not distinct from p_mess_hall_id
						and up.level <= 0
						and (up.expires_at is null or up.expires_at > now())
			) into v_deny_present;

			v_target := jsonb_build_object(
				'target_user_id', p_user,
				'module', p_module,
				'level', p_level,
				'unit_id', p_unit_id,
				'kitchen_id', p_kitchen_id,
				'mess_hall_id', p_mess_hall_id,
				'expires_at', p_expires_at,
				'partition', v_partition,
				'previous_level', v_prev_level,
				'previous_expires_at', v_prev_expires,
				'permission_id', v_permission,
				'deny_present', v_deny_present
			);
		else
			with removed as (
				delete from access_control.user_permissions up
					where up.user_id = p_user
						and up.module = p_module
						and up.unit_id is not distinct from p_unit_id
						and up.kitchen_id is not distinct from p_kitchen_id
						and up.mess_hall_id is not distinct from p_mess_hall_id
						and (
							v_partition = 'all'
							or (v_partition = 'allow' and up.level > 0)
							or (v_partition = 'deny' and up.level <= 0)
						)
					returning up.id, up.level, up.expires_at, up.created_at
			)
			select
				coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'level', r.level, 'expires_at', r.expires_at, 'created_at', r.created_at) order by r.level desc), '[]'::jsonb),
				count(*)::integer,
				coalesce(max(r.level) filter (where r.level > 0), max(r.level))
				into v_removed, v_removed_n, v_prev_level
				from removed r;

			if v_removed_n = 0 then
				raise exception 'PERMISSION_NOT_FOUND' using errcode = 'P0002', detail = 'nenhum grant inline nesta partição da chave';
			end if;

			v_target := jsonb_build_object(
				'target_user_id', p_user,
				'module', p_module,
				'level', null,
				'unit_id', p_unit_id,
				'kitchen_id', p_kitchen_id,
				'mess_hall_id', p_mess_hall_id,
				'partition', v_partition,
				'previous_level', v_prev_level,
				'removed', v_removed
			);
		end if;
	exception
		when unique_violation then
			raise exception 'PERMISSION_CONFLICT' using errcode = '23505', detail = 'outra alteração concorrente na mesma chave; tente de novo';
		when foreign_key_violation then
			raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'usuário, OM, cozinha ou refeitório inexistente';
	end;

	begin
		insert into access_control.sensitive_operation_log (actor_id, operation, assurance, target)
			values (p_actor, p_app || '.permission.' || p_action, p_assurance, v_target)
			returning id into v_log_id;
	exception
		when foreign_key_violation then
			raise exception 'PERMISSION_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
	end;

	return jsonb_build_object(
		'log_id', v_log_id,
		'action', p_action,
		'partition', v_partition,
		'permission_id', v_permission,
		'previous_level', v_prev_level,
		'removed', coalesce(v_removed_n, 0),
		'deny_present', v_deny_present
	);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Grant inline por LINHA (console do sisub)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- O console do sisub edita a LINHA (`permissionId`): troca nível, escopo e prazo de um grant
-- existente, e a criação é estrita — repetir (módulo, escopo, lado) é erro legível
-- ("edite a concessão existente"), não um upsert silencioso que reescreveria o prazo de
-- outra pessoa. `change_module_permission` trabalha por CHAVE e é upsert; por isso estas três.

create or replace function access_control.permission_row_json(p access_control.user_permissions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select jsonb_build_object(
		'permission_id', p.id,
		'module', p.module,
		'level', p.level,
		'unit_id', p.unit_id,
		'kitchen_id', p.kitchen_id,
		'mess_hall_id', p.mess_hall_id,
		'expires_at', p.expires_at,
		'partition', case when p.level > 0 then 'allow' else 'deny' end
	);
$$;

create or replace function access_control.create_user_permission(
	p_actor        uuid,
	p_operation    text,
	p_user         uuid,
	p_module       text,
	p_level        integer,
	p_unit_id      bigint,
	p_kitchen_id   bigint,
	p_mess_hall_id bigint,
	p_expires_at   timestamptz,
	p_assurance    text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_row    access_control.user_permissions;
	v_log_id uuid;
begin
	if p_user is null or p_module is null or btrim(p_module) = '' or p_level is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'usuário, módulo e nível são obrigatórios';
	end if;
	if num_nonnulls(p_unit_id, p_kitchen_id, p_mess_hall_id) > 1 then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'no máximo um escopo (OM, cozinha ou refeitório)';
	end if;

	perform access_control.audit_context(p_operation);

	begin
		insert into access_control.user_permissions (user_id, module, level, unit_id, kitchen_id, mess_hall_id, expires_at)
			values (p_user, p_module, p_level, p_unit_id, p_kitchen_id, p_mess_hall_id, p_expires_at)
			returning * into v_row;
	exception
		when unique_violation then
			raise exception 'PERMISSION_ALREADY_EXISTS' using errcode = '23505', detail = 'já existe grant deste módulo, neste escopo e neste lado (allow/deny)';
		when foreign_key_violation then
			raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'usuário, OM, cozinha ou refeitório inexistente';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		access_control.permission_row_json(v_row) || jsonb_build_object('target_user_id', v_row.user_id, 'action', 'grant', 'previous', null)
	);

	return jsonb_build_object('log_id', v_log_id, 'permission_id', v_row.id, 'user_id', v_row.user_id);
end;
$$;

create or replace function access_control.update_user_permission(
	p_actor          uuid,
	p_operation      text,
	p_permission_id  uuid,
	p_level          integer,
	p_unit_id        bigint,
	p_kitchen_id     bigint,
	p_mess_hall_id   bigint,
	p_expires_at     timestamptz,
	-- `false` = o chamador não mexeu no prazo (PATCH); `true` = `p_expires_at` substitui
	-- (inclusive por nulo, que torna o grant permanente).
	p_set_expires_at boolean,
	p_assurance      text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_before access_control.user_permissions;
	v_after  access_control.user_permissions;
	v_log_id uuid;
begin
	if p_permission_id is null or p_level is null or p_set_expires_at is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'grant, nível e p_set_expires_at são obrigatórios';
	end if;
	if num_nonnulls(p_unit_id, p_kitchen_id, p_mess_hall_id) > 1 then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'no máximo um escopo (OM, cozinha ou refeitório)';
	end if;

	perform access_control.audit_context(p_operation);

	-- O ANTES, travado: é o `previous` do log.
	select * into v_before from access_control.user_permissions where id = p_permission_id for update;
	if not found then
		raise exception 'PERMISSION_NOT_FOUND' using errcode = 'P0002', detail = 'grant inexistente';
	end if;

	begin
		update access_control.user_permissions
			set level = p_level,
				unit_id = p_unit_id,
				kitchen_id = p_kitchen_id,
				mess_hall_id = p_mess_hall_id,
				expires_at = case when p_set_expires_at then p_expires_at else expires_at end
			where id = p_permission_id
			returning * into v_after;
	exception
		when unique_violation then
			raise exception 'PERMISSION_ALREADY_EXISTS' using errcode = '23505', detail = 'o usuário já tem outro grant deste módulo neste escopo e neste lado';
		when foreign_key_violation then
			raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'OM, cozinha ou refeitório inexistente';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		access_control.permission_row_json(v_after)
			|| jsonb_build_object('target_user_id', v_after.user_id, 'action', 'change', 'previous', access_control.permission_row_json(v_before))
	);

	return jsonb_build_object(
		'log_id', v_log_id,
		'permission_id', v_after.id,
		'user_id', v_after.user_id,
		'module', v_after.module,
		'previous_level', v_before.level
	);
end;
$$;

create or replace function access_control.delete_user_permission(
	p_actor         uuid,
	p_operation     text,
	p_permission_id uuid,
	p_assurance     text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_row    access_control.user_permissions;
	v_log_id uuid;
begin
	if p_permission_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'grant obrigatório';
	end if;

	perform access_control.audit_context(p_operation);

	delete from access_control.user_permissions where id = p_permission_id returning * into v_row;
	if not found then
		raise exception 'PERMISSION_NOT_FOUND' using errcode = 'P0002', detail = 'grant inexistente';
	end if;

	-- Depois do delete, o log é o único lugar onde o acesso revogado ainda existe: vai inteiro.
	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'target_user_id', v_row.user_id,
			'action', 'revoke',
			'permission_id', v_row.id,
			'module', v_row.module,
			'level', null,
			'partition', case when v_row.level > 0 then 'allow' else 'deny' end,
			'unit_id', v_row.unit_id,
			'kitchen_id', v_row.kitchen_id,
			'mess_hall_id', v_row.mess_hall_id,
			'previous', access_control.permission_row_json(v_row) || jsonb_build_object('created_at', v_row.created_at)
		)
	);

	return jsonb_build_object(
		'log_id', v_log_id,
		'permission_id', v_row.id,
		'user_id', v_row.user_id,
		'module', v_row.module,
		'level', v_row.level
	);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Políticas nomeadas (sisub): ciclo de vida, statements e anexos
-- ═════════════════════════════════════════════════════════════════════════════

-- Quem é alcançado pela política: todos os anexos, com o prazo de cada um. Mudar o que a
-- política concede muda o acesso de todas estas pessoas de uma vez — o log registra quem.
create or replace function access_control.policy_members_json(p_policy_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
	select jsonb_build_object(
		'affected_user_ids', coalesce(jsonb_agg(a.user_id order by a.created_at), '[]'::jsonb),
		'affected_members', coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'expires_at', a.expires_at) order by a.created_at), '[]'::jsonb),
		'affected_member_count', count(*)
	)
	from access_control.user_policy_attachment a
	where a.policy_id = p_policy_id;
$$;

create or replace function access_control.policy_statements_json(p_policy_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'statement_id', s.id, 'module', s.module, 'level', s.level,
		'unit_id', s.unit_id, 'kitchen_id', s.kitchen_id, 'mess_hall_id', s.mess_hall_id
	) order by s.module, s.created_at), '[]'::jsonb)
	from access_control.policy_statement s
	where s.policy_id = p_policy_id;
$$;

create or replace function access_control.statement_row_json(s access_control.policy_statement)
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select jsonb_build_object(
		'statement_id', s.id, 'module', s.module, 'level', s.level,
		'unit_id', s.unit_id, 'kitchen_id', s.kitchen_id, 'mess_hall_id', s.mess_hall_id
	);
$$;

-- Carrega a política VIVA e editável, travada até o fim da transação (serializa com o
-- delete, o restore e o anexo). Gerenciada é imutável: é assim que o "Conjunto Treino" não
-- vira passe de escrita para a FAB inteira.
create or replace function access_control.lock_editable_policy(p_policy_id uuid)
returns access_control.policy
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy access_control.policy;
begin
	select * into v_policy from access_control.policy where id = p_policy_id for update;
	if not found or v_policy.deleted_at is not null then
		raise exception 'POLICY_NOT_FOUND' using errcode = 'P0002', detail = 'política inexistente ou removida';
	end if;
	if v_policy.managed then
		raise exception 'POLICY_MANAGED' using errcode = '55000', detail = 'política gerenciada pelo sistema é imutável';
	end if;
	return v_policy;
end;
$$;

create or replace function access_control.create_policy(
	p_actor       uuid,
	p_operation   text,
	p_name        text,
	p_description text,
	p_assurance   text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy access_control.policy;
	v_log_id uuid;
begin
	if p_name is null or btrim(p_name) = '' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'nome obrigatório';
	end if;

	perform access_control.audit_context(p_operation);

	begin
		insert into access_control.policy (name, description, managed)
			values (p_name, p_description, false)
			returning * into v_policy;
	exception
		when unique_violation then
			raise exception 'POLICY_NAME_TAKEN' using errcode = '23505', detail = 'já existe política viva com este nome';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'create', 'policy_id', v_policy.id, 'policy_name', v_policy.name, 'description', v_policy.description)
	);

	return to_jsonb(v_policy) || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function access_control.update_policy(
	p_actor           uuid,
	p_operation       text,
	p_policy_id       uuid,
	-- nulo = não mexe no nome
	p_name            text,
	p_description     text,
	-- `false` = não mexe na descrição; `true` = substitui (nulo limpa)
	p_set_description boolean,
	p_assurance       text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_before access_control.policy;
	v_after  access_control.policy;
	v_log_id uuid;
begin
	if p_policy_id is null or p_set_description is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'política e p_set_description são obrigatórios';
	end if;
	if p_name is not null and btrim(p_name) = '' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'nome vazio';
	end if;

	perform access_control.audit_context(p_operation);
	v_before := access_control.lock_editable_policy(p_policy_id);

	begin
		update access_control.policy
			set name = coalesce(p_name, name),
				description = case when p_set_description then p_description else description end,
				updated_at = now()
			where id = p_policy_id
			returning * into v_after;
	exception
		when unique_violation then
			raise exception 'POLICY_NAME_TAKEN' using errcode = '23505', detail = 'já existe política viva com este nome';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'action', 'change',
			'policy_id', v_after.id,
			'policy_name', v_after.name,
			'description', v_after.description,
			'previous', jsonb_build_object('policy_name', v_before.name, 'description', v_before.description)
		)
	);

	return to_jsonb(v_after) || jsonb_build_object('log_id', v_log_id);
end;
$$;

-- Soft delete: a política deixa de compor o acesso de TODOS os anexados no mesmo instante.
-- O log registra quem eram eles e o que a política concedia — é a revogação em massa.
create or replace function access_control.delete_policy(
	p_actor     uuid,
	p_operation text,
	p_policy_id uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy access_control.policy;
	v_log_id uuid;
begin
	if p_policy_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'política obrigatória';
	end if;

	perform access_control.audit_context(p_operation);
	v_policy := access_control.lock_editable_policy(p_policy_id);

	update access_control.policy set deleted_at = now() where id = p_policy_id;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'revoke', 'policy_id', v_policy.id, 'policy_name', v_policy.name, 'statements', access_control.policy_statements_json(p_policy_id))
			|| access_control.policy_members_json(p_policy_id)
	);

	return jsonb_build_object('log_id', v_log_id, 'policy_id', v_policy.id);
end;
$$;

-- Reverte o soft delete: devolve o acesso a TODOS os anexados. É concessão em massa, e o log
-- a registra como tal.
create or replace function access_control.restore_policy(
	p_actor     uuid,
	p_operation text,
	p_policy_id uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy access_control.policy;
	v_after  access_control.policy;
	v_log_id uuid;
begin
	if p_policy_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'política obrigatória';
	end if;

	perform access_control.audit_context(p_operation);

	select * into v_policy from access_control.policy where id = p_policy_id for update;
	if not found then
		raise exception 'POLICY_NOT_FOUND' using errcode = 'P0002', detail = 'política inexistente';
	end if;
	if v_policy.deleted_at is null then
		raise exception 'POLICY_NOT_DELETED' using errcode = '55000', detail = 'a política não está removida';
	end if;

	begin
		update access_control.policy set deleted_at = null, updated_at = now() where id = p_policy_id returning * into v_after;
	exception
		when unique_violation then
			raise exception 'POLICY_NAME_TAKEN' using errcode = '23505', detail = 'outra política viva usa este nome';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'grant', 'policy_id', v_after.id, 'policy_name', v_after.name, 'statements', access_control.policy_statements_json(p_policy_id))
			|| access_control.policy_members_json(p_policy_id)
	);

	return to_jsonb(v_after) || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function access_control.add_policy_statement(
	p_actor        uuid,
	p_operation    text,
	p_policy_id    uuid,
	p_module       text,
	p_level        integer,
	p_unit_id      bigint,
	p_kitchen_id   bigint,
	p_mess_hall_id bigint,
	p_assurance    text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy    access_control.policy;
	v_statement access_control.policy_statement;
	v_log_id    uuid;
begin
	if p_policy_id is null or p_module is null or btrim(p_module) = '' or p_level is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'política, módulo e nível são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);
	v_policy := access_control.lock_editable_policy(p_policy_id);

	begin
		insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
			values (p_policy_id, p_module, p_level, p_unit_id, p_kitchen_id, p_mess_hall_id)
			returning * into v_statement;
	exception
		when check_violation then
			raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'nível fora de 0–3 ou mais de um escopo';
		when foreign_key_violation then
			raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'OM, cozinha ou refeitório inexistente';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'grant', 'policy_id', v_policy.id, 'policy_name', v_policy.name, 'statement', access_control.statement_row_json(v_statement), 'previous', null)
			|| access_control.policy_members_json(p_policy_id)
	);

	return access_control.statement_row_json(v_statement) || jsonb_build_object('log_id', v_log_id, 'policy_id', v_policy.id);
end;
$$;

create or replace function access_control.update_policy_statement(
	p_actor        uuid,
	p_operation    text,
	p_statement_id uuid,
	p_module       text,
	p_level        integer,
	p_unit_id      bigint,
	p_kitchen_id   bigint,
	p_mess_hall_id bigint,
	p_assurance    text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy_id uuid;
	v_policy    access_control.policy;
	v_before    access_control.policy_statement;
	v_after     access_control.policy_statement;
	v_log_id    uuid;
begin
	if p_statement_id is null or p_module is null or btrim(p_module) = '' or p_level is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'statement, módulo e nível são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	select policy_id into v_policy_id from access_control.policy_statement where id = p_statement_id;
	if not found then
		raise exception 'STATEMENT_NOT_FOUND' using errcode = 'P0002', detail = 'statement inexistente';
	end if;
	-- A política primeiro, depois o statement: a mesma ordem de trava do add/remove.
	v_policy := access_control.lock_editable_policy(v_policy_id);
	select * into v_before from access_control.policy_statement where id = p_statement_id and policy_id = v_policy_id for update;
	if not found then
		raise exception 'STATEMENT_NOT_FOUND' using errcode = 'P0002', detail = 'statement inexistente';
	end if;

	begin
		update access_control.policy_statement
			set module = p_module, level = p_level, unit_id = p_unit_id, kitchen_id = p_kitchen_id, mess_hall_id = p_mess_hall_id
			where id = p_statement_id
			returning * into v_after;
	exception
		when check_violation then
			raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'nível fora de 0–3 ou mais de um escopo';
		when foreign_key_violation then
			raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'OM, cozinha ou refeitório inexistente';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'action', 'change', 'policy_id', v_policy.id, 'policy_name', v_policy.name,
			'statement', access_control.statement_row_json(v_after),
			'previous', access_control.statement_row_json(v_before)
		) || access_control.policy_members_json(v_policy.id)
	);

	return access_control.statement_row_json(v_after) || jsonb_build_object('log_id', v_log_id, 'policy_id', v_policy.id);
end;
$$;

create or replace function access_control.remove_policy_statement(
	p_actor        uuid,
	p_operation    text,
	p_statement_id uuid,
	p_assurance    text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy_id uuid;
	v_policy    access_control.policy;
	v_removed   access_control.policy_statement;
	v_log_id    uuid;
begin
	if p_statement_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'statement obrigatório';
	end if;

	perform access_control.audit_context(p_operation);

	select policy_id into v_policy_id from access_control.policy_statement where id = p_statement_id;
	if not found then
		raise exception 'STATEMENT_NOT_FOUND' using errcode = 'P0002', detail = 'statement inexistente';
	end if;
	v_policy := access_control.lock_editable_policy(v_policy_id);

	delete from access_control.policy_statement where id = p_statement_id and policy_id = v_policy_id returning * into v_removed;
	if not found then
		raise exception 'STATEMENT_NOT_FOUND' using errcode = 'P0002', detail = 'statement inexistente';
	end if;

	-- O statement removido vai inteiro: depois do delete, o log é o único lugar onde ele existe.
	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'revoke', 'policy_id', v_policy.id, 'policy_name', v_policy.name, 'statement', null, 'previous', access_control.statement_row_json(v_removed))
			|| access_control.policy_members_json(v_policy.id)
	);

	return jsonb_build_object('log_id', v_log_id, 'policy_id', v_policy.id, 'statement_id', v_removed.id);
end;
$$;

-- Anexar é upsert: reanexar reescreve o prazo. O log distingue a CONCESSÃO nova
-- (`change: "attach"`) da alteração de prazo de um anexo existente (`change: "expiry"`),
-- com o prazo anterior.
create or replace function access_control.attach_policy(
	p_actor      uuid,
	p_operation  text,
	p_user       uuid,
	p_policy_id  uuid,
	p_expires_at timestamptz,
	p_assurance  text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_policy   access_control.policy;
	v_before   access_control.user_policy_attachment;
	v_existed  boolean;
	v_after    access_control.user_policy_attachment;
	v_log_id   uuid;
begin
	if p_user is null or p_policy_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'usuário e política são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	-- Política viva, travada contra o delete concorrente. Gerenciada PODE ser anexada — a
	-- imutabilidade é do conteúdo, não do uso (é assim que o "Conjunto Treino" é concedido).
	select * into v_policy from access_control.policy where id = p_policy_id for share;
	if not found or v_policy.deleted_at is not null then
		raise exception 'POLICY_NOT_FOUND' using errcode = 'P0002', detail = 'política inexistente ou removida';
	end if;

	-- Dois administradores anexando ao mesmo tempo: sem esta trava, os dois leem "não havia
	-- anexo" e os dois registram CONCESSÃO — o segundo, na verdade, só reescreveu o prazo. A
	-- trava serializa a leitura do antes; o `for update` sozinho não trava linha que não existe.
	perform pg_advisory_xact_lock(hashtextextended('access_control.attach_policy:' || p_user || ':' || p_policy_id, 0));
	select * into v_before from access_control.user_policy_attachment where user_id = p_user and policy_id = p_policy_id for update;
	v_existed := found;

	insert into access_control.user_policy_attachment (user_id, policy_id, created_by, expires_at)
		values (p_user, p_policy_id, p_actor, p_expires_at)
		on conflict (user_id, policy_id) do update set expires_at = excluded.expires_at
		returning * into v_after;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'target_user_id', p_user,
			'action', case when v_existed then 'change' else 'grant' end,
			'change', case when v_existed then 'expiry' else 'attach' end,
			'attachment_id', v_after.id,
			'policy_id', v_policy.id,
			'policy_name', v_policy.name,
			'expires_at', v_after.expires_at,
			'previous', case when v_existed then jsonb_build_object('expires_at', v_before.expires_at, 'created_at', v_before.created_at, 'created_by', v_before.created_by) end
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'attachment_id', v_after.id, 'change', case when v_existed then 'expiry' else 'attach' end);
end;
$$;

create or replace function access_control.detach_policy(
	p_actor     uuid,
	p_operation text,
	p_user      uuid,
	p_policy_id uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_removed access_control.user_policy_attachment;
	v_name    text;
	v_log_id  uuid;
begin
	if p_user is null or p_policy_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'usuário e política são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	delete from access_control.user_policy_attachment where user_id = p_user and policy_id = p_policy_id returning * into v_removed;
	if not found then
		raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0002', detail = 'a política não está anexada a este usuário';
	end if;
	select name into v_name from access_control.policy where id = p_policy_id;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'target_user_id', p_user,
			'action', 'revoke',
			'attachment_id', v_removed.id,
			'policy_id', p_policy_id,
			'policy_name', v_name,
			'previous', jsonb_build_object('expires_at', v_removed.expires_at, 'created_at', v_removed.created_at, 'created_by', v_removed.created_by)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'attachment_id', v_removed.id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Chaves de API do MCP (credencial de prazo longo, sem senha e sem segundo fator)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Self-only POR CONSTRUÇÃO: a chave é do ator (`user_id = p_actor`). O hash nunca vai ao log.

create or replace function access_control.create_mcp_api_key(
	p_actor      uuid,
	p_operation  text,
	p_label      text,
	p_key_hash   text,
	p_key_prefix text,
	p_expires_at timestamptz,
	p_assurance  text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_key    access_control.mcp_api_keys;
	v_log_id uuid;
begin
	if p_actor is null or p_label is null or btrim(p_label) = '' or p_key_hash is null or p_key_prefix is null or p_expires_at is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator, rótulo, hash, prefixo e prazo são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	begin
		insert into access_control.mcp_api_keys (user_id, label, key_hash, key_prefix, expires_at)
			values (p_actor, p_label, p_key_hash, p_key_prefix, p_expires_at)
			returning * into v_key;
	exception
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('target_user_id', p_actor, 'action', 'grant', 'key_id', v_key.id, 'key_prefix', v_key.key_prefix, 'label', v_key.label, 'expires_at', v_key.expires_at)
	);

	return jsonb_build_object(
		'log_id', v_log_id,
		'id', v_key.id,
		'label', v_key.label,
		'key_prefix', v_key.key_prefix,
		'is_active', v_key.is_active,
		'last_used_at', v_key.last_used_at,
		'created_at', v_key.created_at,
		'expires_at', v_key.expires_at
	);
end;
$$;

create or replace function access_control.revoke_mcp_api_key(
	p_actor     uuid,
	p_operation text,
	p_key_id    uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_key    access_control.mcp_api_keys;
	v_log_id uuid;
begin
	if p_actor is null or p_key_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator e chave são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	select * into v_key from access_control.mcp_api_keys where id = p_key_id and user_id = p_actor for update;
	if not found then
		raise exception 'MCP_KEY_NOT_FOUND' using errcode = 'P0002', detail = 'chave inexistente ou de outra pessoa';
	end if;
	-- Já revogada: nada acontece, nada é registrado (revogar o revogado não é um fato).
	if not v_key.is_active then
		return jsonb_build_object('log_id', null, 'id', v_key.id, 'changed', false);
	end if;

	update access_control.mcp_api_keys set is_active = false where id = p_key_id;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('target_user_id', p_actor, 'action', 'revoke', 'key_id', v_key.id, 'key_prefix', v_key.key_prefix, 'label', v_key.label, 'expires_at', v_key.expires_at)
	);

	return jsonb_build_object('log_id', v_log_id, 'id', v_key.id, 'changed', true);
end;
$$;

create or replace function access_control.delete_mcp_api_key(
	p_actor     uuid,
	p_operation text,
	p_key_id    uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_key    access_control.mcp_api_keys;
	v_log_id uuid;
begin
	if p_actor is null or p_key_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator e chave são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	delete from access_control.mcp_api_keys where id = p_key_id and user_id = p_actor returning * into v_key;
	if not found then
		raise exception 'MCP_KEY_NOT_FOUND' using errcode = 'P0002', detail = 'chave inexistente ou de outra pessoa';
	end if;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'target_user_id', p_actor, 'action', 'revoke', 'key_id', v_key.id, 'key_prefix', v_key.key_prefix, 'label', v_key.label,
			'previous', jsonb_build_object('is_active', v_key.is_active, 'expires_at', v_key.expires_at, 'created_at', v_key.created_at, 'last_used_at', v_key.last_used_at)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'id', v_key.id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- forms: visualizadores de respostas (com escopo) e editores de questionário
-- ═════════════════════════════════════════════════════════════════════════════
--
-- O visualizador e as regras de escopo dele eram duas escritas separadas pelo app: um
-- visualizador podia nascer "global" e perder a regra de escopo no meio do caminho —
-- VENDO TUDO até alguém perceber. Aqui o visualizador e as regras entram (ou saem) juntos.

create or replace function forms.viewer_bindings_json(p_viewer_row_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object('attribute_key', b.attribute_key, 'effect', b.effect, 'value', b.value) order by b.attribute_key, b.effect, b.value), '[]'::jsonb)
	from forms.response_viewer_scope_binding b
	where b.response_viewer_id = p_viewer_row_id;
$$;

-- Substitui as regras de escopo do visualizador. Interna: só as funções auditadas abaixo a
-- chamam, com o contexto já aberto.
create or replace function forms.replace_viewer_bindings(p_viewer_row_id uuid, p_bindings jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'regras de escopo devem ser uma lista';
	end if;

	delete from forms.response_viewer_scope_binding where response_viewer_id = p_viewer_row_id;

	begin
		insert into forms.response_viewer_scope_binding (response_viewer_id, attribute_key, effect, value)
			select p_viewer_row_id, b.attribute_key, b.effect::forms.response_scope_effect, b.value
				from jsonb_to_recordset(p_bindings) as b(attribute_key text, effect text, value text);
	exception
		when check_violation or not_null_violation or invalid_text_representation or unique_violation then
			raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'regra de escopo inválida ou repetida';
	end;
end;
$$;

create or replace function forms.add_response_viewer(
	p_actor            uuid,
	p_questionnaire_id uuid,
	p_viewer_id        uuid,
	p_viewer_email     text,
	p_scope_mode       text,
	p_bindings         jsonb,
	p_assurance        text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_viewer forms.response_viewer;
	v_log_id uuid;
begin
	if p_actor is null or p_questionnaire_id is null or p_viewer_id is null or p_viewer_email is null or p_scope_mode is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'questionário, visualizador, e-mail e modo são obrigatórios';
	end if;

	perform access_control.audit_context('forms.viewer.grant');

	perform 1 from forms.questionnaire where id = p_questionnaire_id for share;
	if not found then
		raise exception 'QUESTIONNAIRE_NOT_FOUND' using errcode = 'P0002', detail = 'questionário inexistente';
	end if;

	begin
		insert into forms.response_viewer (questionnaire_id, viewer_id, viewer_email, added_by, scope_mode)
			values (p_questionnaire_id, p_viewer_id, p_viewer_email, p_actor, p_scope_mode::forms.response_scope_mode)
			returning * into v_viewer;
	exception
		when unique_violation then
			raise exception 'VIEWER_ALREADY_EXISTS' using errcode = '23505', detail = 'este usuário já é visualizador';
		when invalid_text_representation then
			raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'modo de escopo inválido';
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'visualizador ou ator inexistente';
	end;

	perform forms.replace_viewer_bindings(v_viewer.id, coalesce(p_bindings, '[]'::jsonb));

	v_log_id := access_control.record_access_change(
		p_actor, 'forms.viewer.grant', p_assurance,
		jsonb_build_object(
			'target_user_id', p_viewer_id, 'action', 'grant', 'questionnaire_id', p_questionnaire_id, 'viewer_row_id', v_viewer.id,
			'scope_mode', v_viewer.scope_mode, 'bindings', forms.viewer_bindings_json(v_viewer.id), 'previous', null
		)
	);

	return to_jsonb(v_viewer) || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function forms.update_response_viewer_policy(
	p_actor            uuid,
	p_questionnaire_id uuid,
	p_viewer_row_id    uuid,
	p_scope_mode       text,
	p_bindings         jsonb,
	p_assurance        text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_before          forms.response_viewer;
	v_before_bindings jsonb;
	v_after           forms.response_viewer;
	v_log_id          uuid;
begin
	if p_actor is null or p_questionnaire_id is null or p_viewer_row_id is null or p_scope_mode is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'questionário, visualizador e modo são obrigatórios';
	end if;

	perform access_control.audit_context('forms.viewer.change');

	select * into v_before from forms.response_viewer where id = p_viewer_row_id and questionnaire_id = p_questionnaire_id for update;
	if not found then
		raise exception 'VIEWER_NOT_FOUND' using errcode = 'P0002', detail = 'visualizador inexistente neste questionário';
	end if;
	v_before_bindings := forms.viewer_bindings_json(p_viewer_row_id);

	begin
		update forms.response_viewer set scope_mode = p_scope_mode::forms.response_scope_mode where id = p_viewer_row_id returning * into v_after;
	exception
		when invalid_text_representation then
			raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'modo de escopo inválido';
	end;

	perform forms.replace_viewer_bindings(p_viewer_row_id, coalesce(p_bindings, '[]'::jsonb));

	v_log_id := access_control.record_access_change(
		p_actor, 'forms.viewer.change', p_assurance,
		jsonb_build_object(
			'target_user_id', v_after.viewer_id, 'action', 'change', 'questionnaire_id', p_questionnaire_id, 'viewer_row_id', v_after.id,
			'scope_mode', v_after.scope_mode, 'bindings', forms.viewer_bindings_json(p_viewer_row_id),
			'previous', jsonb_build_object('scope_mode', v_before.scope_mode, 'bindings', v_before_bindings)
		)
	);

	return to_jsonb(v_after) || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function forms.remove_response_viewer(
	p_actor            uuid,
	p_questionnaire_id uuid,
	p_viewer_row_id    uuid,
	p_assurance        text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_bindings jsonb;
	v_removed  forms.response_viewer;
	v_log_id   uuid;
begin
	if p_actor is null or p_questionnaire_id is null or p_viewer_row_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'questionário e visualizador são obrigatórios';
	end if;

	perform access_control.audit_context('forms.viewer.revoke');

	-- As regras saem por cascade junto com o visualizador; leia-as antes.
	v_bindings := forms.viewer_bindings_json(p_viewer_row_id);
	delete from forms.response_viewer where id = p_viewer_row_id and questionnaire_id = p_questionnaire_id returning * into v_removed;
	if not found then
		raise exception 'VIEWER_NOT_FOUND' using errcode = 'P0002', detail = 'visualizador inexistente neste questionário';
	end if;

	v_log_id := access_control.record_access_change(
		p_actor, 'forms.viewer.revoke', p_assurance,
		jsonb_build_object(
			'target_user_id', v_removed.viewer_id, 'action', 'revoke', 'questionnaire_id', p_questionnaire_id, 'viewer_row_id', v_removed.id,
			'previous', jsonb_build_object('scope_mode', v_removed.scope_mode, 'bindings', v_bindings, 'added_by', v_removed.added_by, 'created_at', v_removed.created_at)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'id', v_removed.id);
end;
$$;

create or replace function forms.add_questionnaire_editor(
	p_actor            uuid,
	p_questionnaire_id uuid,
	p_editor_id        uuid,
	p_editor_email     text,
	p_assurance        text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_editor forms.questionnaire_editor;
	v_log_id uuid;
begin
	if p_actor is null or p_questionnaire_id is null or p_editor_id is null or p_editor_email is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'questionário, editor e e-mail são obrigatórios';
	end if;

	perform access_control.audit_context('forms.editor.grant');

	perform 1 from forms.questionnaire where id = p_questionnaire_id for share;
	if not found then
		raise exception 'QUESTIONNAIRE_NOT_FOUND' using errcode = 'P0002', detail = 'questionário inexistente';
	end if;

	begin
		insert into forms.questionnaire_editor (questionnaire_id, editor_id, editor_email, added_by)
			values (p_questionnaire_id, p_editor_id, p_editor_email, p_actor)
			returning * into v_editor;
	exception
		when unique_violation then
			raise exception 'EDITOR_ALREADY_EXISTS' using errcode = '23505', detail = 'este usuário já é editor';
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'editor ou ator inexistente';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, 'forms.editor.grant', p_assurance,
		jsonb_build_object('target_user_id', p_editor_id, 'action', 'grant', 'questionnaire_id', p_questionnaire_id, 'editor_row_id', v_editor.id)
	);

	return to_jsonb(v_editor) || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function forms.remove_questionnaire_editor(
	p_actor            uuid,
	p_questionnaire_id uuid,
	p_editor_row_id    uuid,
	p_assurance        text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_removed forms.questionnaire_editor;
	v_log_id  uuid;
begin
	if p_actor is null or p_questionnaire_id is null or p_editor_row_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'questionário e editor são obrigatórios';
	end if;

	perform access_control.audit_context('forms.editor.revoke');

	delete from forms.questionnaire_editor where id = p_editor_row_id and questionnaire_id = p_questionnaire_id returning * into v_removed;
	if not found then
		raise exception 'EDITOR_NOT_FOUND' using errcode = 'P0002', detail = 'editor inexistente neste questionário';
	end if;

	v_log_id := access_control.record_access_change(
		p_actor, 'forms.editor.revoke', p_assurance,
		jsonb_build_object(
			'target_user_id', v_removed.editor_id, 'action', 'revoke', 'questionnaire_id', p_questionnaire_id, 'editor_row_id', v_removed.id,
			'previous', jsonb_build_object('added_by', v_removed.added_by, 'created_at', v_removed.created_at)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'id', v_removed.id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- journal: papel editorial (`journal.user_profiles.role`)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `editor` administra o corpo editorial inteiro (inclusive o papel dos outros); `reviewer`
-- recebe parecer às cegas. Trocar papel é conceder/revogar acesso, e passa a ser registrado.
-- O `author` do cadastro (trigger `handle_new_user`) não é concessão: é o default da coluna.

create or replace function journal.change_user_role(
	p_actor     uuid,
	p_user      uuid,
	p_role      text,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_previous text;
	v_log_id   uuid;
begin
	if p_actor is null or p_user is null or p_role is null or p_role not in ('author', 'reviewer', 'editor') then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator, usuário e papel (author, reviewer, editor) são obrigatórios';
	end if;

	perform access_control.audit_context('portal.journal-role.change');

	select role into v_previous from journal.user_profiles where id = p_user for update;
	if not found then
		raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002', detail = 'perfil do journal inexistente';
	end if;
	-- Mesmo papel: nada acontece, nada é registrado.
	if v_previous = p_role then
		return jsonb_build_object('log_id', null, 'changed', false, 'role', p_role);
	end if;

	update journal.user_profiles set role = p_role where id = p_user;

	v_log_id := access_control.record_access_change(
		p_actor, 'portal.journal-role.change', p_assurance,
		jsonb_build_object('target_user_id', p_user, 'action', 'change', 'role', p_role, 'previous', jsonb_build_object('role', v_previous))
	);

	return jsonb_build_object('log_id', v_log_id, 'changed', true, 'role', p_role, 'previous_role', v_previous);
end;
$$;

-- Perfil do journal E papel numa transação só. O portal gravava os campos do perfil e DEPOIS
-- trocava o papel: uma troca recusada (ou que falhasse) deixava o nome/bio já gravados — a
-- tela dizia "erro" sobre algo que tinha sido meio feito. Aqui os campos e o papel entram
-- juntos, ou nada entra; a troca de papel é a de `change_user_role` (com o log dela).
--
-- `p_fields` só aceita as colunas de perfil que a tela edita — nunca `id`, `role`,
-- `created_at`. `p_mode`: `insert` (o perfil não pode existir), `update` (tem de existir) ou
-- `upsert`. `p_role` nulo = não mexe no papel. Quem pode trocar papel (só editor, e ninguém
-- retira a própria função de editor) o portal decide ANTES de chamar.
create or replace function journal.save_user_profile(
	p_actor     uuid,
	p_user      uuid,
	p_mode      text,
	p_fields    jsonb,
	p_role      text default null,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_exists  boolean;
	v_unknown text;
	v_profile journal.user_profiles;
begin
	if p_actor is null or p_user is null or p_mode is null or p_mode not in ('insert', 'update', 'upsert') then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator, usuário e modo (insert, update, upsert) são obrigatórios';
	end if;
	if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
		raise exception 'PROFILE_FIELD_INVALID' using errcode = '22023', detail = 'campos do perfil devem ser um objeto';
	end if;
	select k into v_unknown
		from jsonb_object_keys(p_fields) as k
		where k not in ('full_name', 'affiliation', 'orcid', 'bio', 'expertise', 'email_notifications')
		limit 1;
	if v_unknown is not null then
		raise exception 'PROFILE_FIELD_INVALID' using errcode = '22023', detail = format('campo não editável: %s', v_unknown);
	end if;

	perform 1 from journal.user_profiles where id = p_user for update;
	v_exists := found;
	if p_mode = 'insert' and v_exists then
		raise exception 'PROFILE_ALREADY_EXISTS' using errcode = '23505', detail = 'o perfil já existe';
	end if;
	if p_mode = 'update' and not v_exists then
		raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002', detail = 'perfil do journal inexistente';
	end if;

	begin
		if v_exists then
			update journal.user_profiles set
					full_name = case when p_fields ? 'full_name' then p_fields ->> 'full_name' else full_name end,
					affiliation = case when p_fields ? 'affiliation' then p_fields ->> 'affiliation' else affiliation end,
					orcid = case when p_fields ? 'orcid' then p_fields ->> 'orcid' else orcid end,
					bio = case when p_fields ? 'bio' then p_fields ->> 'bio' else bio end,
					expertise = case
						when not (p_fields ? 'expertise') then expertise
						when jsonb_typeof(p_fields -> 'expertise') = 'array' then array(select jsonb_array_elements_text(p_fields -> 'expertise'))
						else null
					end,
					email_notifications = case when p_fields ? 'email_notifications' then (p_fields ->> 'email_notifications')::boolean else email_notifications end
				where id = p_user;
		else
			-- O papel NÃO entra no insert: nasce `author` (o default da coluna), fora do que a
			-- fase 2 vigia; se pedido, é trocado abaixo, pela função auditada.
			insert into journal.user_profiles (id, full_name, affiliation, orcid, bio, expertise, email_notifications)
				values (
					p_user,
					p_fields ->> 'full_name',
					p_fields ->> 'affiliation',
					p_fields ->> 'orcid',
					p_fields ->> 'bio',
					case when jsonb_typeof(p_fields -> 'expertise') = 'array' then array(select jsonb_array_elements_text(p_fields -> 'expertise')) end,
					coalesce((p_fields ->> 'email_notifications')::boolean, true)
				);
		end if;
	exception
		when not_null_violation or invalid_text_representation or check_violation then
			raise exception 'PROFILE_FIELD_INVALID' using errcode = '22023', detail = 'campo do perfil ausente ou inválido';
		when foreign_key_violation then
			raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002', detail = 'o usuário não existe';
	end;

	-- Mesma transação: se a troca de papel falhar (ator inexistente, papel inválido), os campos
	-- acima são desfeitos junto.
	if p_role is not null then
		perform journal.change_user_role(p_actor, p_user, p_role, p_assurance);
	end if;

	select * into v_profile from journal.user_profiles where id = p_user;
	return to_jsonb(v_profile);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Privilégios: só a service role (e o dono, `postgres`, role do Drizzle do sisub)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `revoke … from anon, authenticated` NÃO tira o EXECUTE que PUBLIC ganha em toda função
-- nova — e anon/authenticated herdam de PUBLIC. `access_control`, `forms` e `journal`
-- estão em `pgrst.db_schemas`, e `access_control` tem USAGE para anon/authenticated: sem o
-- revoke de PUBLIC, qualquer pessoa com a publishable key concederia acesso a si mesma por
-- `/rest/v1/rpc`. Varredura por nome no catálogo, e não lista de assinaturas: sobrecarga
-- nova não escapa, e função que não existir não derruba o `db reset` (42883).
do $$
declare
	v_fn regprocedure;
begin
	for v_fn in
		select p.oid::regprocedure
			from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where (n.nspname, p.proname) in (
				('access_control', 'audit_context'),
				('access_control', 'record_access_change'),
				('access_control', 'change_module_permission'),
				('access_control', 'permission_row_json'),
				('access_control', 'create_user_permission'),
				('access_control', 'update_user_permission'),
				('access_control', 'delete_user_permission'),
				('access_control', 'policy_members_json'),
				('access_control', 'policy_statements_json'),
				('access_control', 'statement_row_json'),
				('access_control', 'lock_editable_policy'),
				('access_control', 'create_policy'),
				('access_control', 'update_policy'),
				('access_control', 'delete_policy'),
				('access_control', 'restore_policy'),
				('access_control', 'add_policy_statement'),
				('access_control', 'update_policy_statement'),
				('access_control', 'remove_policy_statement'),
				('access_control', 'attach_policy'),
				('access_control', 'detach_policy'),
				('access_control', 'create_mcp_api_key'),
				('access_control', 'revoke_mcp_api_key'),
				('access_control', 'delete_mcp_api_key'),
				('forms', 'viewer_bindings_json'),
				('forms', 'replace_viewer_bindings'),
				('forms', 'add_response_viewer'),
				('forms', 'update_response_viewer_policy'),
				('forms', 'remove_response_viewer'),
				('forms', 'add_questionnaire_editor'),
				('forms', 'remove_questionnaire_editor'),
				('journal', 'change_user_role'),
				('journal', 'save_user_profile')
			)
	loop
		execute format('revoke all on function %s from public, anon, authenticated', v_fn);
		execute format('grant execute on function %s to service_role', v_fn);
	end loop;
end;
$$;

-- O PostgREST só enxerga função nova depois de recarregar o cache do schema.
notify pgrst, 'reload schema';
