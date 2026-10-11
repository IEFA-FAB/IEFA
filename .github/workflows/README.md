# Workflows: o que roda, quando e por quê

Mapa para ler a aba Actions sem abrir os YAML. Detalhe de cada armadilha em
`.claude/rules/ci.md`.

## Num pull request

Tudo roda em paralelo, e nada aqui tem credencial de produção. Os seis marcados com ✅ são checks
obrigatórios do ruleset da `main`: o nome do job é o contrato, e renomear deixa todo PR esperando.

| Workflow | Jobs | Para quê | Runner |
|----------|------|----------|--------|
| `pr-check` | ✅ `lint · typecheck · test` | format, lint, typecheck, testes unitários e `vite build` dos workspaces afetados (`turbo --affected`) | Blacksmith ARM |
| `security` | ✅ `opengrep (regras do repo)`, ✅ `bun audit`, ✅ `deploy artifacts (manifest drift)`; mais `codeql`, `gitleaks`, `zizmor`, `actionlint` e `trivy` | análise estática, segredos, dependências, supply chain dos workflows | GitHub |
| `commit-lint` | ✅ `título do PR (Conventional Commits)` | o título vira o commit da `main` (squash) | GitHub |
| `sisub integration (real db)` | `changes` → ✅ `gate (transacionais + ciclo e2e)` | testes de integração transacionais no banco real; pula (verde) quando o PR não toca o sisub | GitHub |
| `terraform-plan` | `detect` → `plan (<stack>)` | plan read-only das stacks alteradas, comentado no PR | GitHub |

## Num push na `main`

| Workflow | O que acontece | Runner |
|----------|----------------|--------|
| `CI/CD` (`deploy.yml`) | `changes` decide os apps afetados → por app, `check-<app>` (lint, typecheck e teste do resultado do merge) → `build-<app>` (imagem no ECR) → `deploy-<app>` (rollout no ECS e smoke test). `warm-deps` aquece o cache do `bun install` dos builds; `check-packages` testa os packages sempre | build e check: Blacksmith x64; `changes` e deploy: GitHub |
| `security` | o mesmo do PR, mais o SARIF completo | GitHub |
| `sisub integration (real db)` | `gate` + `full` (suíte inteira, como monitor; não segura deploy) | GitHub |
| `terraform-apply` | apply das stacks alteradas, foundation primeiro | GitHub |

O `check-<app>` repete na `main` o que o PR já checou porque o ruleset não exige branch
atualizada: dois PRs verdes podem quebrar juntos depois do merge.

## Agendados e manuais

| Workflow | Quando | Para quê |
|----------|--------|----------|
| `security` | semanal (segunda, 06:00 UTC) | o mesmo do PR, mais o gitleaks do histórico inteiro e a `auditoria de RLS`, que só rodam aqui |
| `api integration (real db)` | semanal (segunda, 09:00 UTC) / dispatch | integração da API contra o banco real |
| `sync-secrets` | dispatch | GitHub Secrets → AWS Secrets Manager |
| `CI/CD` | dispatch (`force_<app>`) | redeploy de um app sem commit |
| `terraform-apply` | dispatch | apply de stacks escolhidas |

## Reusáveis (prefixo `_`)

`_app-build.yml` (bake + push no ECR + Trivy da imagem), `_app-deploy.yml` (rollout ECS +
smoke test) e `_terraform-apply.yml`. Não disparam sozinhos.

## Onde cada job roda

O repositório é público, então o runner do GitHub (`ubuntu-latest`, 4 vCPU) é **gratuito**. A
Blacksmith cobra por minuto (US$ 0,008 no x64 de 4 vCPU, US$ 0,005 no ARM) e arredonda cada job
para o minuto cheio. A regra:

- **Blacksmith** só onde CPU encurta a espera de alguém: o `pr-check` (resposta ao PR), os
  `check-<app>` e `build-<app>` do deploy (latência até produção).
- **GitHub** para o resto: job que espera rede ou AWS (`deploy`, `deploy-docs`), job de segundos
  (`changes`), tudo do `security`, da integração e do Terraform. Job com segredo de produção
  (`sync-secrets`) também fica no GitHub, fora de um terceiro.
- **ARM** onde a saída não vai para produção (`pr-check`). A imagem do ECS é x64.
- O plano gratuito da organização roda **20 jobs simultâneos** no GitHub. Mover muitos jobs curtos
  para lá de uma vez cria fila.

Medido de 2026-09-28 a 2026-10-11, antes desta divisão (US$ 27,87 em 14 dias): `deploy` 37%,
`build` 29%, `check-*` 16%, `pr-check` 12%, `warm-deps` + `changes` 4%.

## Segregação que não muda

- `id-token: write` só nos jobs que assumem role AWS (`build-*`, `deploy-*`, Terraform). Os
  `check-*` rodam código de teste e não recebem a role.
- A role de deploy confia só na `main` (`sub` do OIDC). A role de plan é read-only.
- Nada com `pull_request_target`; segredo nunca chega a PR de fork ou do Dependabot.
