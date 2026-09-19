-- access_change_enforcement  (FASE 2 de 2 — os triggers que RECUSAM escrita sem auditoria)
--
-- ⚠ ORDEM DE APLICAÇÃO — NÃO aplique junto com a fase 1.
--
-- Estes triggers fazem toda escrita em tabela de acesso fora de função auditada FALHAR. Hoje
-- (antes do deploy do PR que os declara) sisub, rumaer, sucont, forms e portal ainda escrevem
-- direto — aplicar isto antes quebraria a concessão de acesso em TODOS eles no mesmo instante.
--
--   1. fase 1 (20260921120000) aplicada;
--   2. o código que chama as funções em produção em TODOS os apps que escrevem estas tabelas:
--      sisub, sisub-mcp (não escreve acesso, mas atualiza `last_used_at` — coberto pelo WHEN),
--      rumaer, sucont, forms, portal e contrate. Conferir por JOB no run de deploy da main
--      (deploy pulado por check vermelho deixa o app com o código antigo);
--   3. o PR de limpeza do α (`set_module_block`) já chamando `access_control.audit_context`;
--   4. SÓ ENTÃO: `psql -f` desta migration + `supabase migration repair --status applied`.
--
-- ── A regra ──────────────────────────────────────────────────────────────────
--
-- Escrita (INSERT/UPDATE/DELETE) nas tabelas de acesso passa se, e só se:
--
--   a) há contexto de auditoria aberto na transação (`iefa.audit_operation`, aberto por
--      `access_control.audit_context` dentro das funções auditadas); ou
--   b) é efeito de OUTRO trigger — `pg_trigger_depth() > 1`. É o caso das cascatas de FK
--      (`auth.admin.deleteUser` apaga os grants do usuário; apagar OM, cozinha, refeitório,
--      questionário ou política leva os filhos junto): a ação referencial do Postgres roda
--      dentro do trigger de RI da tabela-mãe, então o trigger daqui a vê com profundidade 2.
--      Também é o caso do `handle_new_user` (trigger em auth.users), mas esse nem chega aqui:
--      o papel `author` do cadastro está fora do WHEN do journal. Ações de sistema, NÃO
--      registradas no log — o que se registra é o ato de alguém, e uma cascata é consequência
--      de outro ato (que tem o próprio rastro, ou é manutenção);
--   c) manutenção EXPLÍCITA: `select set_config('iefa.audit_bypass', '<motivo>', true)` na
--      mesma transação. Migrations com seed/backfill nestas tabelas, o faxineiro das fixtures
--      (`purge-test-fixtures.ts`) e o seeder das fixtures de integração do sisub. NÃO é
--      registrado; o motivo aparece só no `current_setting` da transação. A regra opengrep
--      `access-audit-bypass-outside-allowlist` limita onde o código pode escrevê-lo.
--
-- Qualquer outro caminho levanta 42501 ACCESS_CHANGE_UNAUDITED — o esquecimento FALHA em vez de
-- conceder acesso sem rastro. É a exigência do mantenedor: "isso deve ocorrer".
--
-- ── O que cada tabela vigia ─────────────────────────────────────────────────
--
--   access_control.user_permissions, policy, policy_statement, user_policy_attachment — tudo;
--   access_control.mcp_api_keys — INSERT, DELETE e UPDATE que mude `is_active`, `user_id`,
--     `key_hash` ou `expires_at`. O `last_used_at` que o sisub-mcp grava a cada chamada fica de
--     fora: é telemetria, não acesso;
--   forms.response_viewer, response_viewer_scope_binding, questionnaire_editor — tudo;
--   journal.user_profiles — só o PAPEL: INSERT com papel diferente de `author`, UPDATE que
--     troque o papel, DELETE de quem não é `author`. Nome, afiliação e bio seguem livres.
--
-- BEFORE ROW: a escrita recusada nem chega a acontecer. `security invoker`: o trigger não
-- precisa de privilégio nenhum — só lê dois GUCs e a profundidade.
--
-- DDL idempotente (reaplicável).

create or replace function access_control.enforce_audited_access_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	if coalesce(current_setting('iefa.audit_operation', true), '') = ''
		and coalesce(current_setting('iefa.audit_bypass', true), '') = ''
		and pg_trigger_depth() <= 1
	then
		raise exception 'ACCESS_CHANGE_UNAUDITED'
			using errcode = '42501',
				detail = format('%s em %I.%I sem contexto de auditoria', tg_op, tg_table_schema, tg_table_name),
				hint = 'Use a função auditada (access_control.*, forms.*, journal.change_user_role), que grava a mudança e o log na mesma transação. Manutenção explícita: set_config(''iefa.audit_bypass'', ''<motivo>'', true). Ver 20260921120100.';
	end if;
	return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function access_control.enforce_audited_access_change() is
	'Recusa (42501 ACCESS_CHANGE_UNAUDITED) escrita em tabela de acesso sem contexto de auditoria (iefa.audit_operation), sem bypass explícito (iefa.audit_bypass) e fora de cascata/trigger (pg_trigger_depth() > 1). Ver 20260921120100.';

revoke all on function access_control.enforce_audited_access_change() from public, anon, authenticated;

-- ── access_control ──────────────────────────────────────────────────────────

drop trigger if exists enforce_audited_change on access_control.user_permissions;
create trigger enforce_audited_change
	before insert or update or delete on access_control.user_permissions
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on access_control.policy;
create trigger enforce_audited_change
	before insert or update or delete on access_control.policy
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on access_control.policy_statement;
create trigger enforce_audited_change
	before insert or update or delete on access_control.policy_statement
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on access_control.user_policy_attachment;
create trigger enforce_audited_change
	before insert or update or delete on access_control.user_policy_attachment
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on access_control.mcp_api_keys;
create trigger enforce_audited_change
	before insert or delete on access_control.mcp_api_keys
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change_update on access_control.mcp_api_keys;
create trigger enforce_audited_change_update
	before update on access_control.mcp_api_keys
	for each row
	when (
		old.is_active is distinct from new.is_active
		or old.user_id is distinct from new.user_id
		or old.key_hash is distinct from new.key_hash
		or old.expires_at is distinct from new.expires_at
	)
	execute function access_control.enforce_audited_access_change();

-- ── forms ───────────────────────────────────────────────────────────────────

drop trigger if exists enforce_audited_change on forms.response_viewer;
create trigger enforce_audited_change
	before insert or update or delete on forms.response_viewer
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on forms.response_viewer_scope_binding;
create trigger enforce_audited_change
	before insert or update or delete on forms.response_viewer_scope_binding
	for each row execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_change on forms.questionnaire_editor;
create trigger enforce_audited_change
	before insert or update or delete on forms.questionnaire_editor
	for each row execute function access_control.enforce_audited_access_change();

-- ── journal: só o papel ─────────────────────────────────────────────────────

drop trigger if exists enforce_audited_role_insert on journal.user_profiles;
create trigger enforce_audited_role_insert
	before insert on journal.user_profiles
	for each row
	when (new.role is distinct from 'author')
	execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_role_update on journal.user_profiles;
create trigger enforce_audited_role_update
	before update on journal.user_profiles
	for each row
	when (old.role is distinct from new.role)
	execute function access_control.enforce_audited_access_change();

drop trigger if exists enforce_audited_role_delete on journal.user_profiles;
create trigger enforce_audited_role_delete
	before delete on journal.user_profiles
	for each row
	when (old.role is distinct from 'author')
	execute function access_control.enforce_audited_access_change();
