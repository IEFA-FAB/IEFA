## 1. Setup & Dependências

- [x] 1.1 [sisub] Instalar `@playwright/test` como devDependency em `apps/sisub` (`bun add -D @playwright/test`)
- [x] 1.2 [sisub] Instalar browsers Chromium (`npx playwright install chromium`)
- [x] 1.3 [sisub] Criar estrutura de diretórios: `e2e/fixtures/`, `e2e/tests/`, `e2e/helpers/`
- [x] 1.4 [sisub] Adicionar `.auth/` ao `.gitignore` de `apps/sisub`
- [x] 1.5 [sisub] Adicionar `playwright-report/`, `test-results/` ao `.gitignore`

## 2. Configuração Playwright

- [x] 2.1 [sisub] Criar `playwright.config.ts` com: baseURL `http://localhost:3000`, webServer apontando para dev server Vite, testDir `e2e/tests`, projeto Chromium, storageState global setup
- [x] 2.2 [sisub] Configurar `webServer` com comando `bunx --bun vite dev --port 3000`, `reuseExistingServer: !process.env.CI`, timeout 120s
- [x] 2.3 [sisub] Configurar `retries: process.env.CI ? 2 : 0` para retry apenas no CI
- [x] 2.4 [sisub] Configurar multi-browser condicional via `ALL_BROWSERS` env var (Chromium padrão, Firefox+WebKit opt-in)

## 3. Autenticação E2E

- [x] 3.1 [sisub] Criar `e2e/helpers/supabase.ts` — cliente Supabase leve para auth programático (usa env vars `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`)
- [x] 3.2 [sisub] Criar global setup (`e2e/global-setup.ts`) — login via `signInWithPassword()`, salva storageState em `.auth/user.json`
- [x] 3.3 [sisub] Criar fixture customizado `e2e/fixtures/auth.ts` — exporta `test` com `authenticatedPage` que usa storageState
- [x] 3.4 [sisub] Documentar `E2E_TEST_USER_EMAIL` e `E2E_TEST_USER_PASSWORD` no `.env.schema`

## 4. Testes E2E de Exemplo

- [x] 4.1 [sisub] Criar `e2e/tests/smoke.spec.ts` — página carrega com status 200, sem erros de console, HTML do SSR presente
- [x] 4.2 [sisub] Criar `e2e/tests/auth.spec.ts` — fluxo de login via UI (credenciais válidas → redirect, credenciais inválidas → erro)
- [x] 4.3 [sisub] Criar `e2e/tests/navigation.spec.ts` — acesso autenticado a módulo protegido, redirect sem auth, navegação SPA entre módulos

## 5. Scripts & Integração Monorepo

- [x] 5.1 [sisub] Adicionar scripts no `package.json`: `"test:e2e": "npx playwright test"`, `"test:e2e:ui": "npx playwright test --ui"`
- [x] 5.2 [root] Registrar task `test:e2e` no `turbo.json` com env vars: `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`. Garantir que Turborepo reconhece `@iefa/sisub-domain` como dependência upstream (dependency graph automático via workspace)
- [x] 5.3 [root] Adicionar script no root `package.json`: `"sisub:test:e2e": "turbo run test:e2e --filter=@iefa/sisub"`

## 6. Integração CI (GitHub Actions)

- [x] 6.1 [ci] Adicionar job `e2e-sisub` no `deploy.yml` com path filter `apps/sisub/**` + `packages/sisub-domain/**`, `needs: [check]`
- [x] 6.2 [ci] Configurar instalação de Chromium com cache do GitHub Actions (`actions/cache` para `~/.cache/ms-playwright`)
- [x] 6.3 [ci] Configurar secrets no job: `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`, `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`
- [x] 6.4 [ci] Configurar upload de artifacts: `playwright-report/` e `test-results/` via `actions/upload-artifact` (on failure)
- [ ] 6.5 [ci] Testar pipeline completo: push branch → CI roda E2E → artifacts disponíveis

## 7. Validação Final

- [ ] 7.1 [sisub] Rodar `bun run test:e2e` localmente — todos os testes passam
- [ ] 7.2 [sisub] Rodar `bun run test:e2e:ui` — UI mode abre corretamente
- [x] 7.3 [root] Rodar `bun run check` — Biome lint/format + typecheck passam sem erros (erro pré-existente em roadmap.tsx não relacionado ao E2E)
- [x] 7.4 [root] Verificar que `.auth/`, `playwright-report/`, `test-results/` estão no `.gitignore`
