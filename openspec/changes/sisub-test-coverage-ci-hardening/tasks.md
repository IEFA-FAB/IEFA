## 1. Baseline e Scripts de Teste

- [x] 1.1 [sisub] Corrigir erros atuais de `lint` em arquivos de teste e acessibilidade sem alterar comportamento de produto
- [x] 1.2 [sisub] Corrigir erros atuais de `typecheck` em `useRealtime.ts`, `useRealtime.test.ts` e testes de receitas
- [x] 1.3 [sisub] Separar scripts em `package.json`: `test:unit`, `test:integration`, `test:e2e:ci`, `test:e2e:full` e ajustar `test` — `apps/sisub/package.json` tem os quatro, mais `test:integration:gate` e `test:integration:janitor`
- [x] 1.4 [root] Atualizar `turbo.json` com tasks/env para suites unitárias, integração e E2E do `sisub` — `turbo.json:33,47,50,61,65,76`
- [x] 1.5 [ci] Atualizar path filters do workflow para incluir `apps/sisub/**`, `packages/pbac/**`, `packages/sisub-domain/**`, `packages/database/**` e configs de CI — `.github/paths-filter.yml:103-113` (filtro `sisub`) e `.github/workflows/integration.yml` (`on.pull_request.paths`)

## 2. Infra de Testes de Integração

- [x] 2.1 [sisub] Criar helper de env de testes que falha no CI quando `SISUB_INTEGRATION_REQUIRED=true` e env obrigatória está ausente — `apps/sisub/src/test/supabase.ts:24-27` (`integrationEnabled` / `integrationRequired` / `describeSupabaseIntegration`)
- [x] 2.2 [sisub] Criar helper Supabase de teste com clientes `service`, `anon` e usuário autenticado, sem non-null assertions — `apps/sisub/src/test/supabase.ts` (`createSisubServiceClient`, `createSisubAnonClient`, `createSisubReachabilityClient`, `getSupabaseTestEnv`)
- [x] 2.3 [sisub] Criar helpers de seed/cleanup para dados `[TEST]` com soft delete ou hard delete conforme tabela — `src/test/operations-fixtures.ts` (hard delete LIFO, falha alto quando vaza) + `scripts/purge-test-fixtures.ts` (faxina por marcador, cobre morte abrupta do processo)
- [x] 2.4 [sisub] Migrar `ingredients.test.ts`, `recipes.test.ts` e `useRealtime.test.ts` para skip/fail explícito em vez de `return` silencioso
- [ ] 2.5 [docs] **PARCIAL** — Documentar env vars, usuários dedicados, política de cleanup e ~~proibição de rodar integração contra produção~~
  - Já documentado: `TESTING.md` (raiz, estado + ordem de dano), cabeçalho de `apps/sisub/src/test/operations-fixtures.ts:1-20` (marcador `[TEST]`, cleanup LIFO hard delete, limite do `afterEach`, rede do janitor) e o cabeçalho de `.github/workflows/integration.yml:1-27` (camadas gate/full, concurrency de grupo fixo, faxina pré/pós).
  - Falta: um doc operacional único listando as env vars obrigatórias (`SISUB_DATABASE_URL`, `SISUB_SUPABASE_SECRET_KEY`, `VITE_SISUB_*`, `SISUB_RUN_INTEGRATION`, `SISUB_INTEGRATION_REQUIRED`, `E2E_TEST_USER_*`, `E2E_STORAGE_KITCHEN_ID`) e os usuários E2E dedicados com as permissões PBAC que cada spec assume (`storage.spec.ts` exige `storage` nível 3).
  - ~~proibição de rodar integração contra produção~~ — **CADUCA**: o repo decidiu o contrário. A suíte roda contra o banco REAL de produção (`operations-fixtures.ts:13-15`, `TESTING.md:48`, comentário de `integration.yml`), protegida por rollback transacional no `gate`, marcador `[TEST]` e o janitor no `full`. O ambiente staging dedicado do D4 nunca existiu.

