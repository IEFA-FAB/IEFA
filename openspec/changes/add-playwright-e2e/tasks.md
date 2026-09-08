## Status (auditado em 2026-09-08)

O gate E2E **nunca rodou no CI**. O job `e2e-sisub` foi escrito, ativado e desativado
no mesmo dia: `5c7433e1 feat(root): e2e out again` (2026-05-30) comentou o bloco inteiro
e removeu `e2e-sisub` de `deploy-sisub.needs`. Hoje ele é texto morto em
`.github/workflows/deploy.yml:481-520`.

As seções 1–5 estão comprovadamente feitas (arquivos existem no disco, scripts
registrados, `.gitignore` correto). A seção 6 estava marcada como feita mas descreve
um job inerte, com nome de secret errado e sem o cache que a task afirma existir —
foi reaberta com o texto corrigido. A seção 8 é o trabalho real de reativação: uma
tarefa por obstáculo comprovado, com o arquivo a mexer.

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
- [x] 3.2 [sisub] Criar global setup (`e2e/global-setup.ts`) — login **via UI** (não `signInWithPassword()` programático: o app lê a sessão de cookie no SSR, então o login precisa passar pelo `createBrowserClient`), salva storageState em `.auth/user.json`
- [x] 3.3 [sisub] Criar fixture customizado `e2e/fixtures/auth.ts` — exporta `test` com `authenticatedPage` que usa storageState
- [x] 3.4 [sisub] Documentar `E2E_TEST_USER_EMAIL` e `E2E_TEST_USER_PASSWORD` no `.env.schema` (linhas 172-184)

## 4. Testes E2E de Exemplo

- [x] 4.1 [sisub] Criar `e2e/tests/smoke.spec.ts` — página carrega com status 200, sem erros de console, HTML do SSR presente
- [x] 4.2 [sisub] Criar `e2e/tests/auth.spec.ts` — fluxo de login via UI (credenciais válidas → redirect, credenciais inválidas → erro)
- [x] 4.3 [sisub] Criar `e2e/tests/navigation.spec.ts` — acesso autenticado a módulo protegido, redirect sem auth, navegação SPA entre módulos

> Fora do escopo desta change, mas presentes no diretório e relevantes para a seção 8:
> `authz.spec.ts` (server fns respondem 401 sem sessão), `budget.spec.ts`,
> `storage.spec.ts` e `recipe-form.spec.ts` — adicionados depois por outras changes.
> Só os 4 primeiros entram no `test:e2e:ci`.

## 5. Scripts & Integração Monorepo

- [x] 5.1 [sisub] Adicionar scripts no `package.json`: `test:e2e`, `test:e2e:ci`, `test:e2e:full`, `test:e2e:ui` (usam `bunx playwright`, não `npx`)
- [x] 5.2 [root] Registrar task `test:e2e` no `turbo.json` com env vars: `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`
- [x] 5.3 [root] Adicionar script no root `package.json`: `"sisub:test:e2e": "turbo run test:e2e --filter=@iefa/sisub"`

## 6. Integração CI (GitHub Actions) — REABERTA

O bloco existe, mas comentado e com defeitos. Cada item abaixo foi reaberto com a
evidência do que está errado no texto atual do workflow.

- [ ] 6.1 [ci] Job `e2e-sisub` ATIVO em `.github/workflows/deploy.yml`. Hoje está 100% comentado (linhas 481-520) e `deploy-sisub.needs` é `[build-sisub]` — o E2E não gateia nada. Ver task 8.1/8.5.
- [ ] 6.2 [ci] Cache de browser com `actions/cache` em `~/.cache/ms-playwright`. O bloco comentado cacheia **apenas** `~/.bun/install/cache` (deploy.yml:492-497) — a task original foi marcada feita sem ter sido escrita. Ver task 8.3.
- [ ] 6.3 [ci] Secrets com o nome CERTO no job. O bloco usa `secrets.SISUB_E2E_TEST_USER_EMAIL` / `secrets.SISUB_E2E_TEST_USER_PASSWORD` (deploy.yml:508-509); os secrets que existem no repo são `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD`. Ver task 8.2.
- [x] 6.4 [ci] Upload de artifacts (`playwright-report/`, `test-results/`) via `actions/upload-artifact` com `if: always()` — escrito no bloco (deploy.yml:513-520); volta a valer assim que o job for descomentado.

## 7. Validação Final

- [x] 7.1 [root] Rodar `bun run check` — Biome lint/format + typecheck passam sem erros
- [x] 7.2 [root] Verificar que `.auth/`, `playwright-report/`, `test-results/` estão no `.gitignore`
- [ ] 7.3 [sisub] Rodar `bun run test:e2e` localmente com o `.env` preenchido e registrar quais das 7 specs passam. Sem esse baseline não dá para saber se uma falha no CI é do CI ou da suíte — nunca houve um run verde registrado.

## 8. Reativação do gate — o trabalho real

