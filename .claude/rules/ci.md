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
| `integration.yml` | todo PR, push na main, dispatch; `changes` usa o escopo sisub do `paths-filter.yml` | PR: `gate` (`test:integration:gate` transacional + `audit:rls`, fila por PR, check obrigatório). Main e dispatch: `gate` + `full` (suíte inteira, monitor, trava global do banco) |
| `commit-lint.yml` | PR | título do PR (e subject do commit único) no commitlint |
| `deploy.yml` (`CI/CD`) | push na main | `changes` → `check-<app>` → `build-<app>` → `deploy-<app>` por app (paths-filter); sem integração |
| `terraform-plan/apply` | PR / push em `infra/**` | plan com role de PR; apply só na main |

## Armadilhas conhecidas

- **Nome de job é contrato do ruleset da `main`.** Os checks obrigatórios são casados pelo nome
  (`lint · typecheck · test`, `opengrep (regras do repo)`, `bun audit`,
  `deploy artifacts (manifest drift)`, `título do PR (Conventional Commits)`). Renomear o job, ou
  pôr `paths:` no workflow dele, deixa todo PR esperando um check que nunca chega. Job que não se
  aplica ao PR roda e sai por `if:`: `skipped` conta como verde.

- **A integração bloqueia no PR, não no deploy.** O `gate` do PR é transacional. A suíte inteira
  (`full`) roda no push da `main` como monitor, com a trava `sisub-integration-real-db`, porque os
  arquivos seed-cleanup não aguentam duas execuções no mesmo banco. `full` vermelho na `main` é
  regressão a corrigir, mesmo com o deploy verde. Para rodá-la antes do merge:
  `gh workflow run "sisub integration (real db)" --ref <branch>`. O que mais a derruba é o guard
  de reset de treino (`training.operations.test.ts`): siga a ordem declara → aplica → mergeia de
  `.claude/rules/database.md`.
- **Check vermelho deixa build/deploy `skipped`, não `failed`.** Depois de mergear, confira o run do
  `CI/CD` pelo SHA (`git merge-base --is-ancestor <seu_sha> <sha_do_run>`): merge seguido de outro
  cancela o run do primeiro.
- **`cancelled` no `full` da `main` é commit mais novo na fila da trava**, não reprovação: o run do
  commit seguinte cobre os dois. No PR, `cancelled` só vem de push novo no mesmo PR. `gh pr checks`
  mostra `cancelled` como `fail` e só lista check já registrado: confira o workflow pelo SHA.
- **Pacote novo em `packages/`** entra no manifesto e no `package.json`; `bun run generate:deploy`
  cuida das linhas `COPY` do Dockerfile. Sem isso o `warm-deps` quebra o build de todos os apps.
- **PR do Dependabot e de fork** não recebem segredo: o `gate` pula (verde) e a integração deles
  roda no push da `main`. Para validar antes, dispare o workflow numa branch-cópia.

## Segurança dos workflows (repo público)

- Nunca `pull_request_target` nem `workflow_run` com código do PR.
- `${{ … }}` de texto controlado pelo autor (título, branch, corpo) vai por `env:`, nunca
  interpolado no `run:`.
- Action de terceiro com pin por SHA; `actions/*`, `github/*`, `docker/*`, `aws-actions/*` e
  `oven-sh/*` podem usar tag (`.github/zizmor.yml`).
- `checkout` com `persist-credentials: false` em job que não faz push.
- `id-token: write` só no job que assume role AWS, nunca no topo do workflow.
- Binário baixado por `curl` (opengrep, gitleaks) confere sha256 fixado no workflow.
- A role de deploy AWS confia só na `main`; job de PR que precise de AWS usa role própria, com
  permissão mínima.
