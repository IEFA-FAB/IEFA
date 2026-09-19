-- access_control_audited_permission_change
-- Conceder e revogar grant inline COM o registro de auditoria, numa transação só.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- Até aqui nenhum app registrava quem concedeu ou revogou acesso fora do sisub: a
-- pergunta "quem deu `alpha-admin` a esta pessoa?" não tinha resposta (caso real,
-- 2026-09-18). Gravar o log pelo app, DEPOIS da escrita, deixa duas janelas:
--
--   1. a escrita confirma e o log falha — a mudança fica sem rastro; desfazê-la pelo
--      app é outra escrita, que também pode falhar, e então sobra o grant não auditado;
--   2. entre a confirmação e o desfazer, o beneficiário JÁ tem o acesso — um grant que
--      "não aconteceu" pode ter sido usado.
--
-- Nenhuma compensação no app fecha as duas. Uma função numa transação fecha: ou o grant
-- e a linha de auditoria entram juntos, ou nenhum dos dois entra. Não existe estado
-- intermediário visível a ninguém.
--
-- ── Semântica preservada ────────────────────────────────────────────────────
--
-- A mesma de `grantModulePermission`/`revokeModulePermission` (@iefa/pbac):
--
--   * allow (`level > 0`) e deny (`level <= 0`) COEXISTEM na mesma chave, por desenho —
--     dois índices únicos parciais (20260917185655). Conceder allow só toca a linha de
--     allow; conceder deny só toca a de deny. Um allow NUNCA sobrescreve um deny (isso
--     apagaria a negação em silêncio), e vice-versa;
--   * conceder é conceder acesso VIVO: `expires_at` vem do chamador (nulo = sem prazo) e
--     substitui o anterior — reaplicar sobre uma linha vencida a reativa;
--   * revogar apaga a CHAVE inteira (allow e deny), casada por igualdade exata — com
--     `is not distinct from` nos escopos, para "global" não virar "todas as OMs".
--
-- Revogar uma chave sem linha NÃO é registrado: levanta `P0002` (PERMISSION_NOT_FOUND).
-- O log responde "o que foi feito"; uma revogação que não removeu nada não fez nada, e
-- registrá-la afirmaria o contrário. O app mostra a mensagem (o caso típico é o acesso por
-- política anexada, que não é linha desta tabela).
--
-- ── O ator ───────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, executável só pela service role: a função confia no `p_actor` que
-- recebe. A garantia de que ele é a SESSÃO — e nunca um campo do corpo da requisição —
-- mora no app (`changeModulePermission` do @iefa/pbac documenta; o contrate tem teste
-- de contrato). Não há como a função descobrir sozinha quem é a pessoa: a service role
-- não carrega sessão.
--
-- ── Erros ────────────────────────────────────────────────────────────────────
--
-- Mensagens ESTÁVEIS, que o app traduz (o SQL cru nunca chega à tela):
--   22023 PERMISSION_CHANGE_INVALID  — argumento fora do contrato
--   P0002 PERMISSION_NOT_FOUND       — revogação de chave sem linha
--   23503 PERMISSION_REFERENCE_NOT_FOUND — usuário, OM, cozinha ou refeitório inexistente
--   23503 PERMISSION_ACTOR_NOT_FOUND — o ator não existe em auth.users (e nada é gravado)
--   23505 PERMISSION_CONFLICT        — corrida que o `on conflict` não absorveu
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

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
	p_assurance    text default 'session'
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
	-- O mesmo `exclusive_scope` da tabela, checado antes para a mensagem ser a nossa.
	if num_nonnulls(p_unit_id, p_kitchen_id, p_mess_hall_id) > 1 then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'no máximo um escopo (OM, cozinha ou refeitório)';
	end if;
	if p_action = 'grant' and p_level is null then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'grant exige nível';
	end if;
	if p_action = 'revoke' and (p_level is not null or p_expires_at is not null) then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'revoke apaga a chave inteira: nível e prazo não se aplicam';
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

			v_target := jsonb_build_object(
				'target_user_id', p_user,
				'module', p_module,
				'level', p_level,
				'unit_id', p_unit_id,
				'kitchen_id', p_kitchen_id,
				'mess_hall_id', p_mess_hall_id,
				'expires_at', p_expires_at,
				'previous_level', v_prev_level,
				'previous_expires_at', v_prev_expires,
				'permission_id', v_permission
			);
		else
			-- A chave inteira sai: allow e deny. O que foi removido vai para o log linha a
			-- linha — depois do delete, é o único lugar onde o acesso revogado ainda existe.
			with removed as (
				delete from access_control.user_permissions up
					where up.user_id = p_user
						and up.module = p_module
						and up.unit_id is not distinct from p_unit_id
						and up.kitchen_id is not distinct from p_kitchen_id
						and up.mess_hall_id is not distinct from p_mess_hall_id
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
				raise exception 'PERMISSION_NOT_FOUND' using errcode = 'P0002', detail = 'nenhum grant inline nesta chave';
			end if;

			v_target := jsonb_build_object(
				'target_user_id', p_user,
				'module', p_module,
				'level', null,
				'unit_id', p_unit_id,
				'kitchen_id', p_kitchen_id,
				'mess_hall_id', p_mess_hall_id,
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
		'permission_id', v_permission,
		'previous_level', v_prev_level,
		'removed', coalesce(v_removed_n, 0)
	);
end;
$$;

comment on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text) is
	'Concede (upsert na partição allow OU deny) ou revoga (a chave inteira) um grant inline e grava a linha em sensitive_operation_log na MESMA transação. SECURITY INVOKER, só service_role; o ator (p_actor) tem de ser a sessão — a garantia é do app. Ver 20260918130335.';

-- Só a service role executa: é quem os apps usam no servidor, depois do guard de
-- administração. `anon`/`authenticated` alcançariam a função pelo `/rest/v1/rpc` se o
-- default privilege do Supabase lhes desse EXECUTE — daí o revoke explícito.
revoke all on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text) from public;
revoke all on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text) from anon, authenticated;
grant execute on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text) to service_role;

-- O PostgREST só enxerga função nova depois de recarregar o cache do schema.
notify pgrst, 'reload schema';
