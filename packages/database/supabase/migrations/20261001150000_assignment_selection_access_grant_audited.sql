-- assignment_selection_access_grant_audited
-- A concessão do painel /controller da escolha de vagas (`assignment_selection.access_grant`)
-- entra no regime de mudança de acesso auditada (20260921130000 / 20260921130100).
--
-- ── Por quê ──────────────────────────────────────────────────────────────────
--
-- A tabela ficou de fora da varredura de 2026-09-21: quem tem linha ativa ali conduz o telão
-- (chama militares, arma e revela OMs, confirma vagas, apaga as escolhas da edição) e nada
-- registrava quem concedeu, a quem e quando. Regra do repo: conceder, alterar ou revogar
-- acesso, em qualquer app, só por função que grava a mudança e a linha de
-- `access_control.sensitive_operation_log` na MESMA transação, com o ator da sessão.
--
-- ── O que esta migration faz ────────────────────────────────────────────────
--
--   1. `assignment_selection.grant_controller_access` e `revoke_controller_access`, no padrão
--      das funções de 20260921130000: SECURITY INVOKER, `search_path` vazio, contexto aberto
--      antes da primeira escrita, log pelo gravador comum, EXECUTE só da service role. Não há
--      tela de concessão no app: o mantenedor chama pelo SQL, passando o próprio uuid como ator;
--   2. o trigger de recusa (`access_control.enforce_audited_access_change`) na tabela —
--      nenhum código do app escreve nela (o painel só lê a concessão em `resolveAccess`);
--   3. por decisão do mantenedor (2026-10-01), só `nannijpsn@fab.mil.br` tem acesso. Hoje já é
--      a única linha (conferido no banco em 2026-10-01); a normalização abaixo garante o estado
--      mesmo que outra linha apareça antes do apply, com o bypass explícito e o motivo.
--
-- ── Alvo registrado ─────────────────────────────────────────────────────────
--
-- A concessão é por E-MAIL (a pessoa pode nem ter conta ainda), e a service role não lê
-- `auth.users`. O log registra `target_email`; `target_user_id` não entra.
--
-- ── Erros (mensagens estáveis) ──────────────────────────────────────────────
--   22023 ACCESS_CHANGE_INVALID              argumento fora do contrato
--   23505 CONTROLLER_ACCESS_ALREADY_ACTIVE   concessão ativa com o mesmo papel
--   P0002 CONTROLLER_ACCESS_NOT_FOUND        revogar quem não tem concessão ativa
--   23503 ACCESS_ACTOR_NOT_FOUND             ator inexistente (vem do gravador do log)
--
-- Nenhuma tabela nova. DDL idempotente.

