-- access_control_mcp_api_key_expiry
-- Prazo obrigatório nas chaves de API do servidor MCP.
--
-- ── Por que uma chave precisa vencer ─────────────────────────────────────────
--
-- `access_control.mcp_api_keys` nasceu sem prazo: uma chave criada em abril de
-- 2026 executa, hoje e para sempre, tudo que as permissões do dono alcançam —
-- sem senha, sem segundo fator e sem ninguém na frente do teclado. É o contrário
-- do que o eixo de garantia de identidade desta mudança estabelece (design.md
-- D11): a credencial mais fraca do sistema era a única sem validade.
--
-- Revogar continua sendo o caminho ATIVO (`is_active = false`). O prazo é o
-- caminho PASSIVO: a chave que ninguém lembrou de revogar — a do notebook que
-- saiu do inventário, a do cliente MCP desinstalado — para de valer sozinha.
--
-- ── `not null`, e não anulável ───────────────────────────────────────────────
--
-- Anulável com `null` = "sem prazo" deixaria a chave eterna existindo, agora com
-- a aparência de um campo preenchido por escolha. O valor que o incidente #288
-- deixou é que o caminho silencioso é o que dura anos: se a coluna aceita
-- ausência, a ausência vira o padrão de quem não pensou no assunto.
--
-- ── O `default` de 90 dias é rede de deploy, não conveniência ────────────────
--
-- Entre aplicar esta migration e subir o código que grava `expires_at`, o insert
-- antigo (sem a coluna) continua rodando em produção. Sem default ele falharia e
-- a criação de chave quebraria nessa janela. Com default ele falha FECHADO no
-- sentido certo: a chave nasce com 90 dias em vez de nascer eterna. O caminho da
-- aplicação sempre informa o prazo escolhido (30/90/365 dias) — o default nunca
-- é o que responde pela chave criada pela tela.
--
-- ── Backfill: 180 dias, e o aviso vem ANTES ─────────────────────────────────
--
-- Expirar chave em produção sem avisar é derrubar integração alheia em silêncio.
-- As chaves existentes recebem 180 dias a partir da aplicação — mais que o
-- segundo maior prazo oferecido na tela, tempo de sobra para o dono renovar. O
-- aviso tem dois canais: a tela `/diner/mcp-keys`, que destaca a chave a menos
-- de 30 dias do vencimento, e `bun run mcp-keys:notify-expiry` (apps/sisub), que
-- avisa os donos por e-mail — best-effort, como todo e-mail desta mudança
-- (design.md D16). Em 2026-09-12 havia UMA chave na base, nunca usada
-- (`last_used_at is null`), criada em 2026-04-23.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

-- 1) Coluna anulável primeiro: a tabela já tem linha, e `add column not null`
--    sem default recusaria a migration inteira.
alter table access_control.mcp_api_keys
	add column if not exists expires_at timestamptz;

-- 2) Backfill generoso das chaves que já existem (ver acima).
update access_control.mcp_api_keys
	set expires_at = now() + interval '180 days'
	where expires_at is null;

-- 3) Default de transição, para o código antigo que ainda não informa o prazo.
alter table access_control.mcp_api_keys
	alter column expires_at set default (now() + interval '90 days');

-- 4) Agora sim: sem prazo não existe chave.
alter table access_control.mcp_api_keys
	alter column expires_at set not null;

comment on column access_control.mcp_api_keys.expires_at is
	'Instante em que a chave deixa de autenticar. Obrigatório: a aplicação escolhe 30, 90 ou 365 dias na criação, e `resolveApiKey` (apps/sisub-mcp) recusa a chave vencida. O default de 90 dias cobre apenas a janela entre esta migration e o deploy do código que informa o prazo.';
