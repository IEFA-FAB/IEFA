---
paths:
  - ".github/**"
  - "apps.manifest.json"
  - "scripts/generate-deploy-artifacts.ts"
  - "turbo.json"
  - "infra/**"
  - "docker/**"
---

# CI/CD e deploy

## O que roda onde

| Workflow | Quando | Gate |
|----------|--------|------|
| `pr-check.yml` | PR | format + `turbo run lint typecheck test --affected` (sem segredo; arquivo global alterado roda tudo) |
| `security.yml` | PR, push na main, semanal | opengrep (ERROR bloqueia), `bun audit` crítico, drift do manifesto, headers; CodeQL/Trivy só reportam |
| `integration.yml` | PR que toca `apps/sisub`, `packages/database`, `packages/sisub-domain` | `test:integration:gate` contra o banco real (fila global) + `audit:rls` |
| `commit-lint.yml` | PR | título do PR (e subject do commit único) no commitlint |
| `deploy.yml` (`CI/CD`) | push na main | `changes` → `check-<app>` → `build-<app>` → `deploy-<app>` por app (paths-filter) |
| `terraform-plan/apply` | PR / push em `infra/**` | plan com role de PR; apply só na main |

## Armadilhas conhecidas

- **Nome de job é contrato do ruleset da `main`.** Os checks obrigatórios são casados pelo nome
  (`lint · typecheck · test`, `opengrep (regras do repo)`, `bun audit`,
  `deploy artifacts (manifest drift)`, `título do PR (Conventional Commits)`). Renomear o job, ou
  pôr `paths:` no workflow dele, deixa todo PR esperando um check que nunca chega. Job que não se
  aplica ao PR roda e sai por `if:`: `skipped` conta como verde.

- **`check-sisub` na main roda a integração inteira; o PR roda só o subconjunto do gate.** O que
  mais derruba a main é o guard de reset de treino (`training.operations.test.ts`), que o PR não
  roda: siga a ordem declara → aplica → mergeia de `.claude/rules/database.md`.
- **Check vermelho deixa build/deploy `skipped`, não `failed`.** Depois de mergear, confira o run do
  `CI/CD` pelo SHA (`git merge-base --is-ancestor <seu_sha> <sha_do_run>`): merge seguido de outro
  cancela o run do primeiro.
- **`cancelled` no gate de integração é disputa da fila global** (`concurrency.group` fixo, um
  pendente por vez), não reprovação. `gh pr checks` mostra os dois como `fail`. Reexecute com
  `gh run rerun <id>` quando o grupo esvaziar. `gh pr checks` só lista check já registrado: confira o
  workflow pelo SHA.
- **Pacote novo em `packages/`** entra no manifesto e no `package.json`; `bun run generate:deploy`
  cuida das linhas `COPY` do Dockerfile. Sem isso o `warm-deps` quebra o build de todos os apps.
- **PR do Dependabot** não recebe segredo: o gate de integração dele sempre falha. Valide local e,
  se precisar, dispare o workflow numa branch-cópia.

## Segurança dos workflows (repo público)

- Nunca `pull_request_target` nem `workflow_run` com código do PR.
- `${{ … }}` de texto controlado pelo autor (título, branch, corpo) vai por `env:`, nunca
  interpolado no `run:`.
- Action de terceiro com pin por SHA; `actions/*`, `github/*`, `docker/*`, `aws-actions/*` e
  `oven-sh/*` podem usar tag (`.github/zizmor.yml`).
- `checkout` com `persist-credentials: false` em job que não faz push.
- A role de deploy AWS confia só na `main`; job de PR que precise de AWS usa role própria, com
  permissão mínima.
