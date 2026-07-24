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

## Terraform plan on PRs

`.github/workflows/terraform-plan.yml` runs a **read-only** `terraform plan` on
every PR that touches `infra/**` and posts the diff as a PR comment (one per
changed stack; a `modules/**` change fans out to every service stack). It **never**
applies — apply stays human/out-of-band. It authenticates via a dedicated
read-only OIDC role (`<prefix>-github-tf-plan`, assumable only from `pull_request`
events, AWS `ReadOnlyAccess` minus secret-value/KMS reads).

One-time setup after `terraform apply` of `foundation`:

| Variable / Secret | Kind | Source |
|---|---|---|
| `AWS_TF_PLAN_ROLE_ARN` | Variable | foundation output (`github_tf_plan_role_arn`) |
| `TF_STATE_BUCKET` | Variable | `infra/bootstrap` output (state bucket) |
| `TF_STATE_DYNAMODB_TABLE` | Variable | `infra/bootstrap` output (lock table) |
| `TF_TFVARS_JSON` | Secret | JSON map `{ "<stack>": "<tfvars file contents>" }` |

`TF_TFVARS_JSON` keeps the real tfvars **out of the repo** while letting CI plan:
CI writes `.[stack]` to `infra/<stack>/terraform.tfvars` at runtime. A stack with
no entry is skipped. **Caveat:** because tfvars live in the secret, a PR that only
changes service *config* (cpu/hosts/…) does not diff here — only `.tf` / module /
new-resource changes do.

## Routing

Services share one ALB listener. Traffic is routed by **host header**, so each
service needs a hostname (`hosts = [...]` in its tfvars) and the foundation needs a
certificate (`certificate_arn`) + optionally `route53_zone_id`. With no cert/hosts
the ALB serves HTTP and returns 404 for everything (fine for a bring-up smoke test
of a single service via its target group, but not multi-service routing).

## Cost / reliability knobs

- **One task per service by default** (`desired_count = 1`). Deploys stay
  zero-downtime regardless, because `deployment_minimum_healthy_percent = 100`
  starts the replacement task before stopping the old one. A second task only buys
  survival of a Spot reclamation or an AZ failure, and it costs twice: Fargate
  hours *and* a second public IPv4. `sisub` and `portal` set `desired_count = 2` in
  their tfvars; everything else runs one task.
- **Spot by default** (`fargate_on_demand_base = 0`): cheapest, but a Spot
  reclamation can drop every task of a service at once. For user-facing SSR apps
  set `fargate_on_demand_base = 1` in the service tfvars to pin one on-demand task.
- **Container Insights** is off by default (`enable_container_insights = false` in
  foundation). It publishes ~20 custom CloudWatch metrics per service, which was
  the single largest CloudWatch line on this account. Frontend errors and server
  traces already go to Grafana Faro + OTel. Turn it on while debugging Spot task
  failures, then turn it back off.
- **Per-service logs** (`enable_cloudwatch_logs`) are off by default; enable per
  service when debugging.
- **`:latest` mutable** images + `--force-new-deployment`. For immutable rollout,
  set `image_tag_mutability = "IMMUTABLE"` and pin `image_tag` to a git sha.
- **No NAT**: tasks get public IPs (egress via IGW). Cheaper than NAT, but every
  task carries a public IPv4; SGs only allow inbound from the ALB.

### Where the money goes

Roughly, per month, at this account's scale:

| Line | Driver | Scales with |
|---|---|---|
| Fargate Spot vCPU-hours | the dominant compute cost | `desired_count` × `cpu` |
| Public IPv4 in-use | ~US$3.60 per address | one per running task + 2 for the ALB |
| CloudWatch metric monitoring | Container Insights only | number of services, if enabled |
| ALB hours | fixed | shared across every service — do not split it |
| Fargate Spot GB-hours | ~10x cheaper per unit than vCPU | `desired_count` × `memory` |

Two consequences worth internalizing: **task count is the lever**, because it hits
compute and IPv4 together; and **vCPU is far more expensive than memory**, so when
a service needs headroom, prefer giving it memory over CPU.

Before resizing anything, measure. With Container Insights temporarily enabled:

```bash
aws cloudwatch get-metric-statistics --namespace ECS/ContainerInsights \
  --metric-name CpuUtilized \
  --dimensions Name=ClusterName,Value=iefa-prod-cluster Name=ServiceName,Value=sisub \
  --start-time "$(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 1209600 --statistics Average Maximum
```

`CpuUtilized` is in CPU units (1024 = 1 vCPU), `MemoryUtilized` in MiB — compare
directly against the `cpu` / `memory` in the service tfvars.

Deliberately *not* done, and why:

- **Private subnets + NAT gateway** to drop the public IPv4 charge. A NAT gateway
  costs about as much as the IPv4 addresses it would replace at this task count,
  and adds per-GB data processing on top.
- **VPC interface endpoints** (ECR, Secrets Manager, logs) for the same purpose.
  Each endpoint bills per-AZ-hour; four endpoints across two AZs cost more than the
  addresses they save.
- **Scheduled scale-to-zero** overnight for the internal-only apps. Real savings,
  but it needs Application Auto Scaling resources and makes "the app is down"
  ambiguous. Worth revisiting if compute climbs again.