create or replace function assignment_selection.grant_controller_access(
	p_actor     uuid,
	p_email     text,
	p_role      text default 'operator',
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_email  text := lower(btrim(p_email));
	v_prev   assignment_selection.access_grant;
	v_grant  assignment_selection.access_grant;
	v_log_id uuid;
begin
	if p_actor is null or v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator e e-mail válido são obrigatórios';
	end if;
	if p_role is null or p_role not in ('admin', 'operator') then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'papel deve ser admin ou operator';
	end if;

	perform access_control.audit_context('assignment-selection.controller.grant');

	select * into v_prev from assignment_selection.access_grant where email = v_email for update;
	if v_prev.email is not null and v_prev.active and v_prev.role = p_role then
		raise exception 'CONTROLLER_ACCESS_ALREADY_ACTIVE' using errcode = '23505', detail = 'concessão já ativa com este papel';
	end if;

	insert into assignment_selection.access_grant (email, role, active)
		values (v_email, p_role, true)
		on conflict (email) do update set role = excluded.role, active = true
		returning * into v_grant;

	v_log_id := access_control.record_access_change(
		p_actor, 'assignment-selection.controller.grant', p_assurance,
		jsonb_build_object(
			'target_email', v_email, 'action', 'grant', 'role', v_grant.role,
			'previous', case when v_prev.email is null then null else jsonb_build_object('role', v_prev.role, 'active', v_prev.active) end
		)
	);

	return to_jsonb(v_grant) || jsonb_build_object('log_id', v_log_id);
end;
$$;

comment on function assignment_selection.grant_controller_access(uuid, text, text, text) is
	'Concede (ou reativa/troca o papel de) acesso ao painel /controller da escolha de vagas, com a linha de sensitive_operation_log na mesma transação. Ver 20261001150000.';

create or replace function assignment_selection.revoke_controller_access(
	p_actor     uuid,
	p_email     text,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_email   text := lower(btrim(p_email));
	v_revoked assignment_selection.access_grant;
	v_log_id  uuid;
begin
	if p_actor is null or v_email is null or v_email = '' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator e e-mail são obrigatórios';
	end if;

	perform access_control.audit_context('assignment-selection.controller.revoke');

	-- Revogar é desativar: a linha fica como histórico de quem já teve acesso.
	update assignment_selection.access_grant set active = false where email = v_email and active returning * into v_revoked;
	if not found then
		raise exception 'CONTROLLER_ACCESS_NOT_FOUND' using errcode = 'P0002', detail = 'sem concessão ativa para este e-mail';
	end if;

	v_log_id := access_control.record_access_change(
		p_actor, 'assignment-selection.controller.revoke', p_assurance,
		jsonb_build_object(
			'target_email', v_email, 'action', 'revoke',
			'previous', jsonb_build_object('role', v_revoked.role, 'active', true)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'email', v_email);
end;
$$;

comment on function assignment_selection.revoke_controller_access(uuid, text, text) is
	'Revoga (desativa) o acesso ao painel /controller da escolha de vagas, com a linha de sensitive_operation_log na mesma transação. Ver 20261001150000.';

-- Só a service role (e o dono). Função nova já nasce assim desde 20260920210000; o revoke
-- explícito segue o padrão de 20260921130000 e não depende do default.
revoke all on function assignment_selection.grant_controller_access(uuid, text, text, text) from public, anon, authenticated;
revoke all on function assignment_selection.revoke_controller_access(uuid, text, text) from public, anon, authenticated;
grant execute on function assignment_selection.grant_controller_access(uuid, text, text, text) to service_role;
grant execute on function assignment_selection.revoke_controller_access(uuid, text, text) to service_role;

-- ── Trigger de recusa (o mesmo de 20260921130100) ──────────────────────────

drop trigger if exists enforce_audited_change on assignment_selection.access_grant;
create trigger enforce_audited_change
	before insert or update or delete on assignment_selection.access_grant
	for each row execute function access_control.enforce_audited_access_change();

-- ── Só nannijpsn@fab.mil.br ativo (decisão do mantenedor, 2026-10-01) ───────
--
-- Manutenção explícita, não concessão de alguém: abre o bypass. Dentro de um DO para que o
-- bypass (local à transação) valha para as duas escritas tanto no `db push` quanto num
-- `psql -f` em autocommit, onde cada instrução solta seria uma transação própria.
-- A concessão extra é DESATIVADA, não apagada: fica como histórico de quem já teve acesso.

do $$
begin
	perform set_config('iefa.audit_bypass', 'assignment_selection: only nannijpsn@fab.mil.br keeps controller access (maintainer decision 2026-10-01)', true);

	update assignment_selection.access_grant
		set active = false
		where email <> 'nannijpsn@fab.mil.br' and active;

	insert into assignment_selection.access_grant (email, role, active)
		values ('nannijpsn@fab.mil.br', 'admin', true)
		on conflict (email) do update set role = 'admin', active = true
		where assignment_selection.access_grant.role is distinct from 'admin' or not assignment_selection.access_grant.active;
end;
$$;

notify pgrst, 'reload schema';
