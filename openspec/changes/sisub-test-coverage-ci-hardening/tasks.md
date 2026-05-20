## 1. Baseline e Scripts de Teste

- [x] 1.1 [sisub] Corrigir erros atuais de `lint` em arquivos de teste e acessibilidade sem alterar comportamento de produto
- [x] 1.2 [sisub] Corrigir erros atuais de `typecheck` em `useRealtime.ts`, `useRealtime.test.ts` e testes de receitas
- [x] 1.3 [sisub] Separar scripts em `package.json`: `test:unit`, `test:integration`, `test:e2e:ci`, `test:e2e:full` e ajustar `test`
- [x] 1.4 [root] Atualizar `turbo.json` com tasks/env para suites unitárias, integração e E2E do `sisub`
- [x] 1.5 [ci] Atualizar path filters do workflow para incluir `apps/sisub/**`, `packages/pbac/**`, `packages/sisub-domain/**`, `packages/database/**` e configs de CI

## 2. Infra de Testes de Integração

- [x] 2.1 [sisub] Criar helper de env de testes que falha no CI quando `SISUB_INTEGRATION_REQUIRED=true` e env obrigatória está ausente
- [x] 2.2 [sisub] Criar helper Supabase de teste com clientes `service`, `anon` e usuário autenticado, sem non-null assertions
- [ ] 2.3 [sisub] Criar helpers de seed/cleanup para dados `[TEST]` com soft delete ou hard delete conforme tabela
- [x] 2.4 [sisub] Migrar `ingredients.test.ts`, `recipes.test.ts` e `useRealtime.test.ts` para skip/fail explícito em vez de `return` silencioso
- [ ] 2.5 [docs] Documentar env vars, usuários dedicados, política de cleanup e proibição de rodar integração contra produção

## 3. PBAC e Autorização

- [x] 3.1 [pbac] Adicionar testes unitários para `hasPermission()` cobrindo global, escopado, escopo errado, nível insuficiente e módulo errado
- [x] 3.2 [pbac] Adicionar testes unitários para `resolveUserPermissions()` cobrindo deny strip e allow implícito de `diner`
- [x] 3.3 [sisub-domain] Adicionar testes para `requirePermission`, `requireKitchen`, `requireUnit` e `requireMessHall`
- [ ] 3.4 [sisub] Criar matriz de testes de server functions sem sessão, sem permissão, escopo errado e escopo correto
- [x] 3.5 [sisub] Cobrir server functions críticas de `permissions.fn.ts`, `places.fn.ts`, `unit-settings.fn.ts` e `kitchen-settings.fn.ts`
- [ ] 3.6 [sisub] Cobrir rotas protegidas com E2E ou teste de `beforeLoad` para redirect `/auth` e `/hub`

## 4. Domain Layer e Planejamento

- [ ] 4.1 [sisub-domain] Adicionar testes unitários para schemas de receitas, templates, planejamento, kitchens e meal-types
- [ ] 4.2 [sisub-domain] Adicionar teste de integração para `fetchRecipe()` não retornar receita com `deleted_at`
- [ ] 4.3 [sisub-domain] Adicionar teste de integração para `listRecipes()` retornar só a versão mais recente da família
- [ ] 4.4 [sisub-domain] Adicionar testes de integração para `createRecipe()` e `createRecipeVersion()` com ingredientes
- [ ] 4.5 [sisub-domain] Adicionar testes de integração para `fetchDailyMenus`, `upsertDailyMenu`, `addMenuItem`, `removeMenuItem` e `restoreMenuItem`
- [ ] 4.6 [sisub-domain] Adicionar testes de integração para `applyTemplate`, `forkTemplate`, `deleteTemplate` e `restoreTemplate`
- [ ] 4.7 [sisub-domain] Adicionar testes de integração para CRUD/soft delete de `meal_type`

## 5. Compras, ATA, ARP e Empenho

