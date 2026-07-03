#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-service.sh <service|all>

For mutable tags such as latest, this forces ECS to pull the current image tag.
For immutable tags, update image_tags in terraform.tfvars and run terraform apply first.
USAGE
}

service="${1:-}"

if [[ -z "$service" || "$service" == "-h" || "$service" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v terraform >/dev/null; then
  echo "terraform is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null; then
  echo "jq is required" >&2
  exit 1
fi

if ! command -v aws >/dev/null; then
  echo "aws CLI is required" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
infra_dir="$(cd "$script_dir/.." && pwd)"

cd "$infra_dir"

cluster="$(terraform output -raw ecs_cluster_name)"
services_json="$(terraform output -json ecs_services)"

if [[ "$service" == "all" ]]; then
  mapfile -t services < <(jq -r 'keys[]' <<<"$services_json")
else
  services=("$service")
fi

for service_name in "${services[@]}"; do
  exists="$(jq -r --arg service "$service_name" 'has($service)' <<<"$services_json")"
  if [[ "$exists" != "true" ]]; then
    echo "Unknown service: $service_name" >&2
    exit 1
  fi

  echo "Forcing ECS deployment for $service_name"
  aws ecs update-service \
    --cluster "$cluster" \
    --service "$service_name" \
    --force-new-deployment \
    >/dev/null
done
