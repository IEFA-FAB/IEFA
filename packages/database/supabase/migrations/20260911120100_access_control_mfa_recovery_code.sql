-- access_control_mfa_recovery_code
-- Códigos de recuperação de segundo fator (uso único, guardados só em hash).
--
-- ── Por que construir isto ───────────────────────────────────────────────────
--
-- O Supabase NÃO tem códigos de recuperação nativos, e `mfa.unenroll()` exige
-- AAL2: quem perde o dispositivo não consegue remover o próprio fator. O
-- troubleshooting oficial diz, com todas as letras, que a conta fica
-- irrecuperável. Sem esta tabela, cadastrar TOTP seria trocar o risco de conta
-- tomada pelo risco de conta perdida.
--
-- ── O que o código faz, e o que ele NÃO faz ──────────────────────────────────
--
-- Consumir um código REMOVE o fator e obriga recadastro. Ele não forja AAL2 e
-- não vira credencial de elevação: um hook de token que emitisse `aal2` mentiria
-- sobre a garantia e contaminaria toda decisão a jusante.
--
-- ── Por que só o hash, e por que SHA-256 basta ───────────────────────────────
--
-- Mesmo padrão de `access_control.mcp_api_keys.key_hash`: o código em claro
-- existe uma única vez, na tela que o usuário copia/imprime. O que persiste é o
-- SHA-256. Não é senha de humano — é aleatório de alta entropia, então não há
-- espaço de busca para o hash lento defender.
--
-- `code_hash` é UNIQUE no banco (e não só no código): dois códigos iguais
-- tornariam ambíguo qual linha marcar como usada, e uso único ambíguo não é uso
-- único. A unicidade é global de propósito — colisão entre usuários diferentes
-- também é colisão.
--
-- ── Por que `on delete cascade` aqui, ao contrário dos logs ──────────────────
--
-- Este é o único dos três que cascateia. Código de recuperação é CREDENCIAL, não
-- prova: sem o usuário ele não abre nada e guardá-lo seria reter segredo órfão.
-- Os dois logs (`sensitive_operation_log`, `mfa_reset_log`) usam `restrict`
-- justamente porque são a prova do que foi feito.
--
-- ── `used_at` em vez de delete ───────────────────────────────────────────────
--
-- Marcar em vez de apagar mantém o histórico de "este código foi usado, nesta
-- data" e evita que a mesma linha seja reemitida. Regeração invalida os
-- anteriores; isso é responsabilidade da operation, não do banco.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create table if not exists access_control.mfa_recovery_code (
	id         uuid primary key default gen_random_uuid(),
	user_id    uuid not null references auth.users(id) on delete cascade,
	-- SHA-256 do código em claro, em hex. Mesmo padrão de `mcp_api_keys.key_hash`.
	code_hash  text not null unique,
	-- NULL = disponível. Preenchido no consumo, e a linha nunca volta a ser válida.
	used_at    timestamptz,
	created_at timestamptz not null default now()
);

-- Lookup do fluxo de recuperação: "os códigos ainda válidos deste usuário".
-- Índice PARCIAL — código já usado nunca entra numa validação, então mantê-lo no
-- índice só engordaria a árvore que o caminho quente percorre.
create index if not exists mfa_recovery_code_user_unused_idx
	on access_control.mfa_recovery_code (user_id)
	where used_at is null;

alter table access_control.mfa_recovery_code enable row level security;

-- Policy de DONO, só para SELECT — cinto adicional, nunca o cinto principal.
--
-- Duas coisas que esta policy deliberadamente NÃO é:
--
--   1. Não é o controle de acesso real. O fluxo de recuperação roda em server
--      function com service key, que ignora RLS; a autorização mora ali.
--   2. Não é, hoje, um caminho alcançável. A migration 20260825160953 revogou
--      todos os grants de `anon`/`authenticated` no schema e zerou os default
--      privileges, então tabela nova nasce sem `grant select` — sem grant, a
--      policy não é sequer avaliada. Ela fica escrita para que, se alguém um dia
--      conceder leitura a `authenticated`, o default já seja "só o dono", e não
--      "todo mundo logado" (o erro que as policies `auth read *` do sucont
--      cometeram e que a 20260825160953 teve que desfazer).
--
-- Só SELECT: inserir, marcar como usado e regerar são atos do fluxo de
-- recuperação e passam pelo domínio. Uma policy `for all` deixaria o titular
-- marcar o próprio código como usado — ou apagá-lo — por fora do fluxo.
-- `anon` fica de fora: não há leitura sem sessão aqui.
drop policy if exists "mfa_recovery_code: owner read" on access_control.mfa_recovery_code;
create policy "mfa_recovery_code: owner read"
	on access_control.mfa_recovery_code
	for select
	to authenticated
	using ((select auth.uid()) = user_id);

comment on table access_control.mfa_recovery_code is
	'Códigos de recuperação de MFA: uso único, persistidos só como SHA-256. Consumir um código REMOVE o fator e obriga recadastro — ele não produz AAL2. Acesso de escrita exclusivo via service key; a policy de dono cobre apenas SELECT.';
