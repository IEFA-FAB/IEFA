# IEFA on ECS Fargate Spot

Este stack provisiona os servicos hoje descritos em `fly/*.toml` em ECS Fargate Spot:

- `portal`, `sisub`, `api`, `alpha`, `docs`, `forms`, `5s`, `rumaer`.
- Um ALB compartilhado para todos os servicos.
- Dois tasks por servico por padrao (`desired_count = 2`).
- Repos ECR por servico.
- Um secret JSON por servico no Secrets Manager.
- IAM separado para task execution e task runtime.
- CloudWatch Logs desativado por padrao.
- Sem NAT Gateway: tasks ficam em subnets publicas com public IP, mas inbound so vem do security group do ALB.

## 1. Bootstrap do estado

```bash
cd infra/bootstrap
terraform init
terraform apply
terraform output backend_config
```

Copie `infra/sisub/backend.tf.example` para `infra/sisub/backend.tf` e troque `bucket` e `dynamodb_table` pelos outputs do bootstrap.

Nota: Terraform S3 backend atual suporta `use_lockfile = true`; `dynamodb_table` ainda foi incluido porque voce pediu a tabela DynamoDB e ajuda compatibilidade com setups antigos.

## 2. Configurar variaveis

```bash
cd ../sisub
cp terraform.tfvars.example terraform.tfvars
```

Ajuste `root_domain`, `certificate_arn`, `route53_zone_id` e `service_domains`.

Se nao informar `root_domain` ou `service_domains`, o ALB ainda sobe, mas so o `default_service_name` (`portal`) responde no default listener.

## 3. Criar infra

```bash
terraform init
terraform plan
terraform apply
```

> Ordem importa: o `apply` cria os ECS services apontando para `<repo>:latest`, que
> ainda nao existe no ECR, e os secrets JSON ainda estao vazios. Os services so
> alcancam steady state depois dos passos 4 (secrets) e 5 (push das imagens). O
> `apply` em si nao trava (nao usamos `wait_for_steady_state`), mas as tasks ficam
> em erro de pull ate as imagens e secrets serem populados. Para evitar o loop de
> circuit breaker no primeiro apply, opcionalmente suba com `desired_count = 0` e
> aumente depois de publicar imagens e secrets.

## 4. Popular secrets

Cada servico usa um secret JSON em `/iefa/prod/<servico>`. Templates ficam em `secrets/*.example.json`.

```bash
cp secrets/api.example.json secrets/api.local.json
$EDITOR secrets/api.local.json
scripts/put-secret.sh api secrets/api.local.json
```

Chaves minimas por servico:

- `api`: `API_SUPABASE_URL`, `API_SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`.
- `alpha`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NVIDIA_API_KEY`.
- `portal`: `VITE_IEFA_SUPABASE_URL`, `VITE_IEFA_SUPABASE_PUBLISHABLE_KEY`, `IEFA_SUPABASE_SECRET_KEY`.
- `forms` e `5s`: `VITE_IEFA_SUPABASE_URL`, `VITE_IEFA_SUPABASE_PUBLISHABLE_KEY`, `IEFA_SUPABASE_SECRET_KEY`.
- `rumaer`: `VITE_RUMAER_SUPABASE_URL`, `VITE_RUMAER_SUPABASE_PUBLISHABLE_KEY`, `RUMAER_SUPABASE_SECRET_KEY`.
- `sisub`: `VITE_SISUB_SUPABASE_URL`, `VITE_SISUB_SUPABASE_PUBLISHABLE_KEY`, `SISUB_SUPABASE_SECRET_KEY`, `SISUB_DATABASE_URL`, `ADMIN_SECRET`.
- `docs`: nenhum secret obrigatorio.

Variaveis opcionais devem ser adicionadas em `service_extra_secret_names` antes de serem lidas pela task definition.

## 5. Build e push das imagens

Depois do `terraform apply`, use Docker Buildx Bake apontando para o ECR criado pelo Terraform:

```bash
export REGISTRY="$(terraform output -raw ecr_registry)"
export REPOSITORY_PREFIX="$(terraform output -raw ecr_repository_prefix)"
export TAG="latest"

aws ecr get-login-password --region "$(terraform output -raw aws_region)" \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker buildx bake sisub --push
docker buildx bake default --push
```

Para apps que precisam de variaveis `VITE_*` no build, exporte as variaveis antes do Bake:

```bash
export VITE_SISUB_SUPABASE_URL="https://example.supabase.co"
export VITE_SISUB_SUPABASE_PUBLISHABLE_KEY="change-me"
docker buildx bake sisub --push
```

O arquivo `docker-bake.hcl` tagueia as imagens no mesmo padrao dos repositorios ECR criados por este stack: `<registry>/<project>/<environment>/<service>:<tag>`.

Depois de publicar uma imagem nova:

```bash
scripts/deploy-service.sh sisub
scripts/deploy-service.sh all
```

## 6. CI/CD via GitHub Actions (OIDC)

O workflow `.github/workflows/deploy.yml` builda, publica no ECR e forca um novo
deploy no ECS a cada push na `main` (ou via `workflow_dispatch` com os `force_*`).
Nao usa chaves de acesso: assume a role `${project}-${environment}-github-deploy`
via OIDC (criada em `cicd.tf`), restrita a este repo e a branch `main`.

Configure as **GitHub Actions Variables** (Settings → Secrets and variables →
Actions → Variables) com os outputs do Terraform:

```bash
terraform output github_actions_variables
# AWS_REGION, AWS_DEPLOY_ROLE_ARN, ECR_REGISTRY, ECR_REPOSITORY_PREFIX, ECS_CLUSTER
```

- `enable_github_deploy_role = false` desliga a role (default: ligada).
- Se a conta ja tem um provider OIDC do GitHub, passe `github_oidc_provider_arn`
  para reusar (a AWS so permite um provider por conta para essa URL).
- `github_deploy_subject_refs` controla quais refs podem deployar (default: so `main`).

Secrets de runtime (`SISUB_DATABASE_URL`, chaves de IA, etc.) **nao** passam mais
pelo CI: ficam no Secrets Manager (passo 4) e o ECS os injeta na task. O CI so
precisa de build args `VITE_*` (GitHub Variables) e do `FARO_SOURCEMAP_API_KEY`
(GitHub Secret, opcional).

## Decisoes de custo

- Fargate Spot por padrao, com dois tasks por servico.
- Sem NAT Gateway. E barato, mas as tasks tem public IP; o security group bloqueia inbound direto.
- ALB unico para todos os servicos.
- ECR lifecycle mantem apenas 10 imagens por repositorio.
- CloudWatch Logs e Container Insights ficam desligados por padrao.
- DynamoDB do state usa `PAY_PER_REQUEST`.
