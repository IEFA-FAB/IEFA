# IEFA Monorepo

<!-- Fonte única das instruções para agentes (Claude Code, Codex e afins). O CLAUDE.md importa
este arquivo e acrescenta só o que é do Claude Code. Regra de corte para cada linha: "se ela sair,
o agente erra?" Se não, ela não entra. Detalhe por área mora em .claude/rules/ (carregado só quando
o agente abre arquivo daquela área) e nos documentos de referência da raiz. -->

Bun monorepo, Turborepo, Biome. Repositório público.

## Apps

| App | Stack | Propósito |
|-----|-------|-----------|
| `sisub` | TanStack Start + Nitro | Sistema de Subsistência: cardápios, receitas, estoque, orçamento, analytics |
| `portal` | Vite + Nitro + TanStack Router | Portal web: CMS (Sanity), journal |
| `contrate` | TanStack Start + Nitro | Front do Projeto α (contratações), extraído do portal |
| `sucont` | TanStack Start + Nitro | Hub SUCONT-4, acompanhamento contábil |
| `rumaer` | TanStack Start + Nitro | Uniformes da FAB (RUMAER) |
| `forms` | TanStack Start + Nitro | Questionários; multi-tenant (tenant `cinco-s` = deploy `5s`) |
| `assignment-selection` | TanStack Start + Nitro | Escolha de vagas / CPAINT: telão + controlador |
| `docs` | TanStack Start + Fumadocs | Documentação interna |
| `api` | Bun + Hono + OpenAPI | API pública: alimentos, preços, sync workers |
| `alpha` | Bun + Hono + LangGraph | Projeto α: IA em contratações públicas (Lei 14.133/21) |
| `sisub-mcp` | Bun + MCP SDK | Servidor MCP com acesso aos dados do sisub |
| `pdf` | BentoPDF (nginx estático) | Não é workspace: só `Dockerfile` (kind `dockerfile` no manifesto) |

Todos os apps web usam React 19.

## Packages

`database` (tipos + migrations Supabase) · `sisub-domain` (operações, guards, contrato das tools de
IA) · `supabase-kit` (clients service-role/browser/SSR com deadlines de fetch) · `auth-kit` · `pbac`
(autorização módulo + nível + escopo) · `legal-kit` · `ai-provider` · `agent-web` · `compras-api` ·
`hono-client` · `alpha-client` · `tsconfig`.

## Comandos

```bash
bun install                            # obrigatório em worktree nova: instala os hooks de commit
bun run dev / bun run sisub:dev        # todos os apps / só um (`<app>:dev` no package.json)
bun run check                          # biome + typecheck (monorepo)
bun run lint --concurrency=2           # o mesmo lint do CI
bun run test --concurrency=2           # todos os testes (turbo)
cd apps/<app> && bunx vitest run       # vitest de um app (sisub, assignment-selection)
bun run generate:deploy                # regenera Dockerfile/bake/paths-filter do manifesto
bun --filter @iefa/database <script>   # scripts do banco (db:types, audit:rls, ...)
bun run scan:rules                     # gate do opengrep local (~15 s; binário `opengrep` no PATH)
```

Em rodada full-repo, passe `--concurrency=2` (`--concurrency=1` em `build`): o default do turbo
estoura a RAM das máquinas de desenvolvimento.

## Convenções

- **Server functions (TanStack Start):** `createServerFn().validator(z.object(...))` em
  `src/server/*.fn.ts`. `.inputValidator()` está depreciado.
- **Supabase:** sempre via `@iefa/supabase-kit` (`createServiceRoleClient` /
  `createAppBrowserClient` / `createSsrAuthClient`), criado por request dentro do `.handler()`.
  Não instanciar `createClient` direto: os deadlines de fetch que evitam o 502 no ALB vivem no kit.
  Os serviços Hono (`alpha`, `api`) ainda montam `createClient` direto; isso é dívida, não padrão.
- **Auth:** ações e mensagens de erro via `@iefa/auth-kit`; trava de login é `useLoginRateLimiter`
  de `@iefa/auth-kit/react`.
- **tsconfig:** estender `@iefa/tsconfig/{react-app,bun-service,library}.json`; o app só declara
  `paths`. Imports `@/*` → `src/*` (o `sucont` também aceita `#/*`, legado).
- **Arquivos gerados** não se editam à mão: `Dockerfile`, `docker-bake.hcl` e
  `.github/paths-filter.yml` saem de `apps.manifest.json` (`bun run generate:deploy`; o CI falha em
  drift). `routeTree.gen.ts` sai do dev server do app. `packages/database/src/generated.ts` sai de
  `db:types`.
- **Identificador em inglês; valor de domínio na língua da norma.** Função começa por verbo,
  predicado por `is`/`has`, constante em `SCREAMING_SNAKE`. Fica em português só termo sem
  equivalente inglês fiel ou nome de integração externa (`nup`, `om`, `ementa`, `epigrafe`,
  `preambulo`, `fecho`, `vocativo`, `alinea`, `subalinea`, `posto`, `quadro`, `despacho`, `noImp`,
  `sigadaer`, `comaer`). Teste: um leitor da NSCA reconheceria o termo inglês como a mesma coisa?
  Valor de domínio não se traduz (`kind: "oficio-externo"`). Comentário e mensagem ao usuário em
  português; commit em inglês.

