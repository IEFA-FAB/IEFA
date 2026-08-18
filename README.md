# IEFA

Monorepo of the IEFA platform — the web apps, services and shared packages used by
the Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA).

**Runtime** [Bun](https://bun.sh) · **Orchestration** [Turborepo](https://turbo.build) ·
**Frontend** [TanStack Start](https://tanstack.com/start) + React 19 ·
**Database** [Supabase](https://supabase.com) (Postgres) ·
**Lint/Format** [Biome](https://biomejs.dev) ·
**Deploy** AWS ECS Fargate behind one shared ALB, via Terraform (`infra/`) and GitHub OIDC

## Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `apps/sisub` | TanStack Start + Nitro SSR | Sistema de Subsistência — cardápios, receitas, planejamento, estoque, orçamento, analytics |
| `apps/portal` | Vite + Nitro SSR + TanStack Router | Portal institucional — CMS (Sanity), journal, console do projeto α |
| `apps/sucont` | TanStack Start + Nitro SSR | Hub SUCONT-4 — acompanhamento contábil |
| `apps/rumaer` | TanStack Start + Nitro SSR | Uniformes da FAB (RUMAER) |
| `apps/forms` | TanStack Start + Nitro SSR | Questionários e pesquisas internas; multi-tenant (tenant `cinco-s` = deploy `5s`) |
| `apps/assignment-selection` | TanStack Start + Nitro SSR | Escolha de vagas / CPAINT — telão + controlador |
| `apps/api` | Bun + Hono + OpenAPI (Scalar) | API pública — alimentos, preços, sync workers |
| `apps/alpha` | Bun + Hono + LangChain/LangGraph | Projeto α — IA aplicada a contratações públicas (Lei 14.133/21) |
| `apps/docs` | TanStack Start + Fumadocs | Documentação interna |
| `apps/sisub-mcp` | Bun + MCP SDK | MCP server — acesso de modelos aos dados do sisub (stdio/HTTP) |

## Packages

| Package | Purpose |
|---------|---------|
| `@iefa/database` | Tipos TS + migrations Supabase (schemas por domínio) |
| `@iefa/sisub-domain` | Operações de domínio do sisub (schemas, guards, operations, contrato de tools de IA) |
| `@iefa/supabase-kit` | Clients Supabase: service-role, browser e SSR (subpath `/start`) |
| `@iefa/auth-kit` | Ações de auth, tradução de erro do GoTrue, trava de login (subpath `/react`) |
| `@iefa/pbac` | Engine de autorização por política (módulo + nível + escopo) |
| `@iefa/legal-kit` | Documentos legais + registro de ciência (subpath `/react`) |
| `@iefa/ai-provider` | Adapter de modelo: Bedrock no primário, reserva com API key, tetos de consumo |
| `@iefa/agent-web` | Camada agent-ready dos apps web (Markdown negotiation, llms.txt, descoberta) |
| `@iefa/compras-api` | Client gerado da API do Compras.gov |
| `@iefa/hono-client` | Client RPC tipado do `apps/api` |
| `@iefa/alpha-client` | Client do `apps/alpha` |
| `@iefa/tsconfig` | Bases de tsconfig (`base`, `library`, `react-app`, `bun-service`) |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) — the repo pins `bun@1.3.14` via `packageManager`
- [Docker](https://www.docker.com) — optional, only for building the deploy images

### Install

```bash
bun install
```

### Environment

Each app reads its own prefixed variables and documents them in a committed
`.env.schema` — sisub, portal, sucont, rumaer, forms, assignment-selection, api and alpha
all have one. That file is documentation, not a validator: read it, then write your own
`.env` next to it. `apps/portal`, `apps/api` and `apps/alpha` also ship a fillable
`.env.example`:

```bash
cp apps/portal/.env.example apps/portal/.env
cp apps/api/.env.example    apps/api/.env
cp apps/alpha/.env.example  apps/alpha/.env
```

Only `apps/alpha` parses its environment through a schema at boot (`src/env.ts`, zod).
Elsewhere a missing variable surfaces where it's first used, so check the `.env.schema`
before assuming a bug.

AI variables are a deliberate exception everywhere: without them the screen renders
"Em breve" and the endpoint answers 503, never breaking the boot (see
[AI-PROVIDERS.md](AI-PROVIDERS.md)).

### Development

```bash
bun run dev                        # everything, through turbo
bun run sisub:dev                  # http://localhost:3000
bun run portal:dev                 # http://localhost:3000
bun run rumaer:dev                 # http://localhost:3003
bun run forms:dev                  # http://localhost:3001
bun run 5s:dev                     # forms with the cinco-s tenant
bun run assignment-selection:dev   # http://localhost:3005
bun run docs:dev
bun run api:dev
bun run sisub-mcp:dev

bun --cwd apps/sucont dev          # no root shortcut yet
bun --cwd apps/alpha dev
```

Several apps default to port 3000 — run them one at a time, or pass `--port`.

> `bun run dev` builds every workspace in parallel and can exhaust memory on a smaller
> machine. When it does: `bunx turbo dev --concurrency=2`.

### Checks

```bash
bun run check         # biome check + typecheck across the monorepo
bun run test          # every workspace's tests, through turbo
bun run format        # biome format --write
```

Run tests from the repo root or from an app directory — **not** `bunx vitest run` at the
root, where the `@/` alias doesn't resolve and produces dozens of false failures.

Integration tests need a real database and stay skipped without it; that is expected, not
a failure:

```bash
SISUB_RUN_INTEGRATION=true bun --cwd apps/sisub test:integration   # needs SISUB_DATABASE_URL
```

### Build

```bash
bun run build
```

## Deploy

`Dockerfile`, `docker-bake.hcl` and `.github/paths-filter.yml` are **generated** from
`apps.manifest.json`:

```bash
bun run generate:deploy   # rewrite the three artifacts
bun run check:deploy      # what CI runs; fails on drift
```

A new app or package goes into the manifest (and its `package.json`), never into the three
files by hand. Terraform stacks, the shared ALB and the OIDC deploy role are documented in
[infra/README.md](infra/README.md).

## Documentation

| Document | What it covers |
|----------|----------------|
| [CLAUDE.md](CLAUDE.md) | Conventions of the repo — server functions, design systems, workflow. Read first |
| [AI-PROVIDERS.md](AI-PROVIDERS.md) | Every model consumer, the Bedrock-first rule, reserve semantics, consumption caps |
| [LGPD.md](LGPD.md) | Personal-data coverage per app, legal documents, rights channel |
| [PRODUCT.md](PRODUCT.md) | Who the suite serves and the design direction of each surface |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch/PR workflow, commit format, local security checks |
| [infra/README.md](infra/README.md) | AWS layout, Terraform stacks, deploy pipeline |
| `apps/sisub/docs/STYLE_CONTRACT.md` | sisub visual contract (flat design) |
| `apps/portal/STYLE_CONTRACT.md` | portal visual contract (Pale Brutalism 2026) |
| `apps/rumaer/STYLE_CONTRACT.md` | rumaer visual contract |

## Contributing

All work goes through a pull request against `main` — see [CONTRIBUTING.md](CONTRIBUTING.md)
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
