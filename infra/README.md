# IEFA infra — AWS ECS Fargate

Terraform for deploying every IEFA app to **AWS ECS Fargate** behind a single
shared ALB. The CI/CD (`.github/workflows/deploy.yml`) builds each app to ECR and
forces a new ECS deployment, authenticating with **GitHub OIDC** (no static keys).

## Layout

One folder per deploy unit. Shared platform lives in `foundation/`; each service
is an independent Terraform stack that reads the foundation via remote state, so a
service can be planned/applied/destroyed without touching the others.

```
infra/
  bootstrap/        S3 + DynamoDB Terraform state backend (run once)
  foundation/       VPC, subnets, shared ALB + listener, ECS cluster, IAM roles,
                    GitHub OIDC deploy role. Apply before any service.
  modules/service/  Reusable module: ECR + secret + task def + ECS service +
                    target group + host listener rule + task-SG ingress.
  <service>/        One thin stack per service — portal, sisub, api, rumaer,
                    forms, 5s, docs, alpha, sisub-mcp. main.tf/variables.tf are
                    identical; the service definition is in terraform.tfvars.
  scripts/          put-secret.sh, deploy-service.sh
```

Why not a folder with its own ALB/VPC per service? A load balancer, VPC and ECS
cluster are shared infrastructure — duplicating them per service would multiply
cost (≈8 ALBs) for no benefit. Services stay isolated at the state/ECR/secret/
target-group level while sharing the one network + ALB + cluster in `foundation/`.

## Apply order

```bash
# 1. State backend (once per account)
cd infra/bootstrap && terraform init && terraform apply
#    → note state_bucket_name + dynamodb_table_name

# 2. Foundation (shared platform)
cd ../foundation
cp backend.tf.example backend.tf          # fill bucket/table from step 1
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
#    → terraform output github_actions_variables   (for GitHub, see below)

# 3. Each service (repeatable, independent)
cd ../api
cp backend.tf.example backend.tf          # fill bucket/table; key is preset per service
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
```

For the very first apply of a service, the ECS service will not stabilize until an
image exists in its ECR repo. Either let CI push `:latest` first, or push manually,
then re-run `terraform apply` / `scripts/deploy-service.sh <service>`.

## Runtime secrets

Each service stack creates one Secrets Manager secret `/<project>/<environment>/<service>`
holding a JSON object. The task definition injects the keys listed in the stack's
`secret_names`. Populate it after apply:

```bash
cd infra/scripts
cp ../api/secrets/api.example.json ../api/secrets/api.local.json   # edit values
./put-secret.sh api ../api/secrets/api.local.json
```

`*.local.json` is gitignored — never commit real secret values.

## GitHub Actions configuration

Set these from `cd infra/foundation && terraform output github_actions_variables`
as repository **Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Source |
|---|---|
| `AWS_REGION` | foundation output |
| `AWS_DEPLOY_ROLE_ARN` | foundation output (OIDC deploy role) |
| `ECR_REGISTRY` | foundation output |
| `ECR_REPOSITORY_PREFIX` | foundation output |
| `ECS_CLUSTER` | foundation output |
| `*_HEALTH_URL` | public health URL per service (`API_HEALTH_URL`, `SISUB_HEALTH_URL`, `IEFA_HEALTH_URL`, `RUMAER_HEALTH_URL`, `FORMS_HEALTH_URL`, `FORMS_5S_HEALTH_URL`, `DOCS_HEALTH_URL`, `MCP_HEALTH_URL`) |
| `VITE_*` | client build args (baked into bundles) |

Repository **Secrets** used only by CI checks / sourcemap upload (runtime secrets
live in Secrets Manager, not here): `API_SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`,
`SISUB_SUPABASE_SECRET_KEY`, `ANALYTICS_AI_API_KEY`, `MODULE_CHAT_AI_API_KEY`,
`FARO_SOURCEMAP_API_KEY`.

## Routing

Services share one ALB listener. Traffic is routed by **host header**, so each
service needs a hostname (`hosts = [...]` in its tfvars) and the foundation needs a
certificate (`certificate_arn`) + optionally `route53_zone_id`. With no cert/hosts
the ALB serves HTTP and returns 404 for everything (fine for a bring-up smoke test
of a single service via its target group, but not multi-service routing).

## Cost / reliability knobs

- **Spot by default** (`fargate_on_demand_base = 0`): cheapest, but a Spot
  reclamation can drop both tasks of a service at once. For user-facing SSR apps
  set `fargate_on_demand_base = 1` in the service tfvars to pin one on-demand task.
- **Container Insights** is on by default (`enable_container_insights = true` in
  foundation) to make Spot task failures debuggable; set false to shave cost.
- **Per-service logs** (`enable_cloudwatch_logs`) are off by default; enable per
  service when debugging.
- **`:latest` mutable** images + `--force-new-deployment`. For immutable rollout,
  set `image_tag_mutability = "IMMUTABLE"` and pin `image_tag` to a git sha.
- **No NAT**: tasks get public IPs (egress via IGW). Cheaper than NAT, but every
  task carries a public IPv4; SGs only allow inbound from the ALB.
