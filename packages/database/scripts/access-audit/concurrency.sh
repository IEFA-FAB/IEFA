#!/usr/bin/env bash
# Corrida entre dois administradores no MESMO acesso — duas sessões de verdade, não subtransação.
#
#   - `change_module_permission` (upsert por chave): as duas concessões passam, sobra UMA linha
#     e ficam DUAS linhas de log (cada ato é um fato);
#   - `create_user_permission` (estrita): uma passa, a outra recebe PERMISSION_ALREADY_EXISTS
#     depois de esperar o commit da primeira — e só UMA linha de log;
#   - `attach_policy`: as duas passam; a segunda é mudança de prazo, não um segundo anexo.
#
# Uso: DB=<nome> PSQL="psql -h … -p …" ./concurrency.sh  (chamado por run.sh)
set -euo pipefail

q() { $PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAq -c "$1"; }

A=00000000-0000-0000-0000-00000000000a
B=00000000-0000-0000-0000-00000000000b

q "insert into core.units values (77) on conflict do nothing"
before=$(q "select count(*) from access_control.sensitive_operation_log")

# ── upsert por chave: as duas passam ──
for i in 1 2; do
	$PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAq -c "begin; select access_control.change_module_permission('$A', 'contrate', 'grant', '$B', 'alpha-requester', 1, 77, null, null, null); select pg_sleep(1); commit;" >/dev/null &
done
wait
rows=$(q "select count(*) from access_control.user_permissions where user_id = '$B' and module = 'alpha-requester' and unit_id = 77")
logs=$(( $(q "select count(*) from access_control.sensitive_operation_log") - before ))
[[ "$rows" == 1 && "$logs" == 2 ]] || { echo "upsert concorrente: esperava 1 linha e 2 logs, veio $rows e $logs"; exit 1; }

# ── criação estrita: uma passa, a outra recebe o erro legível ──
before=$(q "select count(*) from access_control.sensitive_operation_log")
out=$(mktemp -d)
for i in 1 2; do
	( $PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAq -c "begin; select access_control.create_user_permission('$A', 'createUserPermissionFn', '$B', 'local-analytics', 1, 77, null, null, null); select pg_sleep(1); commit;" >"$out/$i.out" 2>"$out/$i.err"; echo $? >"$out/$i.rc" ) &
done
wait
ok=$(cat "$out"/*.rc | grep -c '^0$' || true)
dup=$(cat "$out"/*.err | grep -c 'PERMISSION_ALREADY_EXISTS' || true)
logs=$(( $(q "select count(*) from access_control.sensitive_operation_log") - before ))
rm -rf "$out"
[[ "$ok" == 1 && "$dup" == 1 && "$logs" == 1 ]] || { echo "criação concorrente: esperava 1 sucesso, 1 PERMISSION_ALREADY_EXISTS e 1 log; veio $ok, $dup, $logs"; exit 1; }

# ── anexo concorrente: um anexo, dois logs (attach + expiry) ──
pol=$(q "select (access_control.create_policy('$A', 'createPolicyFn', 'Corrida', null) ->> 'id')")
before=$(q "select count(*) from access_control.sensitive_operation_log")
for i in 1 2; do
	$PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAq -c "begin; select access_control.attach_policy('$A', 'attachPolicyFn', '$B', '$pol', null); select pg_sleep(1); commit;" >/dev/null &
done
wait
rows=$(q "select count(*) from access_control.user_policy_attachment where policy_id = '$pol'")
kinds=$(q "select string_agg(target ->> 'change', ',' order by target ->> 'change') from access_control.sensitive_operation_log where target ->> 'policy_id' = '$pol' and operation = 'attachPolicyFn'")
[[ "$rows" == 1 && "$kinds" == "attach,expiry" ]] || { echo "anexo concorrente: esperava 1 anexo e attach,expiry; veio $rows e $kinds"; exit 1; }

echo "concorrência: OK"
