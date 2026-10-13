# Workflows: o que roda, quando e por quê

Mapa para ler a aba Actions sem abrir os YAML. É a fonte única de "o que roda onde"; as
armadilhas de cada workflow ficam em `.claude/rules/ci.md`.

## Num pull request

Tudo roda em paralelo. Os seis marcados com ✅ são checks obrigatórios do ruleset da `main`: o
nome do job é o contrato, e renomear deixa todo PR esperando um check que nunca chega.

| Workflow | Jobs | Para quê | Credencial |
|----------|------|----------|------------|
| `pr-check` | ✅ `lint · typecheck · test` | format, lint, typecheck, testes unitários e `vite build` dos workspaces afetados (`turbo --affected`) | nenhuma |
| `security` | ✅ `opengrep (regras do repo)`, ✅ `bun audit`, ✅ `deploy artifacts (manifest drift)`; mais `codeql`, `gitleaks`, `zizmor`, `actionlint` e `trivy` | análise estática, segredos, dependências, supply chain dos workflows | nenhuma |
| `commit-lint` | ✅ `título do PR (Conventional Commits)` | o título vira o commit da `main` (squash) | nenhuma |
| `sisub integration (real db)` | `changes` → ✅ `gate (transacionais + ciclo e2e)` | `audit:rls` e testes transacionais no banco real; pula (verde) quando o PR não toca o escopo do sisub, e em PR de fork ou do Dependabot | **banco compartilhado** (URL e service role) |
| `terraform-plan` | `detect` → `plan (<stack>)` | plan das stacks alteradas, comentado no PR | role AWS **read-only** e os tfvars |

## Num push na `main`

| Workflow | O que acontece |
|----------|----------------|
| `CI/CD` (`deploy.yml`) | `plan` decide os apps afetados → `verify` (um job: lint, typecheck e teste do resultado do merge para todos eles, e os testes de todo package) → `release <app>` para cada app que passou (`build`: imagem no ECR; `deploy`: rollout no ECS e smoke test). O site do docs sai por `build-docs` → `deploy-docs`. `warm-deps` aquece o cache do `bun install` dos builds em paralelo com o `verify` |
| `security` | o mesmo do PR, mais o SARIF completo |
| `sisub integration (real db)` | `gate` + `full` (a suíte inteira, como monitor; não segura deploy) |
| `terraform-apply` | apply das stacks alteradas, foundation primeiro |

O `verify` repete na `main` o que o PR já checou porque o ruleset não exige branch atualizada:
dois PRs verdes podem quebrar juntos depois do merge. O resultado é por app (tabela no resumo do
job): app vermelho fica fora do `release`, os outros seguem.

Quais apps existem, a URL do smoke test e as tarefas que liberam cada um ficam no
`apps.manifest.json`, que o `plan` e o `verify` leem (`scripts/release-plan.ts`,
`scripts/release-verify.ts`). App novo não edita o `deploy.yml`.

## Agendados e manuais

| Workflow | Quando | Para quê |
|----------|--------|----------|
| `security` | semanal (segunda, 06:00 UTC) | o mesmo do PR, mais o gitleaks do histórico inteiro e o job `auditoria de RLS` |
| `api integration (real db)` | semanal (segunda, 09:00 UTC) / dispatch | integração da API contra o banco real |
| `sync-secrets` | dispatch | GitHub Secrets → AWS Secrets Manager |
| `CI/CD` | dispatch (input `apps`: `all` ou `sisub,portal`) | redeploy sem commit; passa pelo `verify` como um push |
| `terraform-apply` | dispatch | apply de stacks escolhidas |

## Reusáveis (prefixo `_`)

`_release.yml` (de um app: `build` com bake e push no ECR, que varre a imagem no push; depois
`deploy` com rollout no ECS e smoke test) e `_terraform-apply.yml`. Não disparam sozinhos.

## Onde cada job roda

O repositório é público, então o runner do GitHub é **gratuito**. A Blacksmith cobra cada job
por minuto cheio, e o ARM sai mais barato que o x64. A regra:

- **Blacksmith x64** onde CPU encurta a espera de alguém: o `pr-check` (resposta ao PR) e, a
  caminho da produção, `plan`, `verify`, `warm-deps` e o `build` de cada `release`. ARM foi
  medido no `pr-check` e levou o dobro do tempo: sai mais caro apesar do minuto mais barato. O `plan` dura segundos, mas é o início do
  caminho crítico e não pode esperar fila no GitHub.
- **GitHub** (`ubuntu-24.04`, versão fixada) para o resto: job que espera rede ou AWS
  (o `deploy` de cada `release`, `deploy-docs`), `sync-secrets`, tudo do `security`, da integração e do Terraform.
- O plano gratuito da organização roda **20 jobs simultâneos** no GitHub, somando PRs e `main`.
  Mover muitos jobs curtos para lá de uma vez cria fila.

## Segregação

- `id-token: write` só nos jobs que assumem role AWS (`release`, `deploy-docs`, Terraform). O
  `verify` roda código de teste e não recebe role.
- A role de deploy confia só na `main` (`sub` do OIDC). A role de plan é read-only.
- Nada com `pull_request_target`; segredo nunca chega a PR de fork ou do Dependabot.
- **Pendente:** o `build` (Blacksmith) e o `deploy`/`sync-secrets` (GitHub) assumem a mesma
  `AWS_DEPLOY_ROLE_ARN`, que também escreve no Secrets Manager e atualiza serviço no ECS. Uma role
  só de push no ECR para os builds tira essas permissões do runner de terceiro. Role de CI é
  bootstrap (apply local da foundation com admin, ver `infra/README.md`).
