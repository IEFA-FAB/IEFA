#!/usr/bin/env bash
# Force a new ECS deployment for one service (or all), re-pulling the current
# :latest image. Mirrors what the GitHub Actions deploy job does, for local ops.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-service.sh <service|all>

<service> is the per-service stack folder name (e.g. api, sisub, 5s, sisub-mcp).
Reads the cluster name from the foundation stack output.
USAGE
}

target="${1:-}"
if [[ -z "$target" || "$target" == "-h" || "$target" == "--help" ]]; then
  usage
  exit 0
fi

for bin in terraform aws; do
  command -v "$bin" >/dev/null || { echo "$bin is required" >&2; exit 1; }
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
infra_dir="$(cd "$script_dir/.." && pwd)"

cluster="$(cd "$infra_dir/foundation" && terraform output -raw ecs_cluster_name)"

# Serviço ECS = stack que instancia `../modules/service`. "Tem main.tf" não basta: o
# docs-static (S3 + CloudFront) também tem, e não existe serviço ECS com esse nome. Com
# `set -e`, o update-service dele falhava e o `all` parava ali, sem forçar o deploy dos
# stacks que vinham depois na ordem alfabética (forms, pdf, portal, rumaer, sisub...).
is_ecs_stack() {
  grep -Eq '^[[:space:]]*source[[:space:]]*=[[:space:]]*"\.\./modules/service"' "$infra_dir/$1/main.tf" 2>/dev/null
}

all_services() {
  for d in "$infra_dir"/*/; do
    name="$(basename "$d")"
    if is_ecs_stack "$name"; then echo "$name"; fi
  done
}

if [[ "$target" == "all" ]]; then
  mapfile -t services < <(all_services)
else
  is_ecs_stack "$target" || { echo "Not an ECS service stack: $target" >&2; exit 1; }
  services=("$target")
fi

for service in "${services[@]}"; do
  echo "Forcing ECS deployment for $service on $cluster"
  aws ecs update-service \
    --cluster "$cluster" \
    --service "$service" \
    --force-new-deployment \
    >/dev/null
done