## 3. PBAC e Autorização

- [x] 3.1 [pbac] Adicionar testes unitários para `hasPermission()` cobrindo global, escopado, escopo errado, nível insuficiente e módulo errado — `packages/pbac/src/has-permission.test.ts`
- [x] 3.2 [pbac] Adicionar testes unitários para `resolveUserPermissions()` cobrindo deny strip e allow implícito de `diner` — `packages/pbac/src/resolve-permissions.test.ts` (+ `effective-permissions.test.ts`, `module-permissions.test.ts`, `guards.test.ts`, `start.test.ts`)
- [x] 3.3 [sisub-domain] Adicionar testes para `requirePermission`, `requireKitchen`, `requireUnit` e `requireMessHall` — `packages/sisub-domain/src/guards/require-permission.test.ts:24,50,73`
- [ ] 3.4 [sisub] **PARCIAL** — Criar matriz de testes de server functions sem sessão, sem permissão, escopo errado e escopo correto
  - A perna **sem sessão** está FEITA e é exaustiva, por scanner estático: `apps/sisub/src/server/server-fn-auth.contract.test.ts:87` ("toda server function tem guard de autenticação ou está declarada como pública") varre as 61 `*.fn.ts`, com allowlist justificada e `:112` exigindo o guard ANTES de qualquer acesso ao banco.
  - A perna **sem permissão / escopo errado / escopo correto** existe como matriz `test.each` na camada onde o guard mora (domain ops), em `packages/sisub-domain/src/operations/*.authz.test.ts` — ex. `ata.authz.test.ts:79` ("nega unit:2 em OUTRA unidade", "nega quem só lê", "nega sem permissão de unidade", "deixa passar unit:2 na unidade dona", "deixa passar unit:2 sem escopo").
  - Falta: cobertura. São **9 arquivos `.authz.test.ts` para 54 módulos de operations**. Sem matriz: `forecast`, `messhall`/`presence`, `procurement`, `arp`/`empenho`, `unit-dashboard`, `stock`/`receiving`, `planning`, `templates`, `kitchens`, entre outros.
- [x] 3.5 [sisub] Cobrir server functions críticas de `permissions.fn.ts`, `places.fn.ts`, `unit-settings.fn.ts` e `kitchen-settings.fn.ts` — `apps/sisub/src/server/security-contracts.test.ts:56,344` + `src/test/operations/permissions.operations.test.ts`, `places.operations.test.ts`
- [x] 3.6 [sisub] Cobrir rotas protegidas com E2E ou teste de `beforeLoad` para redirect `/auth` e `/hub` — `apps/sisub/e2e/tests/auth.spec.ts:63` ("rota protegida /hub redireciona para /auth quando não autenticado"), `authz.spec.ts:71` ("rota protegida sem sessão redireciona para /auth"), `navigation.spec.ts:21` (autenticado permanece em `/hub`)

## 4. Domain Layer e Planejamento

- [ ] 4.1 [sisub-domain] **PARCIAL** — Adicionar testes unitários para schemas de receitas, templates, planejamento, kitchens e meal-types
  - Feito: **receitas** em `apps/sisub/src/server/recipes.test.ts:11` (`CreateRecipeSchema`, `IngredientSchema`, `SaveRecipeEditSchema`); políticas em `packages/sisub-domain/src/schemas/policies.test.ts`; schemas de agente em `packages/sisub-domain/src/agent/schemas.test.ts`.
  - Falta: `templates.ts`, `planning.ts`, `kitchens.ts` e `meal-types.ts` não têm teste de schema. Nota de posicionamento: o teste de receitas mora no app, não no package — o contrato é do `@iefa/sisub-domain`.
- [ ] 4.2 [sisub-domain] **PARCIAL** — Adicionar teste de integração para `fetchRecipe()` não retornar receita com `deleted_at`
  - `apps/sisub/src/test/operations/recipes.operations.test.ts:326` prova o soft delete pelo caminho de LISTAGEM (`listRecipes` some / reaparece com `includeDeleted` / `restoreRecipe` reverte). Falta a asserção direta em `fetchRecipe(id)` de receita excluída — é o caminho por onde a tela de detalhe entra.
