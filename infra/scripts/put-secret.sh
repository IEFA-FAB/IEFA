#!/usr/bin/env bash
# Upload a service runtime secret JSON to Secrets Manager.
# The service stack must be applied first (it creates the secret).
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/put-secret.sh <service> <json-file>

<service> is the per-service stack folder name (e.g. api, sisub, 5s, sisub-mcp).

Example:
  cp ../api/secrets/api.example.json ../api/secrets/api.local.json
  scripts/put-secret.sh api ../api/secrets/api.local.json
USAGE
}

service="${1:-}"
json_file="${2:-}"

if [[ -z "$service" || -z "$json_file" || "$service" == "-h" || "$service" == "--help" ]]; then
  usage
  exit 0
fi

for bin in terraform jq aws; do
  command -v "$bin" >/dev/null || { echo "$bin is required" >&2; exit 1; }
done

if [[ ! -f "$json_file" ]]; then
  echo "JSON file not found: $json_file" >&2
  exit 1
fi
json_file="$(cd "$(dirname "$json_file")" && pwd)/$(basename "$json_file")"
jq empty "$json_file" >/dev/null

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
infra_dir="$(cd "$script_dir/.." && pwd)"
service_dir="$infra_dir/$service"

if [[ ! -d "$service_dir" ]]; then
  echo "Unknown service stack: $service (expected $service_dir)" >&2
  exit 1
fi

cd "$service_dir"
secret_name="$(terraform output -raw secret_name)"

aws secretsmanager put-secret-value \
  --secret-id "$secret_name" \
  --secret-string "file://${json_file}"

echo "Updated $secret_name"
