-- audit_log_append_only — os dois logs de auditoria de acesso passam a ser só de INSERT.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- `access_control.sensitive_operation_log` (20260911120000) e `access_control.mfa_reset_log`
-- (20260911120200) são a prova de quem concedeu, alterou ou revogou acesso e de quem tirou o
-- segundo fator de alguém. Até aqui o `service_role` tinha UPDATE, DELETE e TRUNCATE nas duas
-- (o default `arwdDxtm` do schema) e não havia trigger nenhum: a chave secreta de qualquer app
-- (sisub, forms, rumaer, sucont, contrate, sisub-mcp…) bastava para reescrever ou apagar o
-- rastro — `DELETE /rest/v1/sensitive_operation_log` incluso. O `on delete restrict` das FKs
-- protegia a linha contra a exclusão da CONTA, não contra a exclusão da LINHA.
--
-- ── O que muda ───────────────────────────────────────────────────────────────
--
--   1. UPDATE, DELETE e TRUNCATE revogados de todo mundo que não é o dono (`postgres`):
--      `service_role`, `authenticated`, `anon` e PUBLIC. INSERT e SELECT ficam: as funções
--      auditadas gravam como `service_role`, o sisub lê o log pelo Drizzle (`postgres`), e o
--      registro manual de reset de MFA pelo dashboard (MFA-RECOVERY.md) é INSERT.
--   2. Triggers que recusam UPDATE e DELETE (por linha) e TRUNCATE (por comando) — valem também
--      para o dono, que a revogação não alcança. O dono ainda pode desligar o trigger
--      (`alter table … disable trigger`), mas isso é DDL deliberado, fica no histórico de
--      migrations/dashboard e não sai de um bug ou de uma chave vazada.
--
-- ── A única exceção: lixo de fixture ─────────────────────────────────────────
--
-- O faxineiro das fixtures de integração (`apps/sisub/scripts/purge-test-fixtures.ts`, roda no
-- `integration.yml` antes e depois da suíte) apaga os usuários `@example.invalid` e segue as FKs
-- RESTRICT até o log. Os testes gravam log só dentro de transação desfeita, então hoje não há
-- linha dessas (0 em 2026-10-01) — mas uma suíte morta por SIGKILL no meio de um commit deixaria
-- uma, e o faxineiro inteiro passaria a falhar. Por isso DELETE passa SÓ quando as duas coisas
-- valem juntas:
--
--   * bypass explícito na transação (`iefa.audit_bypass`, o mesmo de 20260921130100, limitado no
--     código pela regra opengrep `access-audit-bypass-outside-allowlist`); e
--   * TODO usuário que a linha referencia (`actor_id`; `target_user_id` e `performed_by`) é conta
--     de fixture: e-mail no domínio reservado `@example.invalid` (RFC 2606, nenhum usuário real
--     o tem — o hook de cadastro de 20261001100100 recusa qualquer e-mail que não seja
--     @fab.mil.br ou autorizado).
--
-- E só quem tem DELETE chega ao trigger — depois do item 1, o dono. UPDATE e TRUNCATE não têm
-- exceção nenhuma: o faxineiro só apaga, e TRUNCATE leva a tabela inteira.
--
-- Erro estável: 42501 AUDIT_LOG_APPEND_ONLY.
--
-- DDL idempotente (reaplicável por db:push ou psql).

create or replace function access_control.refuse_audit_log_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_row  jsonb;
	v_ids  uuid[];
begin
	if tg_op = 'DELETE' and coalesce(current_setting('iefa.audit_bypass', true), '') <> '' then
		v_row := to_jsonb(old);
		v_ids := array(
			select (v_row ->> k)::uuid
			from unnest(array['actor_id', 'target_user_id', 'performed_by']) k
			where v_row ->> k is not null
		);
		if cardinality(v_ids) > 0 and not exists (
			select 1 from unnest(v_ids) i
			where not exists (
				select 1 from auth.users u where u.id = i and lower(u.email) like '%@example.invalid'
			)
		) then
			return old;
		end if;
	end if;

	raise exception 'AUDIT_LOG_APPEND_ONLY'
		using errcode = '42501',
			detail = format('%s em %I.%I: o log de auditoria só aceita INSERT', tg_op, tg_table_schema, tg_table_name),
			hint = 'O log é a prova do ato e não se corrige nem se apaga. Erro de registro se corrige com uma linha nova. A única exceção é o faxineiro de fixtures (iefa.audit_bypass + conta @example.invalid). Ver 20261001140000.';
end;
$$;

comment on function access_control.refuse_audit_log_change() is
	'Recusa (42501 AUDIT_LOG_APPEND_ONLY) UPDATE, DELETE e TRUNCATE nos logs de auditoria de acesso. Exceção única: DELETE com iefa.audit_bypass de linha cujos usuários são todos fixture (@example.invalid). Ver 20261001140000.';

-- Função de trigger: o Postgres não confere EXECUTE no disparo. Ninguém a chama direto.
revoke all on function access_control.refuse_audit_log_change() from public, anon, authenticated, service_role;

-- ── Privilégios: só o dono escreve além de INSERT ───────────────────────────

revoke update, delete, truncate on table access_control.sensitive_operation_log from public, anon, authenticated, service_role;
revoke update, delete, truncate on table access_control.mfa_reset_log from public, anon, authenticated, service_role;

-- ── Triggers ────────────────────────────────────────────────────────────────

drop trigger if exists refuse_change on access_control.sensitive_operation_log;
create trigger refuse_change
	before update or delete on access_control.sensitive_operation_log
	for each row execute function access_control.refuse_audit_log_change();

drop trigger if exists refuse_truncate on access_control.sensitive_operation_log;
create trigger refuse_truncate
	before truncate on access_control.sensitive_operation_log
	for each statement execute function access_control.refuse_audit_log_change();

drop trigger if exists refuse_change on access_control.mfa_reset_log;
create trigger refuse_change
	before update or delete on access_control.mfa_reset_log
	for each row execute function access_control.refuse_audit_log_change();

drop trigger if exists refuse_truncate on access_control.mfa_reset_log;
create trigger refuse_truncate
	before truncate on access_control.mfa_reset_log
	for each statement execute function access_control.refuse_audit_log_change();

-- Os comentários diziam "apenas-inserção" desde 2026-09-11; agora o banco garante.
comment on table access_control.sensitive_operation_log is
	'Registro apenas-inserção das operações classificadas como sensíveis. Acesso exclusivo via service key; leitura exige `admin` nível 3 no PBAC. Append-only garantido pelo banco desde 20261001140000: UPDATE/DELETE/TRUNCATE revogados e recusados por trigger. `actor_id` é `on delete restrict` para que a prova não seja apagada junto com o usuário.';
comment on table access_control.mfa_reset_log is
	'Auditoria das remoções de segundo fator (código de recuperação ou reset administrativo). Append-only garantido pelo banco desde 20261001140000: UPDATE/DELETE/TRUNCATE revogados e recusados por trigger. `target_user_id` e `performed_by` são `on delete restrict` para que a prova não seja apagada junto com a conta. Acesso exclusivo via service key; leitura exige `admin` nível 3 no PBAC.';