- [x] 4.3 [sisub-domain] Adicionar teste de integração para `listRecipes()` retornar só a versão mais recente da família — `apps/sisub/src/test/operations/recipes.operations.test.ts:294` ("listRecipes faz dedup por família mantendo a maior versão")
- [x] 4.4 [sisub-domain] Adicionar testes de integração para `createRecipe()` e ~~`createRecipeVersion()`~~ `saveRecipeEdit()` com ingredientes — `recipes.operations.test.ts:62` (createRecipe + ingredientes), `:134`, `:342` ("cria nova versão com base_recipe_id na raiz"), `:382` (`listRecipeVersions`). **Nome caduco**: `createRecipeVersion` foi substituído por `saveRecipeEdit` nos PRs #124-#128 (bug do `kitchen:2` mutando ativo global)
- [x] 4.5 [sisub-domain] Adicionar testes de integração para `fetchDailyMenus`, `upsertDailyMenu`, `addMenuItem`, `removeMenuItem` e `restoreMenuItem` — `apps/sisub/src/test/operations/planning.operations.test.ts:73,92,107,117,137,145`
- [x] 4.6 [sisub-domain] Adicionar testes de integração para `applyTemplate`, `forkTemplate`, `deleteTemplate` e `restoreTemplate` — `apps/sisub/src/test/operations/templates.operations.test.ts:194` (fork), `:283` (delete/restore), `:297`, `:323`, `:385`, `:434` (applyTemplate)
- [x] 4.7 [sisub-domain] Adicionar testes de integração para CRUD/soft delete de `meal_type` — `apps/sisub/src/test/operations/meal-types.operations.test.ts:46,60,72,85`

## 5. Compras, ATA, ARP e Empenho

- [ ] 5.1 [sisub] **PARCIAL** — Adicionar testes para `calculateAtaNeedsFn()` com agregação, repetição, `portion_yield`, arredondamento e ordenação
  - Feito: `apps/sisub/src/test/operations/ata.operations.test.ts:200` ("agrega net_quantity × (headcount/portion_yield) × repetitions", 150 × 2 × 2 = 600) e `src/test/unit/demand-math.test.ts` (`scaleIngredientQuantity`, rendimento 0/nulo → 1, paridade aquisição × datado).
  - Falta: **arredondamento** (quantidade fracionária/casas decimais) e **ordenação** do resultado.
- [ ] 5.2 [sisub] **PARCIAL** — Adicionar testes para `fetchProcurementNeedsFn()` ignorar itens excluídos e menus deletados
  - Feito: `apps/sisub/src/test/operations/procurement.operations.test.ts:46` (agregação, com `excludedFromProcurement: 0` na fixture) e `:68` (intervalo vazio → `[]`).
  - Falta: o caso positivo dos dois filtros — item com `excluded_from_procurement = 1` e `daily_menu`/`menu_item` com `deleted_at` NÃO podem entrar na necessidade. Hoje nada quebra se o `WHERE` cair.
