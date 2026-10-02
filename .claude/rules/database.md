---
paths:
  - "packages/database/**"
  - "packages/pbac/**"
  - "packages/sisub-domain/src/operations/**"
  - "**/*.sql"
  - "apps/*/src/server/**"
---

# Banco (Supabase): grants, RLS e mudança de acesso

Schemas: `sisub` é o default; o domínio foi dividido em `core`, `kitchen`, `inventory`,
`procurement`, `finance`, `access_control`, `nutrition_reference`, `siafi_integration` e
`compras_gov_integration`. Cross-app: `iefa` (apps, favoritos, documentos legais), `journal`,
`forms`, `rumaer`, `sucont`, `assignment_selection`, `gs`. Env: `VITE_SISUB_SUPABASE_URL`,
`VITE_SISUB_SUPABASE_PUBLISHABLE_KEY` (cliente), `SISUB_SUPABASE_SECRET_KEY` (servidor).

Scripts do pacote rodam por `bun --filter @iefa/database <script>` (ou `cd packages/database`), nunca
chamando a CLI do `supabase` solta: os scripts já carregam schemas e project-id.

## Funções SQL: EXECUTE negado por padrão

Todo schema de `pgrst.db_schemas` vira API: cada função é um `POST /rest/v1/rpc/<nome>`, e a chave
publicável (`anon`/`authenticated`) está no bundle de todo app. Desde `20260920210000`:

- Função nova nasce executável só por `postgres` (dono) e `service_role`. O default global do dono não
  concede mais a PUBLIC; não é preciso `revoke` em função nova.
- `revoke … from anon, authenticated` não fecha nada: eles herdam de PUBLIC. E `alter default
  privileges … in schema X revoke … from public` não gruda (o por-schema só acrescenta ao global).
- O navegador não chama função nenhuma; só auth, upload por URL assinada e Realtime de tabela com
  policy `using (true)`. Conceder EXECUTE a `anon`/`authenticated` exige entrar na
  `CLIENT_EXECUTE_ALLOWLIST` de `packages/database/scripts/audit-rls.ts`, com o motivo.
- Cliente só alcança o que o navegador lê (desde `20260920230000`): USAGE apenas em
  `assignment_selection` (Realtime do telão), `kitchen` (só `authenticated`, Realtime do sisub) e
  `public`, e SELECT só nas seis tabelas da publicação `supabase_realtime`. Tabela nova para o
  navegador entra na `CLIENT_TABLE_ALLOWLIST` (schema novo, na `CLIENT_SCHEMA_ALLOWLIST`) do mesmo
  arquivo, com o motivo, e na publicação se for Realtime.
- Gate: `bun --filter @iefa/database audit:rls` roda no job `gate` do `integration.yml` e falha em
  função executável por cliente, função que o `service_role` não executa, default que abra função
  nova, USAGE/grant de cliente fora da allowlist, RLS desligada alcançável, função sem `search_path`
  fixo (definer ou não) e SECURITY DEFINER exposta. Também cobra os triggers de
  `20261001140000…140200` (log append-only, TRUNCATE das vigiadas, troca de e-mail em `auth.users`) e
  default de privilégios do `postgres` que conceda a cliente em qualquer schema (`storage` incluso).
- Default de privilégios que o `postgres` não alcança: o do `supabase_admin` em `public` (e
  `graphql`/`graphql_public`) concede tudo e EXECUTE a `anon`/`authenticated` em objeto que ELE
  crie (extensões da plataforma). `alter default privileges for role supabase_admin` exige ser
  membro desse role, e o `postgres` não é; só o suporte da Supabase muda. O que as nossas
  migrations criam é do `postgres`, cujo default não concede a cliente em schema nenhum desde
  `20261001140300` (o de `storage` foi revogado; os grants e policies do Storage existentes ficam).
- Função nova ou recriada fixa `set search_path` (de preferência `''`, com tudo qualificado; built-in
  de `pg_catalog` dispensa schema). `create or replace` sem a cláusula apaga o `search_path` que a
  função tinha. A regra `migration-function-without-search-path` do opengrep acusa na migration
  (posterior a `20260926212000`), e o `audit:rls` (`function_search_path`) no banco vivo.
  `pg_trgm` e `unaccent` vivem em `public` neste banco, não em `extensions`.

## Mudança de acesso: só por função auditada

Conceder, alterar ou revogar acesso, em qualquer app, grava a mudança e a linha de
`access_control.sensitive_operation_log` na mesma transação, com o ator da sessão (nunca do input).
Compensar no app ("muta, loga, desfaz se o log falhar") não serve: a desfeita também pode falhar e o
acesso vale até ser desfeito. Referência: cabeçalhos de
`20260921130000_access_change_audited_functions.sql` e `20260921130100_access_change_enforcement.sql`.

- Tabelas vigiadas: `access_control.{user_permissions, policy, policy_statement,
  user_policy_attachment, mcp_api_keys, signup_allowlist}`, `forms.{response_viewer,
  response_viewer_scope_binding, questionnaire_editor}`, `assignment_selection.access_grant`
  (desde `20261001150000`) e o `role` de `journal.user_profiles`.
  Tabela de acesso nova liga, na própria migration, o trigger `enforce_audited_change` (por linha)
  e o `enforce_audited_truncate` (BEFORE TRUNCATE, `20261001140100`: TRUNCATE não dispara trigger
  de linha, e só o bypass o libera). Escrita fora de função auditada
  levanta `42501 ACCESS_CHANGE_UNAUDITED`. Passam só: contexto aberto pela função, cascata de FK /
  outro trigger, e bypass explícito.