## Regras que cruzam o repo

- **Mudança de acesso** (conceder, alterar, revogar), em qualquer app, só por função auditada que
  grava `access_control.sensitive_operation_log` na mesma transação, com o ator da sessão.
- **Função SQL nova** nasce executável só por `service_role`; o navegador não chama função nenhuma.
- **Migration:** declara no guard do sisub → aplica → mergeia. Detalhe em `.claude/rules/database.md`.
- **IA:** Bedrock no primário, adapter por `createAdapterFromEnv`. Ver `AI-PROVIDERS.md`.
- **LGPD:** canal único `iefa@fab.mil.br`, resposta em 7 dias, exclusão manual (única exceção
  declarada: conversa do assistente do Contrate). App com dado pessoal tem termos, privacidade e
  cookies no rodapé, servidos de `iefa.legal_documents` via `@iefa/legal-kit` (serviço sem UI expõe
  `GET /legal`). O aviso de ciência não bloqueia navegação: a base legal é execução de política
  pública, não consentimento. Documento novo é linha nova, nunca `UPDATE`.
  Cookie ou destinatário novo entra no inventário da Política de Cookies antes de entrar em uso. Ver
  `LGPD.md`.
- **MFA:** remover o MFA de alguém é sempre ato registrado; pelo dashboard do Supabase o `insert` em
  `access_control.mfa_reset_log` é manual. Ver `MFA-RECOVERY.md`.
- **UI:** `sisub` e `portal` têm design systems incompatíveis; leia o `STYLE_CONTRACT.md` do app.
  Base UI, nunca Radix. Faixa de acento lateral colorida é proibida em todos os apps. O lint de
  Tailwind (`bun run lint:tailwind`) conta aviso como dívida num baseline que só desce.

## Referência por área

Leia antes de mexer na área (o Claude Code carrega sozinho pelo caminho do arquivo):

| Área | Arquivo |
|------|---------|
| Banco, grants, RLS, auditoria de acesso, migrations | `.claude/rules/database.md` |
| Tools de IA do chat e do MCP (`sisub-domain/agent`) | `.claude/rules/ai-tools.md` |
| Providers de IA | `.claude/rules/ai-providers.md`, `AI-PROVIDERS.md` |
| UI, design systems, Base UI | `.claude/rules/ui.md` |
| Testes (runners, `.env`, integração no banco real) | `.claude/rules/testing.md`, `TESTING.md` |
| CI/CD e deploy | `.claude/rules/ci.md` |

## Workflow

- **Todo trabalho vai por Pull Request.** Branch → push → `gh pr create --base main`. A `main` tem
  um ruleset sem bypass: PR obrigatório, zero aprovações e checks obrigatórios verdes
  (`lint · typecheck · test`, opengrep, `bun audit`, drift do manifesto, título do PR e o `gate` de
  integração). Push direto
  na `main` é recusado pelo GitHub, e `--admin` não fura o ruleset.
- **Antes do merge:** `bun run check`, `bun run lint --concurrency=2` e
  `bun run test --concurrency=2` verdes local, e `/code-review` rodado com os achados publicados no
  PR. A skill `ship-pr` faz esse caminho inteiro. Achado aberto só não impede o merge se não foi
  introduzido pelo PR e o PR é estritamente melhor que a `main`.
- **O agente mergeia o próprio PR** com `gh pr merge <n> --squash --delete-branch --auto` quando os
  dois itens acima valem e o PR não está na lista abaixo. O `--auto` espera os checks obrigatórios;
  check vermelho segura o merge sem ninguém olhar. O mantenedor revisa depois, por amostragem.
- **Esperam o mantenedor** (abra o PR, publique a revisão e pare): migration nova ou alterada;
  grant, RLS, policy ou tabela de acesso; `infra/**`; segredo ou variável de produção; texto de
  documento legal; e qualquer definição de gate, porque o PR roda a versão dele mesmo: `.github/**`,
  `.opengrep/rules/`, `.claude/hooks/`, `.claude/settings.json`, `commitlint.config.ts`,
  `biome.json`, `.oxlintrc.tailwind.jsonc`, `turbo.json`. Esses o mantenedor mergeia, ou pede
  explicitamente que o agente mergeie.
- **Commits e título do PR:** Conventional Commits em inglês (subject e body). Os escopos derivam de
  `apps/` + `packages/` + chaves do `apps.manifest.json` + `deps`, `ci`, `scripts`, `root`
  (`database`, não `db`). O merge é squash: o título do PR vira o commit da `main`.
- **Depois do merge:** confira o run do `CI/CD` pelo SHA
  (`gh run list --branch main --workflow "CI/CD"`). Deploy `skipped` significa check vermelho, não
  "nada a fazer".
- Padrão que causou bug vira regra em `.opengrep/rules/`, não só correção pontual.
- Quando uma decisão tem default defensável, siga com ele e registre a escolha e o motivo no PR ou
  no design. Pergunte só quando uma suposição errada inutilizaria o trabalho.
