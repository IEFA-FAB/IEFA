#!/usr/bin/env bash
# Valida as migrations de auditoria de acesso num Postgres DESCARTÁVEL — nunca no banco
# compartilhado. Sobe um cluster temporário (initdb), aplica stub.sql + fase 1, roda os testes
# da fase 1 e a corrida, aplica a fase 2 e roda os testes dela. Apaga o cluster no fim.
#
#   bash packages/database/scripts/access-audit/run.sh
#
# Requer `initdb`, `pg_ctl` e `psql` (PostgreSQL ≥ 15, por `nulls not distinct`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../../supabase/migrations"
PORT="${ACCESS_AUDIT_PG_PORT:-55441}"
WORK="$(mktemp -d)"

cleanup() { pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log.txt" -w start >/dev/null

export PSQL="psql -h $WORK -p $PORT -U postgres"
export DB=access_audit
$PSQL -d postgres -qc "create database $DB"

run() { $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run "$HERE/stub.sql"
run "$MIGRATIONS/20260921130000_access_change_audited_functions.sql"
# Reaplicável: a fase 1 é idempotente.
run "$MIGRATIONS/20260921130000_access_change_audited_functions.sql"
run "$HERE/phase1.test.sql"
bash "$HERE/concurrency.sh"
run "$MIGRATIONS/20260921130100_access_change_enforcement.sql"
run "$MIGRATIONS/20260921130100_access_change_enforcement.sql"
run "$HERE/phase2.test.sql"
echo "access-audit: tudo verde"