- [x] 5.3 [sisub] Adicionar teste de integração para `createAtaFn()` persistir lista, cozinhas, seleções e itens — `apps/sisub/src/test/operations/ata.operations.test.ts:74` ("createAta persiste lista + cozinhas + seleções + itens; fetchAtaDetails faz round-trip aninhado")
- [x] 5.4 [sisub] Adicionar teste de integração para `fetchAtaListFn`, `fetchAtaDetailsFn`, `updateAtaStatusFn` e `deleteAtaFn` — `ata.operations.test.ts:109` (ordem desc + exclui soft-deleted + id inexistente → null, com `deleteAta` em `:120`), `:128` (transição de status), `:248` (proíbe downgrade published → draft)
- [ ] 5.5 [sisub] Mockar HTTP do Compras.gov para `searchArpFn`, `importArpItemsFn` e `syncArpBalanceFn` — **ABERTA**. Só existe `apps/sisub/src/lib/compras-json.test.ts` (parser de `idCompra` acima de MAX_SAFE_INTEGER); `apps/sisub/src/server/arp.fn.ts:61,110,256` não têm teste
- [ ] 5.6 [sisub] Adicionar testes para `createEmpenhoFn()` calcular `valor_total`, normalizar número e tratar duplicidade — **ABERTA** (`apps/sisub/src/server/arp.fn.ts:371`)
- [ ] 5.7 [sisub] Adicionar teste para `anularEmpenhoFn()` alterar status sem hard delete — **ABERTA** (`apps/sisub/src/server/arp.fn.ts:500`). `src/test/unit/arp-balance.test.ts:23` cobre só o EFEITO do status anulado na agregação pura (`aggregateLocalCommitments`), não a operação de anular
- [ ] 5.8 [sisub] Adicionar testes para `fetchUnitDashboardFn()` filtrar consumo >= 80% e priorizar item em cardápio futuro — **ABERTA** (`apps/sisub/src/server/unit-dashboard.fn.ts:58` → `fetchUnitDashboard` do domínio; nenhum teste referencia o nome)

## 6. Comensal, Fiscal e Onboarding

- [ ] 6.1 [sisub] **PARCIAL** — Adicionar testes para `upsertForecastFn`, `deleteForecastFn` e `persistDefaultMessHallFn` usando userId da sessão
  - Feito (operations): `apps/sisub/src/test/operations/forecast.operations.test.ts:46` (upsert cria + atualiza na mesma chave user/date/meal), `:65` (persistDefaultMessHall round-trip), `:78` (deleteForecast).
  - Falta (a parte que protege): a invariante **self-only** de `apps/sisub/src/server/forecast.fn.ts:28-60` não tem teste. O contrato self-only em `server-fn-auth.contract.test.ts:192` varre APENAS `user.fn.ts` — trocar `requireUserId()` por `data.userId` em `forecast.fn.ts` passaria verde hoje. Estender o scanner é barato e cobre 6.1 e 6.2 de uma vez.
- [ ] 6.2 [sisub] **PARCIAL** — Adicionar testes para `fetchMealForecastsFn` e `fetchUserDefaultMessHallFn` com dados isolados por usuário
  - Feito: as operations `listMealForecasts` / `getUserDefaultMessHall` têm round-trip em `forecast.operations.test.ts:46,65`.
  - Falta: o isolamento em si — dois usuários, cada um lendo só a própria previsão/rancho — e a mesma lacuna de self-only descrita em 6.1 (as duas são reads que ignoram o `userId` do payload por comentário, não por teste).
- [x] 6.3 [sisub] Adicionar testes para `insertPresenceFn` preservar código de duplicidade e exigir autenticação — `apps/sisub/src/test/operations/presence.operations.test.ts:79` ("insertPresence grava e preserva código 23505 em duplicata; deletePresence remove") + guard obrigatório provado por `server-fn-auth.contract.test.ts:87`
- [x] 6.4 [sisub] Adicionar testes para `deletePresenceFn`, `fetchPresencesFn` e `fetchForecastsFn` — `presence.operations.test.ts:46` (`listPresences` mapeia a view), `:64` (`listForecastMap`), `:79` (delete) + `src/test/operations/dashboard.operations.test.ts:23,39,46`
- [ ] 6.5 [sisub] Adicionar testes para `addOtherPresenceFn` e `fetchOtherPresencesCountFn` — **ABERTA** (`apps/sisub/src/server/messhall.fn.ts:48`; nenhum teste cita os nomes)
- [ ] 6.6 [sisub] Adicionar E2E de self check-in com rancho válido, forecast esperado e rancho inválido — **ABERTA** (não há spec de check-in em `apps/sisub/e2e/tests/`)
- [x] 6.7 [sisub] Adicionar testes para `syncUserNrOrdemFn`, `syncUserEmailFn` e `submitEvaluationFn` com usuário autenticado — `apps/sisub/src/test/operations/user.operations.test.ts:79` (upsert idempotente), `:93` (reivindica email de linha órfã) + `packages/sisub-domain/src/operations/evaluation.authz.test.ts:161` ("autor sai do contexto, nunca do payload": grava o userId da sessão / ignora autor forjado)

