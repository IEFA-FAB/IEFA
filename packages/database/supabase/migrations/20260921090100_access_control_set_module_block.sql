-- access_control_set_module_block
-- Bloquear (ou desbloquear) uma pessoa em VÁRIOS módulos de uma vez, numa transação só,
-- com uma linha de auditoria por módulo alterado.
--
-- DECLARADA, NÃO APLICADA. Ordem: aplicar ANTES do merge do código que a chama (o botão
-- "Bloquear no copiloto" do contrate) — sem ela o PostgREST responde PGRST202 e o botão
-- falha, sem estrago. Nada existente depende dela.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- Desligar alguém do Projeto α (saída da OM, fim de função) pedia quatro bloqueios, um por
-- papel (`alpha-requester`, `alpha-procurement`, `alpha-aci`, `alpha-admin`), e a tela não
-- criava bloqueio nenhum. Feito em quatro chamadas de `change_module_permission`, uma falha
-- no meio deixaria a pessoa bloqueada em dois papéis e com acesso nos outros dois — o pior
-- dos estados, porque a tela mostraria "bloqueio" e o acesso seguiria valendo.
--
-- ── O que faz ────────────────────────────────────────────────────────────────
--
--   * `p_blocked = true`: para cada módulo, garante um deny SEM ESCOPO (nível 0, sem OM,
--     cozinha nem refeitório) e SEM PRAZO. Deny sem escopo vence qualquer allow do módulo,
--     global ou de OM (`hasPermission` / `resolveEffectivePermissions` do @iefa/pbac);
--   * `p_blocked = false`: apaga os denies SEM ESCOPO desses módulos (vencidos inclusive);
--   * NUNCA toca a partição de allow — é a mesma semântica de partição de
--     `change_module_permission` (20260919010255). Desbloquear devolve exatamente os acessos
--     que a pessoa tinha; bloquear não os apaga, para o desbloqueio não precisar
--     reconstituí-los. Deny ESCOPADO (de uma OM) também não é tocado: é outra decisão, de
--     outra chave, e retirá-lo junto seria desfazer o que ninguém pediu;
--   * módulo que já está no estado pedido (deny sem escopo e sem prazo já existe; ou nada a
--     apagar) NÃO é registrado — o log responde "o que foi feito". Bloqueio com prazo, ou
--     vencido, vira permanente, e isso É registrado, com o prazo anterior;
--   * uma linha em `sensitive_operation_log` por módulo alterado, operação
--     `${p_app}.permission.block` / `.unblock`, com o `target` no formato do de
--     `change_module_permission` (`target_user_id`, `module`, escopos nulos, `partition` =
--     `deny`, `previous_level`, e `removed` no desbloqueio).
--
-- Tudo numa transação: se qualquer módulo falhar (ou o log de qualquer um), nada entra.
-- Os módulos são tratados em ordem alfabética, para duas chamadas concorrentes sobre a
-- mesma pessoa travarem as linhas na mesma ordem.
--
-- Ninguém bloqueia a si mesmo: seria trancar-se fora do módulo de administração. A regra
-- também mora no app (o contrate recusa antes); aqui é a defesa em profundidade. O
-- desbloqueio próprio não é recusado — quem está bloqueado não chega à tela.
--
-- ── O ator ───────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, executável só pela service role, como `change_module_permission`: a
-- função grava o `p_actor` que receber, e a garantia de que ele é a SESSÃO mora no app
-- (`setModuleBlock` do @iefa/pbac documenta; o contrate tem teste de contrato).
--
-- ── Erros ────────────────────────────────────────────────────────────────────
--
-- Os mesmos códigos e mensagens estáveis de `change_module_permission`, que o
-- `toPermissionChangeError` do @iefa/pbac já traduz:
--   22023 PERMISSION_CHANGE_INVALID      — argumento fora do contrato (inclui bloquear a si mesmo)
--   23503 PERMISSION_REFERENCE_NOT_FOUND — usuário inexistente
--   23503 PERMISSION_ACTOR_NOT_FOUND     — o ator não existe em auth.users (e nada é gravado)
--   23505 PERMISSION_CONFLICT            — corrida que o `on conflict` não absorveu
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create or replace function access_control.set_module_block(
	p_actor     uuid,
	p_app       text,
	p_user      uuid,
	p_modules   text[],
	p_blocked   boolean,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_modules      text[];
	v_module       text;
	v_prev_level   integer;
	v_prev_expires timestamptz;
	v_permission   uuid;
	v_removed      jsonb;
	v_removed_n    integer;
	v_target       jsonb;
	v_log_id       uuid;
	v_changed      text[] := '{}';
	v_unchanged    text[] := '{}';
	v_log_ids      uuid[] := '{}';
begin
	-- ── Contrato dos argumentos ──────────────────────────────────────────────
	if p_actor is null or p_user is null or p_blocked is null then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ator, usuário e estado do bloqueio são obrigatórios';
	end if;
	if p_app is null or p_app !~ '^[a-z0-9][a-z0-9-]*$' then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'app inválido';
	end if;
	if p_assurance is null or p_assurance not in ('session', 'fresh') then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'assurance deve ser session ou fresh';
	end if;
	if p_modules is null or cardinality(p_modules) = 0 then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ao menos um módulo';
	end if;
	if exists (select 1 from unnest(p_modules) as m (name) where m.name is null or btrim(m.name) = '') then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'módulo vazio na lista';
	end if;
	if p_blocked and p_actor = p_user then
		raise exception 'PERMISSION_CHANGE_INVALID' using errcode = '22023', detail = 'ninguém bloqueia a si mesmo';
	end if;

	-- Sem repetição e em ordem fixa: a ordem de trava das linhas é a mesma em toda chamada.
	select array_agg(distinct m.name order by m.name) into v_modules from unnest(p_modules) as m (name);

	foreach v_module in array v_modules loop
		v_prev_level := null;
		v_prev_expires := null;
		v_permission := null;
		v_target := null;

		begin
			if p_blocked then
				-- O deny SEM ESCOPO atual, travado até o fim da transação.
				select up.id, up.level, up.expires_at
					into v_permission, v_prev_level, v_prev_expires
					from access_control.user_permissions up
					where up.user_id = p_user
						and up.module = v_module
						and up.unit_id is null
						and up.kitchen_id is null
						and up.mess_hall_id is null
						and up.level <= 0
					for update;

				-- Já bloqueado, sem prazo: nada a fazer, nada a registrar.
				if v_permission is not null and v_prev_expires is null then
					v_unchanged := v_unchanged || v_module;
					continue;
				end if;

				-- `on conflict` sobre o índice PARCIAL de deny: o allow da mesma chave não é
				-- tocado. Também absorve a corrida de dois administradores bloqueando juntos.
				insert into access_control.user_permissions (user_id, module, level, unit_id, kitchen_id, mess_hall_id, expires_at)
					values (p_user, v_module, 0, null, null, null, null)
					on conflict (user_id, module, mess_hall_id, kitchen_id, unit_id) where level <= 0
					do update set level = 0, expires_at = null
					returning id into v_permission;

				v_target := jsonb_build_object(
					'target_user_id', p_user,
					'module', v_module,
					'level', 0,
					'unit_id', null,
					'kitchen_id', null,
					'mess_hall_id', null,
					'expires_at', null,
					'partition', 'deny',
					'previous_level', v_prev_level,
					'previous_expires_at', v_prev_expires,
					'permission_id', v_permission
				);
			else
				-- Só os denies SEM ESCOPO saem; o allow e os denies de OM ficam.
				with removed as (
					delete from access_control.user_permissions up
						where up.user_id = p_user
							and up.module = v_module
							and up.unit_id is null
							and up.kitchen_id is null
							and up.mess_hall_id is null
							and up.level <= 0
						returning up.id, up.level, up.expires_at, up.created_at
				)
				select
					coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'level', r.level, 'expires_at', r.expires_at, 'created_at', r.created_at)), '[]'::jsonb),
					count(*)::integer,
					max(r.level)
					into v_removed, v_removed_n, v_prev_level
					from removed r;

				if v_removed_n = 0 then
					v_unchanged := v_unchanged || v_module;
					continue;
				end if;

				v_target := jsonb_build_object(
					'target_user_id', p_user,
					'module', v_module,
					'level', null,
					'unit_id', null,
					'kitchen_id', null,
					'mess_hall_id', null,
					'partition', 'deny',
					'previous_level', v_prev_level,
					'removed', v_removed
				);
			end if;
		exception
			when unique_violation then
				raise exception 'PERMISSION_CONFLICT' using errcode = '23505', detail = 'outra alteração concorrente no mesmo bloqueio; tente de novo';
			when foreign_key_violation then
				raise exception 'PERMISSION_REFERENCE_NOT_FOUND' using errcode = '23503', detail = 'usuário inexistente';
		end;

		-- Na MESMA transação: se o log de qualquer módulo não entrar, nada entra.
		begin
			insert into access_control.sensitive_operation_log (actor_id, operation, assurance, target)
				values (p_actor, p_app || '.permission.' || case when p_blocked then 'block' else 'unblock' end, p_assurance, v_target)
				returning id into v_log_id;
		exception
			when foreign_key_violation then
				raise exception 'PERMISSION_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
		end;

		v_changed := v_changed || v_module;
		v_log_ids := v_log_ids || v_log_id;
	end loop;

	return jsonb_build_object(
		'blocked', p_blocked,
		'changed', to_jsonb(v_changed),
		'unchanged', to_jsonb(v_unchanged),
		'log_ids', to_jsonb(v_log_ids)
	);
end;
$$;

comment on function access_control.set_module_block(uuid, text, uuid, text[], boolean, text) is
	'Bloqueia (deny sem escopo, nível 0, sem prazo) ou desbloqueia (apaga os denies sem escopo) uma pessoa em vários módulos numa transação, com uma linha em sensitive_operation_log por módulo alterado. Nunca toca allow nem deny escopado. SECURITY INVOKER, só service_role; o ator (p_actor) tem de ser a sessão — a garantia é do app. Ver 20260921090100.';

-- Só a service role executa, como `change_module_permission`.
revoke all on function access_control.set_module_block(uuid, text, uuid, text[], boolean, text) from public;
revoke all on function access_control.set_module_block(uuid, text, uuid, text[], boolean, text) from anon, authenticated;
grant execute on function access_control.set_module_block(uuid, text, uuid, text[], boolean, text) to service_role;

-- O PostgREST só enxerga função nova depois de recarregar o cache do schema.
notify pgrst, 'reload schema';
