#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/put-secret.sh <service> <json-file>

Example:
  cp secrets/api.example.json secrets/api.local.json
  scripts/put-secret.sh api secrets/api.local.json
USAGE
}

service="${1:-}"
json_file="${2:-}"

if [[ -z "$service" || -z "$json_file" || "$service" == "-h" || "$service" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "$json_file" ]]; then
  echo "JSON file not found: $json_file" >&2
  exit 1
fi

json_file="$(cd "$(dirname "$json_file")" && pwd)/$(basename "$json_file")"

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

jq empty "$json_file" >/dev/null

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
infra_dir="$(cd "$script_dir/.." && pwd)"

cd "$infra_dir"

secret_name="$(terraform output -json secret_names | jq -r --arg service "$service" '.[$service] // empty')"

if [[ -z "$secret_name" ]]; then
  echo "Unknown service: $service" >&2
  exit 1
fi

aws secretsmanager put-secret-value \
  --secret-id "$secret_name" \
  --secret-string "file://${json_file}"

echo "Updated $secret_name"
