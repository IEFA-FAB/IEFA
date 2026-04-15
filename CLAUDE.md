# IEFA Monorepo

Bun monorepo, Turborepo orchestration, Biome formatting/linting.

## Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `sisub` | React 19 + TanStack Start + Nitro SSR | Sistema de Subsistência — menus, receitas, planejamento, analytics |
| `portal` | React 19 + Vite + Nitro SSR + TanStack Router | Portal web — CMS (Sanity), drag-drop, markdown |
| `api` | Bun + Hono + OpenAPI (Scalar) | API pública — alimentos, preços, sync workers |
| `ai` | Bun + Hono + LangChain/LangGraph | Serviço AI — ingestão de docs, orchestração LLM |
| `docs` | React 19 + TanStack Start + Nitro SSR + Fumadocs | Documentação interna |
| `sisub-mcp` | Bun + MCP SDK | MCP server — acesso AI aos dados sisub (stdio/HTTP) |

## Packages

| Package | Purpose |
|---------|---------|
| `database` | Tipos TS + migrations Supabase (schemas: sisub, iefa, journal) |

## Conventions

- **Server functions (TanStack Start)**: `createServerFn` with `.inputValidator(z.object(...))` — NOT `.validator()`
- **Server fn files**: `src/server/*.fn.ts`
- **Supabase server client**: `getSupabaseServerClient()` per-request inside `.handler()`, never singleton
- **Imports**: `@/*` → `src/*`
- **Route tree**: `routeTree.gen.ts` is auto-generated — run `bun dev` after new routes
- **Commits**: Conventional Commits via cz-git, scopes: portal, sisub, ai, api, docs, deps, ci, scripts, root
- **Formatting**: `bun run format` (Biome). Pre-commit hook runs `format:check`

## Design Systems

**sisub** e **portal** têm design systems **incompatíveis** — nunca copiar padrões visuais entre os dois:

| App | Sistema | Radius | Referência |
|-----|---------|--------|------------|
| `sisub` | Flat design | `0.5rem` genérico; primitivo `<Card>` usa `rounded-xl` (0.75rem) canônico | `apps/sisub/docs/STYLE_CONTRACT.md` |
| `portal` | Pale Brutalism 2026 | **Zero radius** (`--radius: 0rem`) — nenhum `rounded-*` exceto pílulas explícitas | `apps/portal/STYLE_CONTRACT.md` |

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
