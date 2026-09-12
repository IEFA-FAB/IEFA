-- access_control_mfa_reset_log
-- Auditoria de toda remoção de segundo fator que NÃO partiu do próprio titular
-- em posse do dispositivo.
--
-- ── Por que um log separado do `sensitive_operation_log` ─────────────────────
--
-- Os dois são gravados no mesmo ato, e isso é intencional. O
-- `sensitive_operation_log` é genérico (ator, operação, alvo) e responde "o que
-- foi feito no sistema"; este aqui é específico e responde "como este usuário
-- ficou sem fator", com as colunas que só esta pergunta precisa: o MÉTODO e a
-- JUSTIFICATIVA. Enfiar `method`/`reason` no `target jsonb` do log genérico
-- deixaria a pergunta mais crítica de todas dependendo de uma chave de JSON sem
-- constraint. Mesmo formato de `core.training_reset_log` (20260730260000).
--
-- ── Por que `on delete restrict` nas DUAS colunas ────────────────────────────
--
-- Prova de ação não pode sumir com o usuário — e aqui há dois usuários, cada um
-- por um motivo diferente:
--
--   • `performed_by` é quem removeu o fator de outra pessoa. Com `cascade`,
--     apagar a conta do administrador apagaria o registro do que ele fez —
--     exatamente o rastro que um abuso de privilégio deixaria para trás.
--   • `target_user_id` é quem ficou sem fator. Essa linha é o que sustenta a
--     resposta a "esta conta foi destravada por quem, quando e por quê" mesmo
--     depois de a conta ser encerrada. Sem ela, o encerramento de conta vira a
--     forma mais limpa de apagar um reset indevido.
--
-- É a mesma razão de `sensitive_operation_log.actor_id` e de
-- `iefa.user_legal_acceptances.document_id` (LGPD.md): destruir a prova é pior
-- do que reter a linha.
--
-- ── `method` com check, `reason` anulável ────────────────────────────────────
--
-- Os dois métodos têm exigências diferentes, e por isso a obrigatoriedade da
-- justificativa é da APLICAÇÃO, não da coluna:
--
--   • 'recovery-code' — o próprio titular, com um código de recuperação. Não há
--     justificativa a exigir: o ato explica a si mesmo.
--   • 'admin-reset'   — `auth.admin.mfa.deleteFactor` por um administrador em
--     elevação fresca. Aí a justificativa é OBRIGATÓRIA, e quem a exige é a
--     server fn de reset. `not null` na coluna quebraria o primeiro caso; um
--     check condicional endureceria no banco uma regra de processo que muda mais
--     rápido que schema.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create table if not exists access_control.mfa_reset_log (
	id             uuid primary key default gen_random_uuid(),
	-- Quem ficou sem fator.
	target_user_id uuid not null references auth.users(id) on delete restrict,
	-- Quem executou. No autoatendimento por código, é o próprio titular.
	performed_by   uuid not null references auth.users(id) on delete restrict,
	method         text not null,
	-- Justificativa. Obrigatória em 'admin-reset' — exigida pela server fn.
	reason         text,
	created_at     timestamptz not null default now(),
	constraint mfa_reset_log_method_check
		check (method in ('recovery-code', 'admin-reset'))
);

-- "Como esta conta ficou sem fator" — a consulta da investigação, do alvo para
-- trás no tempo.
create index if not exists mfa_reset_log_target_created_idx
	on access_control.mfa_reset_log (target_user_id, created_at desc);

-- "Quem esse administrador destravou" — o outro lado da mesma pergunta, para
-- reconhecer um padrão de abuso antes que ele vire incidente.
create index if not exists mfa_reset_log_performed_by_created_idx
	on access_control.mfa_reset_log (performed_by, created_at desc);

-- RLS ligada SEM policy nenhuma: acesso exclusivo via service key, e a
-- autorização de leitura (`admin` nível 3) mora na server function. Nem `anon`
-- nem `authenticated` têm grant (20260825160953 zerou os default privileges do
-- schema), então a tabela sequer aparece no `/rest/v1/` para o portador da
-- publishable key.
alter table access_control.mfa_reset_log enable row level security;

comment on table access_control.mfa_reset_log is
	'Auditoria das remoções de segundo fator (código de recuperação ou reset administrativo). Apenas-inserção; `target_user_id` e `performed_by` são `on delete restrict` para que a prova não seja apagada junto com a conta. Acesso exclusivo via service key; leitura exige `admin` nível 3 no PBAC.';