- Caminhos: `changeModulePermission`/`setModuleBlock` (`@iefa/pbac`), as operações de
  `@iefa/sisub-domain` (`runAccessFunction`), as RPCs `forms.*`, `journal.save_user_profile` e
  `assignment_selection.{grant,revoke}_controller_access` (só pelo SQL; o app não concede).
- **Cadastro:** só `@fab.mil.br` cria conta, no servidor, pelo hook "Before User Created"
  (`access_control.before_user_created`, ligado em Auth → Hooks desde 2026-10-01). Vale para o
  cadastro público e OAuth; `auth.admin.createUser` com a chave secreta NÃO passa pelo hook
  (conferido em produção). E-mail de fora entra por `access_control.authorize_external_signup`
  (console de Permissões do sisub), que libera o cadastro e a troca de e-mail para ele. Fixture que cria
  usuário de teste autoriza o e-mail antes (`authorizeSignup` do `access-fixture-writer`).
  Trocar o e-mail depois também: o trigger `enforce_institutional_email` em `auth.users`
  (`20261001140200`) recusa `email`/`email_change` novo fora de `@fab.mil.br` sem autorização ativa
  e não toca UPDATE que não muda o endereço (login, refresh, recovery). `@example.invalid` é
  recusado mesmo autorizado: conta existente não migra para o domínio que o faxineiro apaga. O `postgres` cria trigger em
  `auth.users`, mas não o remove (o dono é `supabase_auth_admin`): para desligar, `create or
  replace` da função com `return new`.
  Função SQL nova que escreve nessas tabelas abre o contexto antes da primeira escrita
  (`perform access_control.audit_context('<app>.<recurso>.<ação>')`) e grava o log na mesma
  transação; `packages/database/src/access-audit.sql-contract.test.ts` cobra.
- **Logs append-only** (`20261001140000`): `sensitive_operation_log` e `mfa_reset_log` só aceitam
  INSERT. UPDATE/DELETE/TRUNCATE estão revogados de todo mundo menos o dono e recusados por trigger
  (`42501 AUDIT_LOG_APPEND_ONLY`), inclusive para o dono e com contexto de função auditada. Registro
  errado se corrige com linha nova. Única exceção: DELETE com `iefa.audit_bypass` de linha cujos
  usuários (colunas e todo uuid de usuário no `target`) são todos `@example.invalid` (o faxineiro
  de fixtures). Teste grava log só dentro de transação desfeita. O `service_role` só tem INSERT e
  SELECT; TRIGGER também saiu (um `before insert … return null` calaria o log).
- Migration com seed/backfill nessas tabelas abre o bypass na própria transação:
  `select set_config('iefa.audit_bypass', '<motivo>', true);`. Sem ele, a migration falha. No código
  TS o bypass só é permitido nos arquivos da allowlist de `.opengrep/rules/access-audit.yaml`.

## Migrations

O banco é um só, compartilhado por todas as branches, e a suíte da `main` tem de passar contra ele
em todo instante. O guard de `apps/sisub/src/test/operations/training.operations.test.ts` é
default-deny: varre o banco vivo atrás de toda tabela com `kitchen_id`, `unit_id` ou `mess_hall_id`
e cobra que ela esteja em `RESET_TARGET_TABLES` ou `RESET_EXCLUSIONS`. "Migration aditiva é segura"
é falso aqui: tabela nova aplicada antes da declaração derruba o `check-sisub` de todo PR.

- Ordem: **declara → aplica → mergeia.** (1) PR pequeno que declara a tabela no guard (verde nos
  dois estados); (2) aplica a migration; (3) mergeia o recurso, com o teste de integração no mesmo PR.
- Se já aconteceu, o remédio é um PR de uma linha em `RESET_EXCLUSIONS`, com a justificativa.
- Arquivo em `supabase/migrations/` tem timestamp de 14 dígitos e único. Conferir colisão antes de
  criar: `ls packages/database/supabase/migrations | grep -oE '^[0-9]{14}' | sort | uniq -d`.
- `db:push` roda sempre com `--dry-run` antes, conferindo que a lista tem só a sua migration.
- **Migration que muda tabela, coluna, view ou função regera os tipos no mesmo PR**:
  `bun --filter @iefa/database db:types` (`generated.ts`) e `db:drizzle:pull` (`drizzle/schema.ts`
  e `relations.ts`), depois de aplicada. Nunca editar esses arquivos à mão: o que o pull gera
  errado se corrige em `scripts/patch-drizzle-pull.ts` (ciclo de FK, `bigserial` como number,
  relação lógica sem FK…), senão o próximo pull desfaz. Em 2026-09-26 os dois estavam meses
  atrás do banco porque o schema Drizzle tinha remendo manual e o pull cru não compilava.
  `db-types-drift.contract.test.ts` (integração) reprova tipo que aponta para o que o banco
  não tem, e avisa o que o banco tem e os tipos ainda não.
- Nunca seguir a sugestão da CLI de `migration repair --status reverted`: há versões aplicadas no
  remoto com carimbo diferente do arquivo local, e o reparo declara não aplicado o que está em
  produção; o push seguinte arrasta migrations de contract junto.
- `UNIQUE` não enxerga `deleted_at`; soft delete com unicidade usa índice parcial ou upsert com
  `onConflict`.
