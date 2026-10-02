-- access_admin_level_ceiling
-- Teto da administração de acessos do sisub: `admin:3` só passa por quem tem `admin:3`.
--
-- ── O defeito ────────────────────────────────────────────────────────────────
--
-- O console de acessos exige `admin:2`. Até aqui, nada comparava o que se concedia com o
-- nível de quem concedia: um `admin:2` criava uma política com o statement `admin:3`, anexava
-- a si mesmo e virava `admin:3` (o nível que lê o inventário de fragilidade de MFA e que o
-- registro trata como topo). Pelo grant inline era igual: `create_user_permission(…, 'admin',
-- 3, …)` ou subir o próprio grant de 2 para 3. E, no sentido inverso, um `admin:2` revogava
-- ou bloqueava (deny `admin:0` numa política anexada) quem estava acima dele.
--
-- ── A regra ──────────────────────────────────────────────────────────────────
--
-- Exige `admin:3` EFETIVO do ator (mesma resolução do guard: grant inline e statements de
-- política anexada vivos, deny sem escopo vence) a mudança que:
--
--   * cria, altera ou remove um grant inline de `admin` nível ≥ 3 (antes OU depois);
--   * cria, altera ou remove um statement de `admin` nível ≥ 3 (antes OU depois);
--   * mexe em statement, remove ou restaura política que concede `admin` ≥ 3 ou que está
--     anexada a quem detém `admin` ≥ 3 (mudar a política muda o acesso dessas pessoas);
--   * anexa ou desanexa política que concede `admin` ≥ 3;
--   * concede, altera ou revoga acesso (inline ou anexo) de quem detém `admin` ≥ 3.
--
-- "Detém" é o allow vivo, inline ou por política anexada viva, INDEPENDENTE de deny: quem tem
-- `admin:3` bloqueado por um deny continua protegido — tirar o deny é devolver o `admin:3`.
-- Linha vencida não protege; renová-la é mexer numa linha de nível 3, que já exige o teto.
--
-- Renomear política (`update_policy`) e criar política vazia não mudam acesso de ninguém e
-- ficam fora. `change_module_permission`/`set_module_block` (contrate, rumaer, sucont) não
-- administram o `admin` do sisub e ficam fora.
--
-- O app (`@iefa/sisub-domain`, `assertTopAdminCeiling` em `operations/access-change.ts`) recusa antes o que dá para ver sem ler
-- o banco (o nível pedido e a linha alterada), com a mesma frase; quem vale é a função, sob
-- as travas que ela já toma.
--
-- ── Contrato ─────────────────────────────────────────────────────────────────
--
-- Erro novo: 42501 ADMIN_LEVEL_3_REQUIRED (nada é gravado, nem o log).
--
-- As dez funções são recriadas com `create or replace`, MESMA assinatura, MESMO corpo de
-- 20260921130000 mais a checagem (o `audit_context` continua antes da primeira escrita e o
-- log na mesma transação). `create or replace` preserva o EXECUTE (só `service_role` e o
-- dono); a cláusula `set search_path = ''` vai repetida porque `create or replace` sem ela
-- a apagaria. As quatro auxiliares são novas e nascem executáveis só por `service_role` e
-- pelo dono (default de 20260920210000).
--
-- Nenhuma tabela nova (o guard de reset do treino não muda). DDL idempotente.

-- ═════════════════════════════════════════════════════════════════════════════
-- Auxiliares
-- ═════════════════════════════════════════════════════════════════════════════

