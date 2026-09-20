-- Prazo de validade de uma concessão de acesso.
--
-- Até aqui toda concessão era PERMANENTE: quem entrava numa política de turma, ou recebia um
-- grant inline para cobrir uma substituição, só perdia o acesso se alguém lembrasse de tirar.
-- `expires_at` dá prazo às duas origens do PBAC:
--
--   access_control.user_permissions        → grant inline (a "inline policy")
--   access_control.user_policy_attachment  → anexo de política gerenciada
--
-- SEMÂNTICA
--   null                  → nunca expira. É o default e o valor de TODA linha existente:
--                           adicionar a coluna não altera acesso nenhum.
--   expires_at > now()    → vale normalmente.
--   expires_at <= now()   → a linha é AUSENTE para a resolução, não um deny.
--
-- Ausente, não deny, é o ponto delicado: um `level 0` expirado precisa deixar de NEGAR, do
-- mesmo jeito que um allow expirado deixa de conceder. Tratar expiração como deny inverteria
-- a precedência implementada em packages/pbac/src/effective-permissions.ts — uma linha morta
-- passaria a cancelar allows vivos de outra origem. Por isso o filtro é sempre
-- `expires_at is null or expires_at > now()` na leitura, nunca uma reescrita de `level`.
--
-- A comparação é no BANCO (`now()`), nunca no processo: relógio de aplicação não é fonte da
-- verdade para autorização, e filtrar em SQL evita trazer linha morta para dentro do resolver.
--
-- Nenhum backfill, nenhuma constraint de "prazo no futuro": uma data no passado é um estado
-- legítimo (concessão que acabou) e precisa continuar editável para poder ser renovada.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

alter table access_control.user_permissions
	add column if not exists expires_at timestamptz;

alter table access_control.user_policy_attachment
	add column if not exists expires_at timestamptz;

comment on column access_control.user_permissions.expires_at is
	'Prazo do grant inline. null = nunca expira. Linha com expires_at <= now() é IGNORADA na resolução (ausente, não deny) — inclusive quando level = 0.';

comment on column access_control.user_policy_attachment.expires_at is
	'Prazo do anexo de política. null = nunca expira. Anexo com expires_at <= now() não contribui com nenhum statement na resolução.';

-- Índice parcial do caminho quente: resolver as permissões de UM usuário só olha as linhas
-- vivas. Cobre as duas metades do predicado (`is null` e `> now()`) porque indexa a coluna
-- inteira restrita ao lookup por usuário; sem o `where`, seria um índice redundante com
-- idx_user_permissions_user_id.
create index if not exists user_permissions_expiry_idx
	on access_control.user_permissions (user_id, expires_at)
	where expires_at is not null;

create index if not exists user_policy_attachment_expiry_idx
	on access_control.user_policy_attachment (user_id, expires_at)
	where expires_at is not null;
