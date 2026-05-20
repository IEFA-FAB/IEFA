## ADDED Requirements

### Requirement: Baseline de qualidade bloqueante
O pipeline do `sisub` MUST bloquear deploy quando `lint`, `typecheck`, `test:unit`, `test:integration` obrigatório, `build` ou E2E mínimo falharem.

#### Scenario: Lint falha bloqueia deploy
- **WHEN** `bunx turbo run lint --filter=./apps/sisub` retorna código diferente de zero
- **THEN** o workflow do `sisub` MUST falhar antes de construir ou publicar imagem

#### Scenario: Typecheck falha bloqueia deploy
- **WHEN** `bunx turbo run typecheck --filter=./apps/sisub` retorna erro TypeScript
- **THEN** o workflow do `sisub` MUST falhar antes de construir ou publicar imagem

#### Scenario: Build falha bloqueia deploy
- **WHEN** `bunx turbo run build --filter=./apps/sisub` falha
- **THEN** o workflow do `sisub` MUST NOT executar `deploy-sisub`

### Requirement: Suites de teste separadas
O `apps/sisub/package.json` MUST expor scripts separados para testes unitários, integração e E2E CI. O script agregado usado no CI MUST executar apenas suites que possuem contrato claro de skip/fail.

#### Scenario: Teste unitário roda sem rede
- **WHEN** `bun run test:unit` é executado sem env de Supabase
- **THEN** a suíte MUST rodar todos os testes unitários sem acessar rede ou banco

#### Scenario: Integração obrigatória falha sem env
- **WHEN** `bun run test:integration` é executado com `SISUB_INTEGRATION_REQUIRED=true` e env obrigatória ausente
- **THEN** a suíte MUST falhar explicitamente antes de marcar testes como passados

#### Scenario: Integração local pode ser pulada explicitamente
- **WHEN** `bun run test:integration` é executado localmente com `SISUB_INTEGRATION_REQUIRED=false`
- **THEN** testes dependentes de Supabase MUST ser marcados como skip explícito, não como pass silencioso

### Requirement: Turborepo conhece entradas e env de teste
O `turbo.json` MUST declarar tasks e env vars necessárias para `test:unit`, `test:integration` e `test:e2e`, garantindo cache correto e execução previsível.

#### Scenario: Alteração em package dependente dispara teste do sisub
- **WHEN** um PR altera `packages/pbac/**`, `packages/sisub-domain/**` ou `packages/database/**`
- **THEN** os checks do `sisub` MUST ser disparados pelo path filter ou dependency graph

#### Scenario: Env sensível não entra no cache
- **WHEN** tasks de integração usam secrets Supabase
- **THEN** o Turborepo MUST declarar as env vars necessárias sem persistir valores sensíveis em outputs versionados

### Requirement: Artifacts de falha
O CI MUST publicar artifacts úteis quando E2E ou integração falharem.

#### Scenario: Playwright falha com trace
- **WHEN** um teste Playwright falha no CI
- **THEN** `playwright-report/` e `test-results/` MUST ser enviados como artifacts do workflow

#### Scenario: Integração falha com contexto
- **WHEN** uma suíte de integração falha
- **THEN** o log MUST indicar qual fixture, usuário ou env obrigatória causou a falha sem expor secrets
