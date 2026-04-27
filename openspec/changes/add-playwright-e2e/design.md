## Context

O sisub é um app React 19 + TanStack Start com SSR via Nitro, rodando em Vite (porta 3000). Atualmente não possui nenhuma infraestrutura de testes. O monorepo usa Bun como runtime e Turborepo para orchestração. O deploy é feito via GitHub Actions → Docker → Fly.io.

O app possui rotas autenticadas via Supabase Auth (`/_protected/*`), com módulos de diner, messhall e global. O fluxo de autenticação é crítico — a maioria dos testes E2E precisará de um usuário logado.

O `turbo.json` já define uma task `test` com env vars de Supabase, mas sem implementação. O CI (`deploy.yml`) já tem step de `check` (lint+typecheck+test) que pode ser estendido.

O domain layer do sisub foi extraído para `packages/sisub-domain` (`@iefa/sisub-domain`) — contém operações de negócio (menus, receitas, templates, kitchens), schemas Zod de validação, guards de permissão, e tipos compartilhados. O sisub importa este package para todas as operações de dados. Mudanças no sisub-domain podem quebrar fluxos E2E, então o CI path filter e o Turborepo dependency graph precisam refletir essa relação.

## Goals / Non-Goals

**Goals:**
- Infraestrutura E2E funcional em `apps/sisub` com Playwright
- Autenticação programática (sem depender de UI de login para cada teste)
- Testes rodando localmente (`bun run test:e2e`) e no CI (GitHub Actions)
- Integração com Turborepo pipeline
- Testes de exemplo cobrindo fluxos reais (auth, navegação, rotas protegidas)

**Non-Goals:**
- Testes unitários/componente (vitest — escopo separado)
- E2E para outros apps (portal, api, docs)
- Visual regression / screenshot comparison
- Mock do Supabase — testes rodam contra instância real
- Performance/load testing

## Decisions

### 1. Playwright sobre Cypress

**Escolha**: Playwright (`@playwright/test`)

**Alternativas consideradas**:
- **Cypress**: Mais popular historicamente, mas arquitetura in-process limita testes multi-tab e cross-origin. Mais lento em CI.
- **Vitest Browser Mode**: Ainda experimental para E2E completo, melhor para component testing.

**Rationale**: Playwright tem suporte nativo a múltiplos browsers, melhor performance em CI (headless por padrão), auto-waiting robusto, e `webServer` config que integra direto com o dev server Vite. API moderna com fixtures e test isolation.

### 2. Autenticação via Supabase API (não via UI)

**Escolha**: Login programático via `supabase.auth.signInWithPassword()` em um setup fixture global, salvando `storageState` para reutilização.

**Alternativas consideradas**:
- **Login via UI em cada teste**: Lento, frágil, duplica tempo de execução.
- **Mock de auth**: Diverge do comportamento real, bugs de integração passam.

**Rationale**: `storageState` do Playwright permite autenticar uma vez e reutilizar cookies/localStorage em todos os testes. Rápido, confiável, testa o auth real.

### 3. Estrutura de diretórios em `apps/sisub/e2e/`

**Escolha**: Diretório `e2e/` na raiz do app sisub (não no root do monorepo).

```
apps/sisub/
├── e2e/
│   ├── fixtures/          # Custom fixtures (auth, page objects)
│   ├── tests/             # Test files (.spec.ts)
│   │   ├── auth.spec.ts
│   │   └── navigation.spec.ts
│   └── helpers/           # Utilitários (login, seed data)
├── playwright.config.ts
└── package.json           # scripts: test:e2e, test:e2e:ui
```

**Rationale**: Co-localizar com o app mantém tudo junto. Cada app pode ter sua própria config Playwright. Se portal precisar no futuro, terá sua própria estrutura.

### 4. Dev server via `webServer` config

**Escolha**: Playwright `webServer` apontando para `bunx --bun vite dev --port 3000`.

**Alternativas consideradas**:
- **Build + preview**: Mais próximo de produção, mas muito mais lento para dev loop.
- **Server externo manual**: Mais flexível, mas requer coordenação manual.

**Rationale**: `webServer` do Playwright inicia o dev server automaticamente, espera ficar pronto, e mata no final. Dev loop rápido. CI pode usar `reuseExistingServer: false` para garantir server limpo.

### 5. Apenas Chromium por padrão

**Escolha**: Configurar apenas Chromium no `projects` do Playwright. Firefox/WebKit como opt-in.

**Rationale**: Sisub é app interno (militar/institucional). Chromium cobre 95%+ dos usuários. Reduz tempo de CI e tamanho de download de browsers. Multi-browser pode ser habilitado via env var (`ALL_BROWSERS=true`).

### 6. Integração CI via job separado

**Escolha**: Job dedicado `e2e` no GitHub Actions, rodando após build com sucesso.

**Rationale**: Separa feedback rápido (lint/type) de feedback lento (E2E). Permite paralelismo. Artifacts do Playwright (traces, reports) ficam isolados.

## Risks / Trade-offs

- **[Flaky tests com Supabase real]** → Mitigação: `storageState` para auth, `test.describe.serial` para fluxos dependentes, retries no CI (`retries: 2`).
- **[Dev server lento para iniciar no CI]** → Mitigação: `webServer.timeout` generoso (120s). Futuramente, considerar rodar contra build de produção no CI.
- **[Credenciais de teste hardcoded]** → Mitigação: Env vars (`E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`), nunca commitadas. `.env.schema` documenta.
- **[Browsers Playwright aumentam node_modules]** → Mitigação: Apenas Chromium por padrão. CI usa `npx playwright install --with-deps chromium` cacheado.
- **[Dados de teste poluem ambiente dev]** → Mitigação: Testes usam dados existentes (read-only) ou limpam após si mesmos. Usuário de teste dedicado.

## Open Questions

- Definir credenciais do usuário de teste — criar via Supabase dashboard ou seed script?
- CI: rodar E2E em todo PR ou apenas em PRs que tocam `apps/sisub/` e `packages/sisub-domain/`? (Recomendação: path filter incluindo ambos, como já existe no deploy.yml)
- Necessidade de seed data para testes ou testes devem funcionar com banco vazio + apenas auth?
