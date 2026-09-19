-- access_control_permission_change_partition
-- A revogação de `change_module_permission` passa a escolher a PARTIÇÃO (allow, deny ou as
-- duas), e a concessão passa a dizer se um deny vivo continua de pé na mesma chave.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- Allow (`level > 0`) e deny (`level <= 0`) coexistem na mesma chave por desenho (dois
-- índices únicos parciais, 20260917185655). A versão de 20260918130335 revogava a CHAVE
-- INTEIRA: o administrador que clicava "Revogar" num allow apagava junto o deny que outra
-- pessoa tinha posto sobre aquela chave — e o bloqueio sumia sem ninguém ter decidido
-- retirá-lo. O caminho inverso também: retirar um bloqueio levava junto o allow.
--
-- ── O que muda ───────────────────────────────────────────────────────────────
--
--   * `p_partition text default 'all'` — `'allow'` apaga só a linha de allow da chave,
--     `'deny'` só a de deny, `'all'` as duas (o comportamento anterior, preservado como
--     default para quem ainda não passa o argumento). Só vale no revoke: a concessão já
--     escolhe a partição pelo sinal do nível. Num grant, `'all'` ou a partição que o nível
--     indica; qualquer outra é argumento fora do contrato;
--   * revogar uma partição sem linha é `P0002` (PERMISSION_NOT_FOUND), como a chave sem
--     linha era — e nada é registrado;
--   * o grant devolve `deny_present`: `true` quando, DEPOIS da concessão, existe um deny
--     VIVO (sem prazo ou com prazo no futuro) na mesma chave. O allow recém-gravado não vale
--     enquanto ele existir (deny vence, `hasPermission` do @iefa/pbac), e a tela precisa
--     dizer isso em vez de "Acesso concedido". Deny vencido não conta: expirar é sumir,
--     não bloquear (`NOT_EXPIRED`). No revoke, `deny_present` é nulo — não é calculado;
--   * o `target` do log registra a partição (`partition`) e, no grant, o `deny_present`.
--
-- Todo o resto é o de 20260918130335: SECURITY INVOKER, `search_path` vazio, só a
-- service role executa, as mesmas mensagens e códigos de erro, o log na MESMA transação.
--
-- ── Por que DROP antes do CREATE ─────────────────────────────────────────────
--
-- Um parâmetro a mais é outra assinatura: `create or replace` criaria uma SEGUNDA função
-- ao lado da de 11 argumentos, e a chamada que omite `p_partition` casaria com as duas
-- (ambígua, o PostgREST recusa). Por isso a antiga sai primeiro. A de 12 argumentos com
-- default atende tanto quem passa `p_partition` quanto quem ainda não passa.
--
-- Ordem de deploy: esta migration ANTES do código que envia `p_partition` (o PostgREST
-- responderia PGRST202 à função que não conhece o argumento). O código antigo segue
-- funcionando depois dela — o default reproduz o revoke da chave inteira.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

drop function if exists access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text);

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
	-- ── Contrato dos argumentos ──────────────────────────────────────────────
	if p_actor is null or p_user is null or p_module is null or btrim(p_module) = '' then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ator, usuário e módulo são obrigatórios';
	end if;
	-- O prefixo do `operation` no log: minúsculas, dígitos e hífen, para o nome não
	-- carregar espaço, ponto ou texto livre que confundiria a consulta por operação.
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
	-- O mesmo `exclusive_scope` da tabela, checado antes para a mensagem ser a nossa.
	if num_nonnulls(p_unit_id, p_kitchen_id, p_mess_hall_id) > 1 then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'no máximo um escopo (OM, cozinha ou refeitório)';
	end if;
	if p_action = 'grant' and p_level is null then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'grant exige nível';
	end if;
	if p_action = 'revoke' and (p_level is not null or p_expires_at is not null) then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'revoke apaga a partição da chave: nível e prazo não se aplicam';
	end if;

	-- A partição efetiva: no grant, a do sinal do nível; no revoke, a pedida.
	if p_action = 'grant' then
		v_partition := case when p_level > 0 then 'allow' else 'deny' end;
		if p_partition not in ('all', v_partition) then
			raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'no grant, a partição sai do nível: allow exige nível > 0, deny exige nível <= 0';
		end if;
	else
		v_partition := p_partition;
	end if;

	begin
		if p_action = 'grant' then
			-- Estado anterior da MESMA partição (allow ou deny), travado até o fim da
			-- transação — é o `previous_level` que o log guarda.
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

			-- `on conflict` sobre o índice PARCIAL da partição certa: o allow só casa com o
			-- allow, o deny só com o deny. É também o que absorve a corrida de dois
			-- administradores concedendo ao mesmo tempo (o segundo vira update).
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

			-- Deny VIVO na mesma chave, depois da concessão. O allow concedido não vale
			-- enquanto ele existir (deny vence); vencido não conta.
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
			-- Só a partição pedida sai: revogar o allow não leva o deny, e vice-versa. O que
			-- foi removido vai para o log linha a linha — depois do delete, é o único lugar
			-- onde o acesso revogado ainda existe.
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
				-- O allow, se havia; senão o deny.
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

	-- Na MESMA transação: se esta linha não entrar (ator inexistente, check de
	-- `assurance`), a escrita acima é desfeita junto.
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

comment on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text, text) is
	'Concede (upsert na partição allow OU deny, devolvendo deny_present) ou revoga (a partição pedida: allow, deny ou all) um grant inline e grava a linha em sensitive_operation_log na MESMA transação. SECURITY INVOKER, só service_role; o ator (p_actor) tem de ser a sessão — a garantia é do app. Ver 20260918130335 e 20260919005526.';

-- Só a service role executa: é quem os apps usam no servidor, depois do guard de
-- administração. `anon`/`authenticated` alcançariam a função pelo `/rest/v1/rpc` se o
-- default privilege do Supabase lhes desse EXECUTE — daí o revoke explícito.
revoke all on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text, text) from public;
revoke all on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text, text) from anon, authenticated;
grant execute on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text, text) to service_role;

-- O PostgREST só enxerga a assinatura nova depois de recarregar o cache do schema.
notify pgrst, 'reload schema';
