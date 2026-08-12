# IEFA Monorepo

Bun monorepo, Turborepo orchestration, Biome formatting/linting.

## Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `sisub` | React 19 + TanStack Start + Nitro SSR | Sistema de Subsistência — menus, receitas, planejamento, analytics |
| `portal` | React 19 + Vite + Nitro SSR + TanStack Router | Portal web — CMS (Sanity), drag-drop, markdown |
| `api` | Bun + Hono + OpenAPI (Scalar) | API pública — alimentos, preços, sync workers |
| `alpha` | Bun + Hono + LangChain/LangGraph | Projeto α — IA aplicada a contratações públicas da FAB (Lei 14.133/21) |
| `docs` | React 19 + TanStack Start + Nitro SSR + Fumadocs | Documentação interna |
| `sisub-mcp` | Bun + MCP SDK | MCP server — acesso AI aos dados sisub (stdio/HTTP) |

## Packages

| Package | Purpose |
|---------|---------|
| `database` | Tipos TS + migrations Supabase (schemas: sisub, iefa, journal) |

## Conventions

- **Server functions (TanStack Start)**: `createServerFn` with `.validator(z.object(...))` — NOT `.inputValidator()` (deprecated)
- **Server fn files**: `src/server/*.fn.ts`
- **Supabase server client**: `getSupabaseServerClient()` per-request inside `.handler()`, never singleton
- **Imports**: `@/*` → `src/*`
- **Route tree**: `routeTree.gen.ts` is auto-generated — run `bun dev` after new routes
- **Commits**: Conventional Commits via cz-git, scopes: portal, sisub, alpha, api, docs, deps, ci, scripts, root
- **Formatting**: `bun run format` (Biome). Pre-commit hook runs `format:check`

### Ferramentas de IA (chat dos módulos + servidor MCP)

Os dois expõem o mesmo domínio para modelos diferentes. Regra para não divergirem:

- **Listagem exposta a modelo mora em `@iefa/sisub-domain/agent`** — entrada (schema Zod), teto (`clampLimit`) e projeção definidos uma vez, consumidos pelo chat (`apps/sisub/src/lib/module-chat/tools/`) e pelo MCP (`apps/sisub-mcp/src/tools/`). Testes de contrato nos dois lados comparam o `inputSchema`/`parameters` com `toJsonSchema(...)` do schema compartilhado.
- **Toda listagem tem `limit` e devolve `total`** — sem o total o modelo lê 30 itens e conclui que o catálogo tem 30.
- **Resultado de tool tem orçamento** (`MAX_TOOL_RESULT_CHARS`, 60k caracteres em JSON compacto — freio contra patologia; quem dimensiona a resposta normal é o `limit` de cada listagem): ele volta INTEIRO no prompt do turno seguinte. Acima disso o provider responde 413 e a run morre sem mensagem. O teto é aplicado no `wrapTool` (chat) e no despacho (MCP); estourar vira erro de tool que o modelo lê e corrige.
- **Nada de query PostgREST/SQL escrita à mão numa tool** quando a operation existe — foi assim que `list_ingredients` ordenou por coluna inexistente e `list_kitchens` embutiu `units.name`.

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
  - NÃO auto-mergear: deixar o PR aberto para revisão. Mergear só quando solicitado.
  - Push na branch/main dispara deploys per-app via paths-filter.
  - **Exceção única: push direto na `main` só com pedido explícito do mantenedor, caso a caso.** Vale apenas para mudança de texto visível (copy, placeholder, label, comentário) ou remoção de código comprovadamente morto — nada que altere lógica, schema, permissão, dependência ou config de deploy. Mesmo aí: `bun run check` + `bun run test` verdes ANTES do push, e conferir o run do CI/CD depois. Um agente nunca decide sozinho por esse caminho; na dúvida, abre PR.
- **Revisão semântica é sob demanda, com `/code-review`** — rodar ANTES de pedir merge, e relatar os achados no PR. O Greptile não é mais o revisor: a cota open-source caiu para 100 créditos e foi esgotada; ele parou de comentar a partir de 2026-07-31 (PRs #149, #152, #153, #154 passaram sem revisão nenhuma). Ausência de comentário do bot não significa código limpo — confirme com `gh api repos/IEFA-FAB/IEFA/pulls/<n>/reviews` antes de tratar como revisado.
  - O que o CI cobre sozinho: biome, typecheck, `opengrep` com as regras do repo (gate bloqueante em ERROR), codeql, trivy, zizmor, gitleaks, `bun audit`, os testes de contrato e o gate de integração contra o banco real.
  - O que só a revisão sob demanda pega: race entre checagem e mutação, estado vazio que mente sobre falha, ordem de FK, snapshot inconsistente. Nenhum linter enxerga isso.
  - Padrão que causou bug vira **regra** em `.opengrep/rules/`, não só correção pontual — foi assim que o fallback de `kitchen:2` em ativo global e a operação de domínio que descarta `_ctx` viraram gate.
- **Mensagens de commit sempre em inglês** — subject E body — mesmo com código, comentários ou diff em português. Conventional Commits: `feat(sisub): add Faro observability`, não `adicionar`.
- **Rodar `bun run check` + testes antes de mergear** qualquer PR, e confirmar verde. Typecheck por-arquivo não pega tudo.
  - Testes: `bun run test` (turbo, todos os apps) ou `cd apps/sisub && bunx vitest run`. **Não** rodar `bunx vitest run` da raiz — o alias `@/` não resolve e gera ~32 falsos positivos.
  - Integração (`SISUB_RUN_INTEGRATION`/`SISUB_DATABASE_URL`) fica em skip por padrão — isso é esperado, não falha.

## DB

- Supabase with schemas: `sisub` (default), `iefa`, `journal`
- Env: `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY` (client), `SISUB_SUPABASE_SECRET_KEY` (server)

## Commands

```bash
bun run dev          # all apps (turbo)
bun run sisub:dev    # sisub only
bun run check        # biome check + typecheck
bun run commit       # format:check → lint → typecheck → cz interactive
```