-- Nível EFETIVO de `admin` de uma pessoa: 0 sem administração ou com deny. `admin` não aceita
-- escopo (CHECK de 20260921160420), então todo deny de `admin` é deny sem escopo.
create or replace function access_control.effective_admin_level(p_user uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
	with admin_rows as (
		select up.level
			from access_control.user_permissions up
			where up.user_id = p_user and up.module = 'admin' and (up.expires_at is null or up.expires_at > now())
		union all
		select s.level
			from access_control.user_policy_attachment a
			join access_control.policy p on p.id = a.policy_id and p.deleted_at is null
			join access_control.policy_statement s on s.policy_id = a.policy_id
			where a.user_id = p_user and s.module = 'admin' and (a.expires_at is null or a.expires_at > now())
	)
	select case when bool_or(level <= 0) then 0 else coalesce(max(level), 0) end from admin_rows;
$$;

-- Detém um allow vivo de `admin` ≥ 3 (inline ou por política anexada viva), com ou sem deny.
create or replace function access_control.holds_top_admin_grant(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
	select exists (
		select 1
			from access_control.user_permissions up
			where up.user_id = p_user and up.module = 'admin' and up.level >= 3 and (up.expires_at is null or up.expires_at > now())
	) or exists (
		select 1
			from access_control.user_policy_attachment a
			join access_control.policy p on p.id = a.policy_id and p.deleted_at is null
			join access_control.policy_statement s on s.policy_id = a.policy_id
			where a.user_id = p_user and s.module = 'admin' and s.level >= 3 and (a.expires_at is null or a.expires_at > now())
	);
$$;

-- A política concede `admin` ≥ 3 (o conteúdo, removida ou não) ou alcança quem o detém.
-- `p_include_members = false` olha só o conteúdo (anexar/desanexar: quem mais está anexado
-- não muda com o anexo de outra pessoa).
create or replace function access_control.policy_touches_top_admin(p_policy_id uuid, p_include_members boolean)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
	select exists (
		select 1 from access_control.policy_statement s where s.policy_id = p_policy_id and s.module = 'admin' and s.level >= 3
	) or (
		p_include_members and exists (
			select 1 from access_control.user_policy_attachment a where a.policy_id = p_policy_id and access_control.holds_top_admin_grant(a.user_id)
		)
	);
$$;

-- Recusa a mudança que exige o teto quando o ator não tem `admin:3` efetivo.
create or replace function access_control.require_top_admin(p_actor uuid, p_required boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if coalesce(p_required, true) and access_control.effective_admin_level(p_actor) < 3 then
		raise exception 'ADMIN_LEVEL_3_REQUIRED' using errcode = '42501', detail = 'administração nível 3, ou acesso de quem a detém, só se altera com administração nível 3';
	end if;
end;
$$;

comment on function access_control.require_top_admin(uuid, boolean) is
	'Teto da administração de acessos: recusa (42501 ADMIN_LEVEL_3_REQUIRED) quando p_required e o ator não tem admin:3 efetivo. Chamada pelas funções auditadas de grant inline, statement e anexo. Ver 20261001120000.';

-- ═════════════════════════════════════════════════════════════════════════════
-- Grant inline por linha
-- ═════════════════════════════════════════════════════════════════════════════

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

	-- 20261001120000: conceder `admin` ≥ 3, ou mexer em quem o detém, exige o teto.
	perform access_control.require_top_admin(p_actor, (p_module = 'admin' and p_level >= 3) or access_control.holds_top_admin_grant(p_user));

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

	-- 20261001120000: `admin` ≥ 3 antes ou depois, ou grant de quem detém `admin` ≥ 3.
	perform access_control.require_top_admin(
		p_actor,
		(v_before.module = 'admin' and (v_before.level >= 3 or p_level >= 3)) or access_control.holds_top_admin_grant(v_before.user_id)
	);

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

	-- 20261001120000: a linha é lida (e travada) antes, para o teto decidir sobre ela.
	select * into v_row from access_control.user_permissions where id = p_permission_id for update;
	if not found then
		raise exception 'PERMISSION_NOT_FOUND' using errcode = 'P0002', detail = 'grant inexistente';
	end if;
	perform access_control.require_top_admin(p_actor, (v_row.module = 'admin' and v_row.level >= 3) or access_control.holds_top_admin_grant(v_row.user_id));

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
-- Políticas: remover/restaurar, statements e anexos
-- ═════════════════════════════════════════════════════════════════════════════

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
	-- 20261001120000: remover política que concede `admin` ≥ 3, ou alcança quem o detém.
	perform access_control.require_top_admin(p_actor, access_control.policy_touches_top_admin(p_policy_id, true));

	update access_control.policy set deleted_at = now() where id = p_policy_id;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'revoke', 'policy_id', v_policy.id, 'policy_name', v_policy.name, 'statements', access_control.policy_statements_json(p_policy_id))
			|| access_control.policy_members_json(p_policy_id)
	);

	return jsonb_build_object('log_id', v_log_id, 'policy_id', v_policy.id);
end;
$$;

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
	-- 20261001120000: restaurar devolve o conteúdo a todos os anexados — inclusive um deny sobre
	-- quem detém `admin` ≥ 3.
	perform access_control.require_top_admin(p_actor, access_control.policy_touches_top_admin(p_policy_id, true));

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
	-- 20261001120000: statement `admin` ≥ 3, ou política que concede/alcança `admin` ≥ 3.
	perform access_control.require_top_admin(p_actor, (p_module = 'admin' and p_level >= 3) or access_control.policy_touches_top_admin(p_policy_id, true));

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
	-- 20261001120000: `admin` ≥ 3 antes ou depois, ou política que concede/alcança `admin` ≥ 3.
	perform access_control.require_top_admin(
		p_actor,
		(p_module = 'admin' and p_level >= 3) or access_control.policy_touches_top_admin(v_policy_id, true)
	);

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
	-- 20261001120000: avaliado ANTES do delete — a política ainda tem o statement que sai.
	perform access_control.require_top_admin(p_actor, access_control.policy_touches_top_admin(v_policy_id, true));

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

	-- 20261001120000: política que concede `admin` ≥ 3, ou anexo de quem o detém. Os OUTROS
	-- anexados não contam: o anexo desta pessoa não muda o acesso deles.
	perform access_control.require_top_admin(p_actor, access_control.policy_touches_top_admin(p_policy_id, false) or access_control.holds_top_admin_grant(p_user));

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

	-- 20261001120000: avaliado ANTES do delete — o anexo que sai ainda conta para "detém".
	perform access_control.require_top_admin(p_actor, access_control.policy_touches_top_admin(p_policy_id, false) or access_control.holds_top_admin_grant(p_user));

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

-- O PostgREST só enxerga função nova depois de recarregar o cache do schema.
notify pgrst, 'reload schema';
