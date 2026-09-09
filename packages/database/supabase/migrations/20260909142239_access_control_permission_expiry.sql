-- Prazo de validade para concessões de acesso.
--
-- Até aqui toda concessão era PERMANENTE: nem o grant inline
-- (`access_control.user_permissions`) nem o anexo de política gerenciada
-- (`access_control.user_policy_attachment`) tinham como caducar. O gatilho foi o
-- "Conjunto Parceiro Externo" (`global:1`), anexado a parceiros da GS1: sem prazo, o
-- acesso de um terceiro só some quando alguém lembra de revogar.
--
-- Semântica:
--   NULL          → nunca expira. É o default e o valor de TODAS as linhas existentes,
--                   então a migration não muda o comportamento de ninguém.
--   expires_at    → a linha vale enquanto `expires_at > now()`.
--
-- Linha expirada é AUSENTE, não deny: a resolução simplesmente não a lê. Um `level 0`
-- (deny) expirado deixa de negar, e um allow expirado deixa de conceder. Transformar
-- expiração em deny mudaria a precedência de `packages/pbac/src/effective-permissions.ts`,
-- onde deny vence allow venha de onde vier.
--
-- A comparação é sempre no banco (`now()`), nunca no relógio do processo: relógio de
-- aplicação não é fonte da verdade para autorização.

alter table access_control.user_permissions
	add column if not exists expires_at timestamptz;

alter table access_control.user_policy_attachment
	add column if not exists expires_at timestamptz;

comment on column access_control.user_permissions.expires_at is
	'Instante em que este grant deixa de valer. NULL = nunca expira. Linha expirada é ignorada pela resolução (ausente, não deny).';

comment on column access_control.user_policy_attachment.expires_at is
	'Instante em que este anexo de política deixa de valer. NULL = nunca expira. Anexo expirado não contribui statement nenhum (ausente, não deny).';

-- Índices parciais: só as linhas COM prazo entram.
--
-- Eles NÃO servem à resolução: o predicado dela é
-- `user_id = $1 AND (expires_at IS NULL OR expires_at > now())`, cujo ramo `IS NULL` um
-- índice parcial que exclui NULLs não cobre — esse caminho segue no índice por `user_id`,
-- e o conjunto por usuário é pequeno o bastante para o filtro sair de graça.
-- O que estes índices atendem é a varredura por prazo ("o que vence nos próximos 30 dias"),
-- onde as linhas com prazo são a minoria da tabela.
create index if not exists user_permissions_expires_at_idx
	on access_control.user_permissions (expires_at)
	where expires_at is not null;

create index if not exists user_policy_attachment_expires_at_idx
	on access_control.user_policy_attachment (expires_at)
	where expires_at is not null;
