## ADDED Requirements

### Requirement: Playwright configuration file
O projeto sisub DEVE ter um arquivo `playwright.config.ts` na raiz de `apps/sisub/` com configuração funcional para testes E2E.

#### Scenario: Config carrega com sucesso
- **WHEN** Playwright é executado via `npx playwright test` em `apps/sisub/`
- **THEN** o config é parseado sem erros e os testes iniciam

#### Scenario: Dev server inicia automaticamente
- **WHEN** testes E2E são executados e nenhum server está rodando na porta 3000
- **THEN** Playwright DEVE iniciar o dev server Vite automaticamente via `webServer` config e aguardar até estar disponível (timeout máximo: 120s)

#### Scenario: Dev server reutilizado quando já ativo
- **WHEN** testes E2E são executados e o dev server já está rodando na porta 3000
- **THEN** Playwright DEVE reutilizar o server existente sem iniciar outro (`reuseExistingServer: true` em dev)

### Requirement: Estrutura de diretórios E2E
O diretório `apps/sisub/e2e/` DEVE conter subdiretórios organizados para fixtures, testes e helpers.

#### Scenario: Estrutura padrão existe
- **WHEN** o diretório `e2e/` é criado
- **THEN** DEVE conter: `e2e/fixtures/`, `e2e/tests/`, `e2e/helpers/`

#### Scenario: Testes são descobertos automaticamente
- **WHEN** Playwright executa com o config padrão
- **THEN** DEVE descobrir todos os arquivos `*.spec.ts` em `e2e/tests/` e subdiretórios

### Requirement: Scripts no package.json
O `package.json` de `apps/sisub` DEVE incluir scripts para execução de testes E2E.

#### Scenario: Execução headless
- **WHEN** usuário executa `bun run test:e2e`
- **THEN** Playwright roda todos os testes E2E em modo headless

#### Scenario: Execução com UI mode
- **WHEN** usuário executa `bun run test:e2e:ui`
- **THEN** Playwright abre o UI mode interativo para debugging visual de testes

### Requirement: Integração Turborepo
A task `test:e2e` DEVE estar registrada no `turbo.json` do monorepo.

#### Scenario: Turborepo reconhece task
- **WHEN** `bun run test:e2e` é executado na raiz do monorepo via turbo
- **THEN** Turborepo DEVE executar a task `test:e2e` apenas em `apps/sisub`

#### Scenario: Env vars passadas corretamente
- **WHEN** task `test:e2e` executa via Turborepo
- **THEN** as variáveis `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD` DEVEM estar disponíveis

### Requirement: Browser Chromium como padrão
A configuração DEVE usar apenas Chromium como browser padrão, com opção de habilitar multi-browser.

#### Scenario: Apenas Chromium em execução padrão
- **WHEN** testes são executados sem flags adicionais
- **THEN** apenas Chromium DEVE ser usado

#### Scenario: Multi-browser via env var
- **WHEN** a env var `ALL_BROWSERS=true` está definida
- **THEN** Firefox e WebKit DEVEM ser incluídos na execução
