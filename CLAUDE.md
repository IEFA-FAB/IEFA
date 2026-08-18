# IEFA Monorepo

Bun monorepo, Turborepo orchestration, Biome formatting/linting.

## Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `sisub` | React 19 + TanStack Start + Nitro SSR | Sistema de Subsistência — menus, receitas, planejamento, analytics |
| `portal` | React 19 + Vite + Nitro SSR + TanStack Router | Portal web — CMS (Sanity), drag-drop, markdown, journal |
| `sucont` | React 19 + TanStack Start + Nitro SSR | Hub SUCONT-4 — acompanhamento contábil |
| `rumaer` | React 19 + TanStack Start + Nitro SSR | Uniformes da FAB (RUMAER) |
| `forms` | React 19 + TanStack Start + Nitro SSR | Questionários e pesquisas internas; multi-tenant (tenant `cinco-s` = deploy `5s`) |
| `assignment-selection` | React 19 + TanStack Start + Nitro SSR | Escolha de vagas / CPAINT — telão + controlador |
| `api` | Bun + Hono + OpenAPI (Scalar) | API pública — alimentos, preços, sync workers |
| `alpha` | Bun + Hono + LangChain/LangGraph | Projeto α — IA aplicada a contratações públicas da FAB (Lei 14.133/21) |
| `docs` | React 19 + TanStack Start + Nitro SSR + Fumadocs | Documentação interna |
| `sisub-mcp` | Bun + MCP SDK | MCP server — acesso AI aos dados sisub (stdio/HTTP) |

## Packages

| Package | Purpose |
|---------|---------|
| `database` | Tipos TS + migrations Supabase (schemas por domínio) |
| `sisub-domain` | Operações de domínio do sisub (schemas, guards, operations, contrato de tools de IA) |
| `supabase-kit` | Clients Supabase: service-role, browser e SSR (subpath `/start`), com os deadlines de fetch |
| `auth-kit` | Ações de auth, tradução de erro do GoTrue e trava de login (subpath `/react`) |
| `pbac` | Engine de autorização por política (módulo + nível + escopo) |
| `legal-kit` | Documentos legais (termos, privacidade, cookies) + registro de ciência; subpath `/react` com o renderizador compartilhado |
| `ai-provider` | Adapter de modelo: Bedrock no primário, reserva com API key, tetos de consumo |
| `agent-web` | Camada agent-ready dos apps web (negociação de Markdown, llms.txt, descoberta) |
| `compras-api` | Client gerado da API do Compras.gov |
| `hono-client` | Client RPC tipado do `apps/api` |
| `alpha-client` | Client do `apps/alpha` |
| `tsconfig` | Bases de tsconfig (`base`, `library`, `react-app`, `bun-service`) |

## Conventions

- **Server functions (TanStack Start)**: `createServerFn` with `.validator(z.object(...))` — NOT `.inputValidator()` (deprecated)
- **Server fn files**: `src/server/*.fn.ts`
- **Supabase client**: sempre via `@iefa/supabase-kit` (`createServiceRoleClient` / `createAppBrowserClient` / `createSsrAuthClient`), chamado per-request dentro do `.handler()`, nunca singleton. Nunca instanciar `createClient` direto num app — foi assim que os deadlines de fetch que seguram o 502 no ALB existiram em 1 de 6 apps.
- **Auth**: ações e mensagens de erro via `@iefa/auth-kit`; a trava de login é `useLoginRateLimiter` de `@iefa/auth-kit/react`.
- **tsconfig**: estender `@iefa/tsconfig/{react-app,bun-service,library}.json`; o app só declara `paths`.
- **Imports**: `@/*` → `src/*` (o `sucont` também aceita `#/*`, legado)
- **Deploy**: `Dockerfile`, `docker-bake.hcl` e `.github/paths-filter.yml` são GERADOS de `apps.manifest.json` (`bun run generate:deploy`). App ou package novo entra no manifesto/package.json, nunca editando os três à mão — o CI falha em drift (`bun run check:deploy`).
- **Route tree**: `routeTree.gen.ts` is auto-generated — run `bun dev` after new routes
- **Commits**: Conventional Commits via cz-git, scopes: portal, sisub, alpha, api, docs, deps, ci, scripts, root
- **Formatting**: `bun run format` (Biome). Pre-commit hook runs `format:check`

### Ferramentas de IA (chat dos módulos + servidor MCP)

Os dois expõem o mesmo domínio para modelos diferentes. Regra para não divergirem:

- **Listagem exposta a modelo mora em `@iefa/sisub-domain/agent`** — entrada (schema Zod), teto (`clampLimit`) e projeção definidos uma vez, consumidos pelo chat (`apps/sisub/src/lib/module-chat/tools/`) e pelo MCP (`apps/sisub-mcp/src/tools/`). Testes de contrato nos dois lados comparam o `inputSchema`/`parameters` com `toJsonSchema(...)` do schema compartilhado.
- **Toda listagem tem `limit` e devolve `total`** — sem o total o modelo lê 30 itens e conclui que o catálogo tem 30.
- **Resultado de tool tem orçamento** (`MAX_TOOL_RESULT_CHARS`, 60k caracteres em JSON compacto — freio contra patologia; quem dimensiona a resposta normal é o `limit` de cada listagem): ele volta INTEIRO no prompt do turno seguinte. Acima disso o provider responde 413 e a run morre sem mensagem. O teto é aplicado no `wrapTool` (chat) e no despacho (MCP); estourar vira erro de tool que o modelo lê e corrige.
- **Parâmetro opcional exposto a modelo é `.nullish()`, nunca `.optional()` puro** — modelo não omite campo, ele manda `null`. Com `.optional()` o engine rejeita a chamada, o modelo tenta de novo com sintaxe quebrada e o provider mata a run com `tool_use_failed`, sem mensagem para o usuário. `null` que o schema não previu vira ausência no `wrapTool`/despacho MCP (`dropUnexpectedNulls`). Guarda: `model-args.test.ts` nos dois lados varre todas as tools.
- **Nada de query PostgREST/SQL escrita à mão numa tool** quando a operation existe — foi assim que `list_ingredients` ordenou por coluna inexistente e `list_kitchens` embutiu `units.name`.

### Providers de IA — Bedrock primeiro

Referência completa: **`AI-PROVIDERS.md`** na raiz (mapa dos consumidores, semântica da reserva, tetos de consumo, dívida de sucont/alpha). O essencial:

- **Todo consumidor de modelo usa AWS Bedrock no primário** (keyless, pela task role do ECS). Provider com API key existe só como reserva, no prefixo `<PREFIX>_FALLBACK_AI_*`.
- **Adapter sempre por `createAdapterFromEnv("<PREFIX>", { rateLimitKey: userId })`** — ele monta primário + reserva + tetos a partir do env. Nunca instanciar provider direto num app.
- **A reserva só troca antes do primeiro conteúdo e só em falha transitória** (429/5xx/throttling/timeout). Erro de schema, credencial ou tool malformada propaga: trocar de provider repetiria a falha.
- **Endpoint que abre SSE chama `enforceRequestRateLimit` ANTES do stream** e traduz `RateLimitError` em 429 — depois que o SSE começa não há mais status HTTP, o erro vira conexão cortada sem mensagem.
- **Fluxo de IA nunca quebra o boot**: sem as vars, a tela fica "Em breve" e o endpoint responde 503 (`capabilities.server.ts`).

### LGPD / documentos legais

Referência completa: **`LGPD.md`** na raiz (cobertura por app, o que a política
declara, pendências). O essencial:

- **Canal único de exercício de direitos é `iefa@fab.mil.br`, resposta em 7 dias, exclusão MANUAL** — não existe autoexclusão em app nenhum. Os valores são constantes em `@iefa/legal-kit` (`contact.ts`) e `contact.test.ts` falha se o texto publicado divergir delas.
- **App que trata dado pessoal tem as três rotas legais e link no rodapé** — termos, privacidade e cookies, servidos de `iefa.legal_documents` via `@iefa/legal-kit`. Serviço sem UI expõe `GET /legal`.
- **Versão nova de documento é linha NOVA, nunca `UPDATE`** — `user_legal_acceptances.document_id` é FK `ON DELETE RESTRICT`; reescrever a versão antiga destruiria a prova de ciência dela.
- **O aviso de ciência não bloqueia navegação** — a base legal é art. 7º, III / art. 23 (execução de política pública), não consentimento. Modal obrigatório pediria uma escolha que o usuário não tem.
- **Cookie novo ou destinatário novo de dado entra no inventário da Política de Cookies ANTES de entrar em uso** — foi assim que o Grafana Faro rodou por meses sob um texto que afirmava não haver rastreamento nem terceiros.

## Design Systems

**sisub** e **portal** têm design systems **incompatíveis** — nunca copiar padrões visuais entre os dois:

| App | Sistema | Radius | Referência |
|-----|---------|--------|------------|
| `sisub` | Flat design | `0.5rem` genérico; primitivo `<Card>` usa `rounded-xl` (0.75rem) canônico | `apps/sisub/docs/STYLE_CONTRACT.md` |
| `portal` | Pale Brutalism 2026 | **Zero radius** (`--radius: 0rem`) — nenhum `rounded-*` exceto pílulas explícitas | `apps/portal/STYLE_CONTRACT.md` |

### Proibições globais (todos os apps)

Valem para **qualquer** app do monorepo (sisub, portal, rumaer, sucont, alpha, docs, forms, api…), independente de ter STYLE_CONTRACT próprio.

