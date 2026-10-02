#!/usr/bin/env bash
# Valida as migrations de auditoria de acesso num Postgres DESCARTÁVEL — nunca no banco
# compartilhado. Sobe um cluster temporário (initdb), aplica stub.sql + fase 1, roda os testes
# da fase 1 e a corrida, aplica a fase 2 e roda os testes dela, o arquivamento de
# 20260926218000, a autorização de cadastro externo e o hook do Auth (20261001100000…), o teto
# de `admin:3` (20261001120000) e, por fim, o endurecimento de 20261001140000… (log
# append-only, TRUNCATE, troca de e-mail). Apaga o cluster no fim.
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
# Já aplicada em produção antes desta (20260921090100, #388): a fase 1 a substitui por
# `create or replace` — aplicá-la antes aqui prova que a substituição sobre a versão viva funciona.
run "$MIGRATIONS/20260921090100_access_control_set_module_block.sql"
run "$MIGRATIONS/20260921130000_access_change_audited_functions.sql"
# Reaplicável: a fase 1 é idempotente.
run "$MIGRATIONS/20260921130000_access_change_audited_functions.sql"
run "$HERE/phase1.test.sql"
bash "$HERE/concurrency.sh"
run "$MIGRATIONS/20260921130100_access_change_enforcement.sql"
run "$MIGRATIONS/20260921130100_access_change_enforcement.sql"
run "$HERE/phase2.test.sql"
# 20261001150000 / 20261001150100: concessão do /controller da escolha de vagas e leitura do
# telão. Aplicadas duas vezes (idempotentes) sobre o estado anterior do stub.
run "$HERE/assignment-selection.stub.sql"
for _ in 1 2; do
	run "$MIGRATIONS/20261001150000_assignment_selection_access_grant_audited.sql"
	run "$MIGRATIONS/20261001150100_assignment_selection_person_active_edition_read.sql"
done
run "$HERE/assignment-selection.test.sql"
# 20260926218000: aplicada (duas vezes) de dentro do próprio teste, depois do estado de antes. A
# primeira, sem posse de auth.users como em produção, tem de avisar que o trigger ficou.
if ! run "$HERE/legacy-access-profiles.test.sql" 2>"$WORK/legacy.stderr"; then
	cat "$WORK/legacy.stderr" >&2
	exit 1
fi
if ! grep -q "NOTICE:  on_auth_user_created mantido" "$WORK/legacy.stderr"; then
	echo "legacy_access_profiles: esperava o NOTICE do trigger mantido (caminho de produção)" >&2
	cat "$WORK/legacy.stderr" >&2
	exit 1
fi
# 20261001100000/100100/100200: autorização de cadastro externo, hook do Auth e vínculo de SARAM.
run "$HERE/signup-allowlist.test.sql"
# 20261001140000…140300: log append-only, TRUNCATE nas tabelas vigiadas, troca de e-mail em
# auth.users, policies inertes e default de privilégios em storage.
run "$HERE/audit-hardening.test.sql"
# 20261001120000: teto de `admin:3` nas funções de grant inline, statement e anexo. Reaplicável.
run "$MIGRATIONS/20261001120000_access_admin_level_ceiling.sql"
run "$MIGRATIONS/20261001120000_access_admin_level_ceiling.sql"
run "$HERE/admin-ceiling.test.sql"
echo "access-audit: tudo verde"
