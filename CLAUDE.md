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

## Design Systems

**sisub** e **portal** têm design systems **incompatíveis** — nunca copiar padrões visuais entre os dois:

| App | Sistema | Radius | Referência |
|-----|---------|--------|------------|
| `sisub` | Flat design | `0.5rem` genérico; primitivo `<Card>` usa `rounded-xl` (0.75rem) canônico | `apps/sisub/docs/STYLE_CONTRACT.md` |
| `portal` | Pale Brutalism 2026 | **Zero radius** (`--radius: 0rem`) — nenhum `rounded-*` exceto pílulas explícitas | `apps/portal/STYLE_CONTRACT.md` |

### Proibições globais (todos os apps)

Valem para **qualquer** app do monorepo (sisub, portal, rumaer, sucont, alpha, docs, forms, api…), independente de ter STYLE_CONTRACT próprio.

- **Side-tab / side-stripe accent border — PROIBIDO.** Nunca usar `border-l`/`border-r` (nem `border-s`/`border-e`) acima de `1px` como acento colorido em cards, itens de lista, callouts ou alertas — inclusive o par `border-l-4 … rounded-r-*` (barra colorida de um lado só + cantos arredondados do outro). É o marcador nº 1 de AI slop segundo o `impeccable` ("Absolute bans"). Distinguir grupo/status/severidade por **outras formas**: borda completa (todos os lados), tint de fundo (`bg-*/5`…`/10`), ícone/número/badge à esquerda, ou nada. Bordas de `1px` uniformes e blockquotes editoriais (`border-l-2` em citação) não são atingidos — a proibição é sobre a *faixa colorida de acento* de um lado só.

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
