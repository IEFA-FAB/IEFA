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
  nova, USAGE/grant de cliente fora da allowlist, RLS desligada alcançável e SECURITY DEFINER sem
  `search_path` ou exposta.

## Mudança de acesso: só por função auditada

Conceder, alterar ou revogar acesso, em qualquer app, grava a mudança e a linha de
`access_control.sensitive_operation_log` na mesma transação, com o ator da sessão (nunca do input).
Compensar no app ("muta, loga, desfaz se o log falhar") não serve: a desfeita também pode falhar e o
acesso vale até ser desfeito. Referência: cabeçalhos de
`20260921130000_access_change_audited_functions.sql` e `20260921130100_access_change_enforcement.sql`.

- Tabelas vigiadas: `access_control.{user_permissions, policy, policy_statement,
  user_policy_attachment, mcp_api_keys}`, `forms.{response_viewer, response_viewer_scope_binding,
  questionnaire_editor}` e o `role` de `journal.user_profiles`. Escrita fora de função auditada
  levanta `42501 ACCESS_CHANGE_UNAUDITED`. Passam só: contexto aberto pela função, cascata de FK /
  outro trigger, e bypass explícito.
- Caminhos: `changeModulePermission`/`setModuleBlock` (`@iefa/pbac`), as operações de
  `@iefa/sisub-domain` (`runAccessFunction`), as RPCs `forms.*` e `journal.save_user_profile`.
  Função SQL nova que escreve nessas tabelas abre o contexto antes da primeira escrita
  (`perform access_control.audit_context('<app>.<recurso>.<ação>')`) e grava o log na mesma
  transação; `packages/database/src/access-audit.sql-contract.test.ts` cobra.
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