## 7. Analytics, IA e Realtime

- [x] 7.1 [sisub] Adicionar testes unitários para `validateSql()` cobrindo SELECT/CTE, DML/DDL, whitelist, múltiplas instruções, tamanho e LIMIT — `apps/sisub/src/lib/analytics-sql.test.ts`
- [x] 7.2 [sisub] Extrair helpers testáveis de chart-spec parsing/normalização se necessário, mantendo comportamento do endpoint — `apps/sisub/src/lib/analytics-chart-spec.ts` (+ `.test.ts`)
- [ ] 7.3 [sisub] **PARCIAL** — Adicionar testes para chart-spec válido, JSON com vírgula final, fence variante e chave de eixo/série ausente
  - Feito: `apps/sisub/src/lib/analytics-chart-spec.test.ts:5` (JSON puro), `:11` (fence json aninhado), `:24` (vírgulas finais), `:44` (quebras de linha/tabs literais), `:55` (sem objeto JSON → SyntaxError).
  - Falta: **chave de eixo/série ausente** — os testes só exercitam `extractJsonFromSpec` (parsing). A validação/normalização do spec com `xKey`/`series` faltando não é coberta.
- [x] 7.4 [sisub] Adicionar testes para module-chat tools: validação de UUID/inteiro/data, erro sanitizado e permissão por módulo/escopo — `apps/sisub/src/lib/module-chat/tools/{model-args,shared,table-schemas,unit-behavior}.test.ts` + `packages/sisub-domain/src/agent/{schemas,model-input,budget}.test.ts`
- [ ] 7.5 [sisub] Adicionar testes de endpoint para `/api/analytics/stream` sem sessão e payload inválido — **ABERTA**. `apps/sisub/routes/api/analytics/stream.post.ts` implementa 503 (capability), 401 (sem sessão) e 400 (corpo inválido); nenhum dos três tem teste
- [ ] 7.6 [sisub] Adicionar testes de endpoint para `/api/module-chat/stream` sem sessão, sem permissão e scopeId errado — **ABERTA** (`apps/sisub/routes/api/module-chat/stream.post.ts`, sem teste)
- [ ] 7.7 [sisub] **PARCIAL** — Corrigir e manter testes realtime com tipagem Supabase válida e skip/fail explícito
  - Feito: `apps/sisub/src/hooks/realtime/useRealtime.test.ts` usa `describeSupabaseIntegration` (skip explícito no nível do describe) e tipos derivados, sem non-null assertion.
  - Falta: dentro dos testes o guard ainda é `if (!reachable) return` (`:112`, `:120`, `:182`, `:219`) — banco alcançável mas com erro devolve **verde vazio**, que é exatamente o falso positivo que o D4/2.1 quer eliminar. Trocar por `test.skipIf(...)` ou falhar quando `SISUB_INTEGRATION_REQUIRED=true`.

## 8. E2E e CI/CD

- [ ] 8.1 [sisub] **PARCIAL** — Reorganizar Playwright para separar `smoke`, `auth`, `critical` e `full`
  - Feito: `apps/sisub/package.json` tem `test:e2e:ci` (lista explícita: `smoke`, `auth`, `navigation`, `authz`) e `test:e2e:full` (`ALL_BROWSERS=true`, projetos firefox/webkit em `playwright.config.ts:44`).
  - Falta: não existe grupo `critical`. `budget.spec.ts`, `storage.spec.ts` e `recipe-form.spec.ts` ficam FORA do `test:e2e:ci` e, na prática, fora de qualquer caminho de CI — a separação hoje é uma lista de arquivos digitada no script, não tag/projeto.