Uma tarefa por obstáculo comprovado. A nota do workflow cita dois ("webServer timeout /
test credentials setup"); a auditoria encontrou sete.

- [ ] 8.1 [ci] **Corrigir a origem das credenciais** — `.github/workflows/deploy.yml:508-509`.
  O job pede `secrets.SISUB_E2E_TEST_USER_EMAIL` / `SISUB_E2E_TEST_USER_PASSWORD`, que
  **não existem** no repositório; os que existem são `E2E_TEST_USER_EMAIL` e
  `E2E_TEST_USER_PASSWORD` (criados em 2026-05-30 19:43/19:44 — quatro horas antes do
  commit que comentou o job, às 21:47). Secret inexistente no GitHub Actions resolve para
  string vazia, não erro: `e2e/global-setup.ts:21` lança
  `"Missing E2E credentials"` e a suíte inteira morre no setup. Escolher um lado —
  renomear a referência no workflow ou criar os secrets com prefixo `SISUB_` — e deixar
  os dois nomes iguais nos três lugares: workflow, `turbo.json:65-75` e `.env.schema:179/184`.
  Este é o "test credentials setup" da nota, e é a causa mais provável da desativação.

- [ ] 8.2 [sisub] **Provar que o usuário E2E existe e tem PBAC suficiente** — não há seed.
  `e2e/global-setup.ts:35` faz login por UI e espera redirect para `/hub`;
  `e2e/helpers/supabase.ts:10-11` usa a anon key de PRODUÇÃO (o job passa
  `vars.VITE_SISUB_SUPABASE_URL`, que aponta para o projeto de prod). `navigation.spec.ts`
  exige `/diner`, `authz.spec.ts` colhe server fns de `/hub`, `/diner/profile` e
  `/diner/forecast`. `storage.spec.ts:13` documenta o pré-requisito de `storage` nível 3
  "concedida via seed" — seed que não existe em lugar nenhum do repo. Verificar via MCP/SQL
  se o usuário dos secrets está em `auth.users` e em `access_control.user_permissions` com
  os módulos necessários; se não estiver, criar migration/script de seed. Sem isso,
  reativar o job só troca falha de credencial por falha de permissão.

- [ ] 8.3 [ci] **Cachear o browser do Playwright** — `.github/workflows/deploy.yml:492-497`.
  O `actions/cache` do bloco cobre só `~/.bun/install/cache`; `bunx playwright install
  --with-deps chromium` (deploy.yml:503) rebaixa o Chromium e as libs de sistema em todo
  run, dentro de um `timeout-minutes: 20` que ainda precisa acomodar boot do dev server +
  login + 4 specs com `retries: 2` e `workers: 1`. Adicionar o cache de
  `~/.cache/ms-playwright` chaveado pela versão de `@playwright/test` do `bun.lock`.

- [ ] 8.4 [sisub] **Tornar diagnosticável a subida do webServer** — `apps/sisub/playwright.config.ts:64-69`.
  Em CI `reuseExistingServer` é `false`: o Playwright sobe `bunx --bun vite dev --port 3000`
  do zero e faz poll em `http://localhost:3000`. A primeira resposta exige o transform SSR
  completo da rota raiz do TanStack Start — num runner de 4 vCPU isso disputa com o resto e
  os 120s são apertados. Pior: sem `stdout: "pipe"`/`stderr: "pipe"`, um crash de boot
  (por exemplo `src/lib/env.server.ts:29` lançando por var faltando) chega ao log como
  timeout mudo, indistinguível de lentidão — foi assim que o "webServer timeout" da nota
  virou um sintoma sem causa. Fazer: `stdout: "pipe"`, subir o timeout para 180-240s em CI
  e avaliar `vite build` + `vite preview` no lugar do dev server (compilação uma vez, boot
  determinístico — o dev server compila sob demanda a cada rota nova do teste).

- [ ] 8.5 [ci] **Mover o gate para um workflow que dispare em PR** — `.github/workflows/deploy.yml:2-4`
  vs `.github/workflows/integration.yml:29-35`. `deploy.yml` roda **só em `push` na `main`**:
  mesmo descomentado, o E2E rodaria DEPOIS do merge, e a spec `e2e-ci-integration` exige
  "PR modifica `apps/sisub/**` ou `packages/sisub-domain/**` → job disparado". O
  `integration.yml` já tem o trigger de `pull_request`, o path filter certo, o guard de PR
  de fork (`head.repo.full_name == github.repository`, secrets não existem em fork) e o
  `concurrency` de grupo fixo contra runs concorrentes no banco compartilhado. Adicionar o
  job E2E ali e decidir se ele é bloqueante (`gate`) ou `continue-on-error` no primeiro mês.

- [ ] 8.6 [sisub] **Fechar a armadilha do `.env` no runner do Playwright** — `apps/sisub/playwright.config.ts:8-22`.
  O config lê e injeta o `.env` do disco à mão. É exatamente a armadilha que o repo já
  fechou nos outros dois runners (`--no-env-file` no `bun test`; `loadEnv` do vitest só
  entregando credencial sob `*_RUN_INTEGRATION=true`) — e o Playwright ficou de fora:
  na máquina do dev a suíte sobe com credencial de prod do disco, no CI sobe sem nada, e a
  diferença só aparece como falha pós-merge. Condicionar a leitura a `!process.env.CI` (ou
  a uma flag explícita `SISUB_RUN_E2E`) e falhar cedo, com mensagem, quando a credencial
  não vier de lugar nenhum — hoje o erro só aparece lá dentro do `global-setup`.

- [ ] 8.7 [sisub] **Decidir o destino das 3 specs órfãs** — `apps/sisub/package.json:22`.
  `test:e2e:ci` roda 4 das 7 specs (smoke, auth, navigation, authz). `budget.spec.ts`,
  `storage.spec.ts` e `recipe-form.spec.ts` não rodam em nenhum script de CI. As duas
  primeiras leem `E2E_BUDGET_UNIT_ID` / `E2E_STORAGE_KITCHEN_ID` com default `"1"`, e essas
  vars **não estão** na allowlist de `turbo.json:65-75` — com o envMode strict (default do
  Turbo 2, o repo não configura `envMode`) o turbo as remove antes de chegar no Playwright,
  então o default `"1"` é o único valor que elas terão. Ou entram no `test:e2e:ci` com as
  vars declaradas no `turbo.json`, ou saem do diretório: spec que não roda envelhece
  em silêncio e dá falsa cobertura na contagem desta change.