- **Side-tab / side-stripe accent border — PROIBIDO.** Nunca usar `border-l`/`border-r` (nem `border-s`/`border-e`) acima de `1px` como acento colorido em cards, itens de lista, callouts ou alertas — inclusive o par `border-l-4 … rounded-r-*` (barra colorida de um lado só + cantos arredondados do outro). É o marcador nº 1 de AI slop segundo o `impeccable` ("Absolute bans"). Distinguir grupo/status/severidade por **outras formas**: borda completa (todos os lados), tint de fundo (`bg-*/5`…`/10`), ícone/número/badge à esquerda, ou nada. Bordas de `1px` uniformes e blockquotes editoriais (`border-l-2` em citação) não são atingidos — a proibição é sobre a *faixa colorida de acento* de um lado só.

## Workflow & Boas Práticas

Regras de contribuição para **todos** os devs e agentes de IA no repo.

- **Todo trabalho vai por Pull Request** — nunca commitar/mergear direto na `main`.
  - Criar feature branch → push → `gh pr create --base main`.
  - NÃO auto-mergear por conta própria: deixar o PR aberto para revisão.
  - **Pedido explícito do mantenedor para "fazer o PR e o merge" AUTORIZA o merge, inclusive o `--admin`.** A proteção da `main` exige uma revisão aprovada e o GitHub não deixa o autor aprovar o próprio PR; como o `gh` está autenticado na conta do mantenedor, `gh pr merge <n> --squash --delete-branch --admin` é o caminho normal nesse caso, não uma exceção a negociar. Auto-merge está desabilitado no repositório, então `--auto` não serve. A restrição de revisão existe para terceiros. Continua valendo: só mergear quando pedido, e com CI verde + `/code-review` relatado no PR.
  - Push na branch/main dispara deploys per-app via paths-filter.
  - **Exceção única: push direto na `main` só com pedido explícito do mantenedor, caso a caso.** Vale apenas para mudança de texto visível (copy, placeholder, label, comentário) ou remoção de código comprovadamente morto — nada que altere lógica, schema, permissão, dependência ou config de deploy. Mesmo aí: `bun run check` + `bun run test` verdes ANTES do push, e conferir o run do CI/CD depois. Um agente nunca decide sozinho por esse caminho; na dúvida, abre PR.
- **Revisão semântica é sob demanda, com `/code-review`** — rodar ANTES de pedir merge, e relatar os achados no PR. O Greptile não é mais o revisor: a cota open-source caiu para 100 créditos e foi esgotada; ele parou de comentar a partir de 2026-07-31 (PRs #149, #152, #153, #154 passaram sem revisão nenhuma). Ausência de comentário do bot não significa código limpo — confirme com `gh api repos/IEFA-FAB/IEFA/pulls/<n>/reviews` antes de tratar como revisado.
  - O que o CI cobre sozinho: biome, typecheck, `opengrep` com as regras do repo (gate bloqueante em ERROR), codeql, trivy, zizmor, gitleaks, `bun audit`, os testes de contrato e o gate de integração contra o banco real.
  - O que só a revisão sob demanda pega: race entre checagem e mutação, estado vazio que mente sobre falha, ordem de FK, snapshot inconsistente. Nenhum linter enxerga isso.
  - Padrão que causou bug vira **regra** em `.opengrep/rules/`, não só correção pontual — foi assim que o fallback de `kitchen:2` em ativo global e a operação de domínio que descarta `_ctx` viraram gate.
- **Mensagens de commit sempre em inglês** — subject E body — mesmo com código, comentários ou diff em português. Conventional Commits: `feat(sisub): add Faro observability`, não `adicionar`.
- **Rodar `bun run check` + testes antes de mergear** qualquer PR, e confirmar verde. Typecheck por-arquivo não pega tudo.
  - Testes: `bun run test` (turbo, todos os apps) ou `cd apps/sisub && bunx vitest run`. **Não** rodar `bunx vitest run` da raiz — o alias `@/` não resolve e gera ~32 falsos positivos.
  - **`apps/<app>/.env` faz a suíte local mentir.** O Vite carrega o arquivo automaticamente, então um teste que importa `@/server/*` (e com isso `env.server.ts`, que valida credencial na carga do módulo) passa na máquina de quem tem `.env` e quebra no CI, que não tem. Antes de confiar num teste novo que toque a camada server, rodar sem o arquivo. A regra melhor é não importar `@/server/*` de teste unitário: extrair a função pura para `src/lib/` e testar ali.
  - Integração (`SISUB_RUN_INTEGRATION`/`SISUB_DATABASE_URL`) fica em skip por padrão — isso é esperado, não falha.

## DB

- Supabase. `sisub` is the default schema; the domain was split by area into `core`,
  `kitchen`, `inventory`, `procurement`, `finance`, `access_control`,
  `nutrition_reference`, `siafi_integration` and `compras_gov_integration`. Cross-app
  schemas: `iefa` (apps, favoritos, documentos legais), `journal`, `forms`, `rumaer`,
  `sucont`, `assignment_selection`, `gs`
- Env: `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY` (client), `SISUB_SUPABASE_SECRET_KEY` (server)

## Commands

```bash
bun run dev          # all apps (turbo)
bun run sisub:dev    # sisub only
bun run check        # biome check + typecheck
bun run commit       # format:check → lint → typecheck → cz interactive
```
