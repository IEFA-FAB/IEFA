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

- [x] 4.1 [sisub] Tela "Meu cadastro militar" (`/diner/military-record`) a partir de `fetchMySaramStatusFn`: um passo por `status`, só os botões de `actions`; aviso de entrada não bloqueante (`MilitaryRecordNotice`) no lugar do diálogo que pedia o SARAM; perfil e onboarding sem campo de SARAM solto (`syncUserSaramFn` sai do app)
- [x] 4.2 [sisub] Perfil com o estado e o caminho para verificar; arranchamento sinaliza conta não verificada sem bloquear; arranchamento e auto check-in explicam a conta de seção
- [x] 4.3 [sisub] Console "Cadastro Militar" (`/admin/military-records`, admin:2): Pedidos, Contestações, Vínculos antigos (e gravados sem verificação), Candidatas a seção (com lote, uma operação auditada por conta), Contas de seção e busca de qualquer conta (`searchSaramAccountsFn`); diálogo com o efeito, motivo obrigatório, elevação de garantia e conflito de versão tratado
- [x] 4.4 [sucont] Aviso e diálogo "Meu cadastro militar" pelas mesmas funções (RPC) no lugar de `saveMySaramFn`; console de acessos rotula pelo SARAM verificado (`fetchVisibleSarams`)
- [x] 4.4b [rumaer] Menu do usuário diz por que o posto não aparece e leva à tela do SISUB
- [x] 4.4c [database] Contrato e frases compartilhados (`@iefa/database/saram-link`): parser do `jsonb`, leitura de cada estado e desfecho, erros com o próximo passo, `visibleSaramOf`
- [ ] 4.5 [sisub] e2e do fluxo de sugestão e do pedido (conferido no navegador no PR da FASE 2; spec Playwright pendente)
- [ ] 4.6 [database] Drop de `core.link_own_saram` depois do deploy do sucont
- [x] 4.7 [root] `bun run check` (afetados), `lint:tailwind`, `scan:rules`, `format:check`
