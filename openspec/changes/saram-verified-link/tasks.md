## FASE 1 — banco, domínio, server functions (este PR)

### 1. Banco (espera o mantenedor)

- [x] 1.1 [database] Medir no banco (só agregados): chave do e-mail × vínculos atuais, duplicatas, `sgOrg` × `core.units`
- [x] 1.2 [database] Migration `20261003100000_saram_verified_link.sql`: colunas `account_kind`, `saram_verified_by`, `saram_verified_at` em `core.user_data` (CHECKs), tabelas `core.saram_link_request` e `core.saram_verification_attempt` (RLS, sem cliente), índice de expressão no espelho, índices únicos parciais
- [x] 1.3 [database] Funções da chave (`military_name_key`, `email_name_key`), candidatos, tentativas, estado, visibilidade, verificação, pedido, tipo de conta, fila e decisões do admin auditadas
- [x] 1.4 [database] Triggers: `core.user_data` (verificação só por função), `kitchen.arranchamento` e `kitchen.meal_presences` (conta institucional)
- [x] 1.5 [database] Backfill `email`/`legacy`
- [x] 1.6 [root] Índices únicos parciais novos na regra `postgrest-partial-index-upsert`
- [x] 1.7 [database] Harness SQL descartável (`scripts/access-audit/saram-link.test.sql`) e contrato textual (`saram-link.sql-contract.test.ts`)
- [ ] 1.8 [database] Depois do apply: `db:types` e `db:drizzle:pull` (o orquestrador)

### 2. Domínio e server functions

- [x] 2.1 [sisub-domain] `operations/saram-link.ts`: estado, confirmação, CPF, pedido, desistência, tipo de conta, visibilidade, fila e decisões do admin; erros traduzidos
- [x] 2.2 [sisub-domain] `syncUserSaram` passa por `core.claim_saram`; `upsertArranchamento` e `insertPresence` recusam conta institucional
- [x] 2.3 [sisub] `saram-link.fn.ts` (comensal) e `saram-admin.fn.ts` (admin, `fresh` + `admin:2`); registro de garantia; contrato de auth
- [x] 2.4 [sisub] `fetchMilitaryDataFn` e `fetchUserSaramFn` pela visibilidade; onboarding só insiste com ação possível
- [x] 2.5 [sucont] `saveMySaramFn` e `fetchMyIdentityFn` pelas RPCs; diálogo trata pedido enviado
- [x] 2.6 [rumaer] `getMyMilitaryProfileFn` pela visibilidade

### 3. Testes e catálogo

- [x] 3.1 [sisub-domain] Unidade: tradução de estado e erros, authz das operações de admin
- [x] 3.2 [sisub] Integração (`saram-link.operations.test.ts`, roda depois do apply)
- [x] 3.3 [root] Edge cases no catálogo (`comensal-fiscal.md`)
- [x] 3.4 [root] `bun run check` (afetados), `scan:rules`, `format:check`

## FASE 2 — telas (outro PR)

- [ ] 4.1 [sisub] Diálogo/tela de vínculo a partir de `fetchMySaramStatusFn` (um componente por `status`; `actions` decide os botões)
- [ ] 4.2 [sisub] Perfil: selo "SARAM não verificado" e caminho para verificar; arranchamento sinaliza sem bloquear
- [ ] 4.3 [sisub] Console "Vínculos SARAM" (admin): fila com pedidos, contestações, legacy, candidatas a institucional; decidir, vincular, desvincular, marcar tipo, com conflito de versão tratado
- [ ] 4.4 [sucont] Diálogo de primeiro acesso a partir do estado (`saram_link_status`)
- [ ] 4.5 [sisub] e2e do fluxo de sugestão e do pedido
- [ ] 4.6 [database] Drop de `core.link_own_saram` depois do deploy do sucont
- [ ] 4.7 [root] `bun run check`
