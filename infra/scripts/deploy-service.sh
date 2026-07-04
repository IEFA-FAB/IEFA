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

# Service stack folders = every dir with a main.tf that isn't foundation/bootstrap/modules.
all_services() {
  for d in "$infra_dir"/*/; do
    name="$(basename "$d")"
    case "$name" in
      foundation | bootstrap | modules | scripts) continue ;;
    esac
    [[ -f "$d/main.tf" ]] && echo "$name"
  done
}

if [[ "$target" == "all" ]]; then
  mapfile -t services < <(all_services)
else
  [[ -f "$infra_dir/$target/main.tf" ]] || { echo "Unknown service: $target" >&2; exit 1; }
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