- [ ] 5.1 [sisub] Adicionar testes para `calculateAtaNeedsFn()` com agregação, repetição, `portion_yield`, arredondamento e ordenação
- [ ] 5.2 [sisub] Adicionar testes para `fetchProcurementNeedsFn()` ignorar itens excluídos e menus deletados
- [ ] 5.3 [sisub] Adicionar teste de integração para `createAtaFn()` persistir lista, cozinhas, seleções e itens
- [ ] 5.4 [sisub] Adicionar teste de integração para `fetchAtaListFn`, `fetchAtaDetailsFn`, `updateAtaStatusFn` e `deleteAtaFn`
- [ ] 5.5 [sisub] Mockar HTTP do Compras.gov para `searchArpFn`, `importArpItemsFn` e `syncArpBalanceFn`
- [ ] 5.6 [sisub] Adicionar testes para `createEmpenhoFn()` calcular `valor_total`, normalizar número e tratar duplicidade
- [ ] 5.7 [sisub] Adicionar teste para `anularEmpenhoFn()` alterar status sem hard delete
- [ ] 5.8 [sisub] Adicionar testes para `fetchUnitDashboardFn()` filtrar consumo >= 80% e priorizar item em cardápio futuro

## 6. Comensal, Fiscal e Onboarding

- [ ] 6.1 [sisub] Adicionar testes para `upsertForecastFn`, `deleteForecastFn` e `persistDefaultMessHallFn` usando userId da sessão
- [ ] 6.2 [sisub] Adicionar testes para `fetchMealForecastsFn` e `fetchUserDefaultMessHallFn` com dados isolados por usuário
- [ ] 6.3 [sisub] Adicionar testes para `insertPresenceFn` preservar código de duplicidade e exigir autenticação
- [ ] 6.4 [sisub] Adicionar testes para `deletePresenceFn`, `fetchPresencesFn` e `fetchForecastsFn`
- [ ] 6.5 [sisub] Adicionar testes para `addOtherPresenceFn` e `fetchOtherPresencesCountFn`
- [ ] 6.6 [sisub] Adicionar E2E de self check-in com rancho válido, forecast esperado e rancho inválido
- [ ] 6.7 [sisub] Adicionar testes para `syncUserNrOrdemFn`, `syncUserEmailFn` e `submitEvaluationFn` com usuário autenticado

## 7. Analytics, IA e Realtime

- [x] 7.1 [sisub] Adicionar testes unitários para `validateSql()` cobrindo SELECT/CTE, DML/DDL, whitelist, múltiplas instruções, tamanho e LIMIT
- [x] 7.2 [sisub] Extrair helpers testáveis de chart-spec parsing/normalização se necessário, mantendo comportamento do endpoint
- [ ] 7.3 [sisub] Adicionar testes para chart-spec válido, JSON com vírgula final, fence variante e chave de eixo/série ausente
- [x] 7.4 [sisub] Adicionar testes para module-chat tools: validação de UUID/inteiro/data, erro sanitizado e permissão por módulo/escopo
- [ ] 7.5 [sisub] Adicionar testes de endpoint para `/api/analytics/stream` sem sessão e payload inválido
- [ ] 7.6 [sisub] Adicionar testes de endpoint para `/api/module-chat/stream` sem sessão, sem permissão e scopeId errado
- [ ] 7.7 [sisub] Corrigir e manter testes realtime com tipagem Supabase válida e skip/fail explícito

## 8. E2E e CI/CD

- [ ] 8.1 [sisub] Reorganizar Playwright para separar `smoke`, `auth`, `critical` e `full`
- [ ] 8.2 [sisub] Adicionar E2E crítico de forecast do comensal com persistência visível na UI
- [ ] 8.3 [sisub] Adicionar E2E crítico de usuário sem permissão tentando acessar módulo restrito
- [ ] 8.4 [sisub] Adicionar E2E crítico de página de módulo permitido sem `pageerror`
- [x] 8.5 [ci] Reativar job E2E mínimo do `sisub` no workflow de deploy com Chromium, retries e artifacts
- [ ] 8.6 [ci] Adicionar workflow manual/agendado para E2E full e integrações externas lentas
- [x] 8.7 [ci] Garantir que `deploy-sisub` depende de checks, build e E2E mínimo bem-sucedidos

## 9. Validação Final

- [x] 9.1 [sisub] Executar `bun run test:unit` e corrigir falhas
- [ ] 9.2 [sisub] Executar `bun run test:integration` com `SISUB_INTEGRATION_REQUIRED=true` em ambiente staging/dev e corrigir falhas
- [ ] 9.3 [sisub] Executar `bun run test:e2e:ci` e validar artifacts em falha
- [ ] 9.4 [root] Executar `bunx turbo run build --filter=./apps/sisub` e corrigir falhas
- [ ] 9.5 [root] Executar `bun run check` e corrigir falhas de Biome/typecheck
