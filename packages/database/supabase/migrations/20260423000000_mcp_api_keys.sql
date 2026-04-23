-- Chaves de API por usuário para autenticação no sisub-mcp server.
-- Substitui o JWT Supabase: clientes MCP (Claude, Cursor) usam x-api-key.
-- A chave real (rawKey) nunca é armazenada — apenas seu SHA-256 (key_hash).

create table sisub.mcp_api_keys (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  label        text        not null,
  key_hash     text        not null unique,
  key_prefix   text        not null,
  is_active    boolean     not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Index para lookup rápido no MCP server (hot path a cada request)
create index mcp_api_keys_hash_active_idx
  on sisub.mcp_api_keys (key_hash)
  where is_active = true;

-- RLS: usuários gerenciam apenas suas próprias chaves
alter table sisub.mcp_api_keys enable row level security;

create policy "mcp_api_keys: owner access"
  on sisub.mcp_api_keys
  for all
  using (auth.uid() = user_id);
