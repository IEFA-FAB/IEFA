-- access_tables_truncate_guard — TRUNCATE deixa de escapar da auditoria de acesso.
--
-- Os triggers de 20260921130100 (e o de `signup_allowlist`, 20261001100000) são FOR EACH ROW
-- em INSERT/UPDATE/DELETE. TRUNCATE não dispara trigger de linha: `truncate
-- access_control.user_permissions` (ou um `truncate auth.users cascade`, que alcança as tabelas
-- com FK para auth.users) revogaria o acesso de todo mundo sem passar por função auditada e sem
-- linha de log. O `service_role` tem TRUNCATE nessas tabelas pelo default do schema.
--
-- Aqui: trigger BEFORE TRUNCATE FOR EACH STATEMENT em cada tabela vigiada, que recusa com o
-- mesmo 42501 ACCESS_CHANGE_UNAUDITED. Diferente da recusa por linha, o contexto de função
-- auditada (`iefa.audit_operation`) NÃO libera: nenhuma função auditada esvazia tabela, e
-- esvaziar não é "uma mudança de acesso de alguém" que caiba numa linha de log. Passa só a
-- manutenção explícita (`iefa.audit_bypass`, 20260921130100). No TRUNCATE em cascata o trigger
-- de cada tabela alcançada dispara, então a cascata também é recusada.
--
-- Tabela vigiada nova liga este trigger junto com o de linha (o contrato
-- `access-audit.sql-contract.test.ts` e o gate `audit:rls` — `access_truncate_unguarded` —
-- cobram).
--
-- DDL idempotente (reaplicável).

create or replace function access_control.refuse_unaudited_truncate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if coalesce(current_setting('iefa.audit_bypass', true), '') = '' then
		raise exception 'ACCESS_CHANGE_UNAUDITED'
			using errcode = '42501',
				detail = format('TRUNCATE em %I.%I esvaziaria uma tabela de acesso sem auditoria', tg_table_schema, tg_table_name),
				hint = 'Mudança de acesso passa por função auditada, linha a linha. Manutenção explícita: set_config(''iefa.audit_bypass'', ''<motivo>'', true). Ver 20261001140100.';
	end if;
	return null;
end;
$$;

comment on function access_control.refuse_unaudited_truncate() is
	'Recusa (42501 ACCESS_CHANGE_UNAUDITED) TRUNCATE em tabela de acesso vigiada sem bypass explícito (iefa.audit_bypass). Ver 20261001140100.';

-- Função de trigger: o Postgres não confere EXECUTE no disparo. Ninguém a chama direto.
revoke all on function access_control.refuse_unaudited_truncate() from public, anon, authenticated, service_role;

drop trigger if exists enforce_audited_truncate on access_control.user_permissions;
create trigger enforce_audited_truncate
	before truncate on access_control.user_permissions
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on access_control.policy;
create trigger enforce_audited_truncate
	before truncate on access_control.policy
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on access_control.policy_statement;
create trigger enforce_audited_truncate
	before truncate on access_control.policy_statement
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on access_control.user_policy_attachment;
create trigger enforce_audited_truncate
	before truncate on access_control.user_policy_attachment
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on access_control.mcp_api_keys;
create trigger enforce_audited_truncate
	before truncate on access_control.mcp_api_keys
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on access_control.signup_allowlist;
create trigger enforce_audited_truncate
	before truncate on access_control.signup_allowlist
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on forms.response_viewer;
create trigger enforce_audited_truncate
	before truncate on forms.response_viewer
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on forms.response_viewer_scope_binding;
create trigger enforce_audited_truncate
	before truncate on forms.response_viewer_scope_binding
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on forms.questionnaire_editor;
create trigger enforce_audited_truncate
	before truncate on forms.questionnaire_editor
	for each statement execute function access_control.refuse_unaudited_truncate();

drop trigger if exists enforce_audited_truncate on journal.user_profiles;
create trigger enforce_audited_truncate
	before truncate on journal.user_profiles
	for each statement execute function access_control.refuse_unaudited_truncate();
