## Why

O **sisub** não possui nenhuma infraestrutura de testes automatizados — nem unitários, nem E2E. Com a complexidade crescente dos módulos (diner, messhall, global, planning) e fluxos autenticados via Supabase, regressões são detectadas apenas em produção. Playwright fornece testes E2E confiáveis, cross-browser, com suporte nativo a SSR e SPAs — ideal para TanStack Start + Nitro.

**App afetada**: `sisub` | **Package relacionado**: `sisub-domain` (domain layer — business logic, schemas, guards)

## What Changes

- Instalar `@playwright/test` como devDependency em `apps/sisub`
- Criar configuração Playwright (`playwright.config.ts`) integrada ao dev server Vite (porta 3000)
- Criar estrutura de diretórios `apps/sisub/e2e/` para testes E2E
- Adicionar helpers de autenticação Supabase (login programático via API, reutilização de storage state)
- Criar testes E2E de exemplo cobrindo fluxos críticos (auth + navegação protegida)
- Adicionar scripts no `package.json` do sisub (`test:e2e`, `test:e2e:ui`)
- Registrar task `test:e2e` no `turbo.json` para integração com pipeline do monorepo
- Configuração CI-ready (GitHub Actions job dedicado, artifacts de relatório/traces)

## Capabilities

### New Capabilities

- `e2e-infrastructure`: Setup base do Playwright — config, scripts, estrutura de diretórios, integração com dev server e Turborepo
- `e2e-auth`: Helpers de autenticação para testes E2E — login programático via Supabase API, storage state reutilizável, fixtures de auth
- `e2e-test-suite`: Testes E2E de exemplo cobrindo fluxos críticos — navegação, login, acesso a rotas protegidas
- `e2e-ci-integration`: Integração com GitHub Actions — job dedicado, playwright report/traces como artifacts, configuração headless

### Modified Capabilities

_(nenhuma — não há capabilities existentes sendo modificadas)_

## Impact

- **Dependências**: `@playwright/test` + browsers Chromium (devDependency apenas)
- **package.json (sisub)**: Novos scripts `test:e2e`, `test:e2e:ui`
- **turbo.json (root)**: Nova task `test:e2e` no pipeline
- **GitHub Actions**: Job adicional no workflow de deploy (`deploy.yml`) — roda pós-build, pré-deploy
- **Env vars**: Testes precisam de `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`, credenciais de usuário de teste (novo: `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`)
- **Supabase**: Necessário usuário de teste dedicado no ambiente de staging/dev
- **sisub-domain**: Package de domain layer (`@iefa/sisub-domain`) é dependência direta do sisub — mudanças nele afetam testes E2E (Turborepo dependency graph). CI path filter deve incluir `packages/sisub-domain/**`

## Não-objetivos

- Testes unitários ou de componente (escopo futuro, vitest)
- Testes E2E para outros apps (portal, api, docs)
- Visual regression testing (screenshot comparison)
- Testes de performance/load testing
- Mock completo do Supabase — testes rodam contra instância real (dev/staging)