- [ ] 8.2 [sisub] Adicionar E2E crítico de forecast do comensal com persistência visível na UI — **ABERTA** (`/diner/forecast` só é visitada como fonte de server fns em `authz.spec.ts:21`)
- [ ] 8.3 [sisub] Adicionar E2E crítico de usuário sem permissão tentando acessar módulo restrito — **ABERTA**. `authz.spec.ts` cobre só **sem sessão** (401 nas server fns, redirect para `/auth`); não há fixture de usuário autenticado SEM a permissão do módulo
- [ ] 8.4 [sisub] **PARCIAL** — Adicionar E2E crítico de página de módulo permitido sem `pageerror`
  - Feito (render): `navigation.spec.ts:28` (`/diner` 200, sem redirect), `storage.spec.ts:39` (8 telas), `budget.spec.ts:25` (telas de execução orçamentária) — todas provam 200 + heading visível + não caiu em `/auth`.
  - Falta: nenhuma delas escuta `page.on("pageerror")`. O único teste de erro de console é `smoke.spec.ts:15`, e só na home. E as duas suítes de módulo estão fora do `test:e2e:ci`.
- [ ] 8.5 [ci] **REGREDIU (estava [x])** — Reativar job E2E mínimo do `sisub` no workflow de deploy com Chromium, retries e artifacts
  - O job `e2e-sisub` está **comentado inteiro** em `.github/workflows/deploy.yml:481-522`, com a nota "E2E SISUB temporarily disabled. Re-enable this job and add it back to deploy-sisub.needs when the CI webServer timeout / test credentials setup is fixed."
  - O que já existe pronto para religar: o corpo do job (Chromium, `test:e2e:ci`, upload de `playwright-report/` + `test-results/`), `retries: 2` em CI (`playwright.config.ts:30`) e os secrets `SISUB_E2E_TEST_USER_EMAIL`/`_PASSWORD` referenciados. Falta resolver o timeout do `webServer` e as credenciais.
- [ ] 8.6 [ci] Adicionar workflow manual/agendado para E2E full e integrações externas lentas — **ABERTA**. `schedule:`/`cron` só existe em `security.yml:19-21`; `integration.yml` tem `workflow_dispatch` (integração, não E2E) e nada chama `test:e2e:full`
- [ ] 8.7 [ci] **REGREDIU (estava [x])** — Garantir que `deploy-sisub` depende de checks, build e E2E mínimo bem-sucedidos
  - Parcial: `deploy-sisub.needs: [build-sisub]` → `build-sisub.needs: [check-sisub, warm-deps]` → `check-sisub` roda `lint typecheck test:unit test:integration` do sisub + `test` de `pbac` e `sisub-domain` (`deploy.yml:425-461`). Essa parte vale.
  - Falta: a perna E2E. Com o job de 8.5 comentado, `deploy-sisub` NÃO depende de E2E nenhum.
  - Nota de escopo real: `deploy.yml` só dispara em `push` na `main`. No PR rodam apenas `security.yml` e `integration.yml` — ou seja, `lint`, `typecheck` e os testes unitários são gate **depois** do merge, e o gate antes do merge é local. A spec `sisub-ci-quality-gates` fala em "bloquear deploy", e nesse recorte ela continua descrevendo a realidade; ela NÃO cobre "bloquear merge".

## 9. Validação Final

- [x] 9.1 [sisub] Executar `bun run test:unit` e corrigir falhas
- [ ] 9.2 [sisub] Executar `bun run test:integration` com `SISUB_INTEGRATION_REQUIRED=true` em ambiente staging/dev e corrigir falhas — nota: o alvo real é o banco de PRODUÇÃO com rollback (ver 2.5); "staging/dev" caducou
- [ ] 9.3 [sisub] Executar `bun run test:e2e:ci` e validar artifacts em falha
- [ ] 9.4 [root] Executar `bunx turbo run build --filter=./apps/sisub` e corrigir falhas
- [ ] 9.5 [root] Executar `bun run check` e corrigir falhas de Biome/typecheck
