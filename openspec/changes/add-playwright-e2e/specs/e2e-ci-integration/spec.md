## ADDED Requirements

### Requirement: Job E2E no GitHub Actions
O workflow CI DEVE incluir um job dedicado para testes E2E do sisub.

#### Scenario: Job executa em PRs que tocam sisub ou sisub-domain
- **WHEN** um PR modifica arquivos em `apps/sisub/**` ou `packages/sisub-domain/**`
- **THEN** o job `e2e-sisub` DEVE ser disparado automaticamente

#### Scenario: Job não executa em PRs irrelevantes
- **WHEN** um PR modifica apenas arquivos em `apps/portal/**`, `apps/api/**` ou outros packages não relacionados
- **THEN** o job `e2e-sisub` DEVE ser pulado (path filter)

#### Scenario: Job executa após build com sucesso
- **WHEN** o job de build/check do sisub completa com sucesso
- **THEN** o job `e2e-sisub` DEVE iniciar (dependency: `needs: [check]`)

### Requirement: Instalação de browsers no CI
O CI DEVE instalar browsers Playwright de forma eficiente com caching.

#### Scenario: Browsers cacheados entre runs
- **WHEN** CI executa e browsers já estão no cache do GitHub Actions
- **THEN** a instalação DEVE usar o cache, reduzindo tempo de setup

#### Scenario: Apenas Chromium instalado
- **WHEN** CI instala browsers do Playwright
- **THEN** DEVE instalar apenas Chromium com dependências do sistema (`npx playwright install --with-deps chromium`)

### Requirement: Artifacts de teste no CI
O CI DEVE preservar artifacts de diagnóstico quando testes falham.

#### Scenario: Report HTML gerado
- **WHEN** testes E2E completam (sucesso ou falha)
- **THEN** o Playwright HTML report DEVE ser gerado em `playwright-report/`

#### Scenario: Traces salvos em falha
- **WHEN** um teste E2E falha no CI
- **THEN** o trace do Playwright DEVE ser salvo como artifact do GitHub Actions para debugging

#### Scenario: Artifacts acessíveis no PR
- **WHEN** testes falham em um PR
- **THEN** os artifacts (report + traces) DEVEM estar disponíveis para download na página do workflow run

### Requirement: Env vars no CI
O CI DEVE configurar todas as variáveis de ambiente necessárias para testes E2E.

#### Scenario: Secrets configurados
- **WHEN** job E2E executa no CI
- **THEN** `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`, `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY` DEVEM estar disponíveis via GitHub Secrets

#### Scenario: Env vars não vazam nos logs
- **WHEN** CI executa testes E2E
- **THEN** credenciais DEVEM estar mascaradas nos logs do workflow (GitHub Secrets masking)

### Requirement: Retries no CI
Testes E2E no CI DEVEM ter retries para lidar com flakiness de rede/infra.

#### Scenario: Retry automático em falha
- **WHEN** um teste falha no CI
- **THEN** Playwright DEVE re-executar o teste até 2 vezes antes de reportar falha final

#### Scenario: Sem retries em local
- **WHEN** testes rodam localmente (`bun run test:e2e`)
- **THEN** retries DEVEM estar desabilitados (0) para feedback rápido durante desenvolvimento
