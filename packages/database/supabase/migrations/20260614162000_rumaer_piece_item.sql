-- ============================================================================
-- RUMAER — piece_item (item de venda concreto)
-- ============================================================================
-- Distinção:
--   piece       = item do uniforme abstrato (platina, sapato, quepe, meia)
--   piece_item  = item de venda concreto / comprável (sapato 43,
--                 platina de capitão intendente, meia preta)
--
-- Atributos diferenciadores ficam em colunas estruturadas (tamanho, cor,
-- posto, quadro, especialidade, genero). Sem preço/estoque por ora (catálogo).
--
-- A composição (uniform_variant_piece) ganha piece_item_id opcional: quando o
-- regulamento fixa um item concreto a linha aponta pra ele; quando varia por
-- posto (ex.: platina) fica null e a peça abstrata + restricao_posto resolvem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- piece_item — variante comprável de uma peça
-- ----------------------------------------------------------------------------
create table rumaer.piece_item (
	id uuid primary key default gen_random_uuid(),
	piece_id uuid not null references rumaer.piece (id) on delete cascade,
	nome text not null,               -- ex.: "Sapato 43", "Platina de Capitão Intendente"
	tamanho text,                     -- ex.: "43", "P", "M", "G"
	cor text,                         -- ex.: "preta", "branca"
	posto text,                       -- ex.: "capitão" (insígnias)
	quadro text,                      -- ex.: "intendente"
	especialidade text,               -- ex.: "combate"
	genero rumaer.genero,             -- masculino / feminino / unissex (quando aplicável)
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);

create trigger piece_item_set_updated_at
	before update on rumaer.piece_item
	for each row execute function rumaer.set_updated_at();

create index piece_item_piece_idx on rumaer.piece_item (piece_id) where deleted_at is null;

-- Nome único por peça-pai (ignorando soft-deletados).
create unique index piece_item_piece_nome_uidx
	on rumaer.piece_item (piece_id, nome) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- uniform_variant_piece — apontar (opcionalmente) pro item concreto
-- ----------------------------------------------------------------------------
alter table rumaer.uniform_variant_piece
	add column piece_item_id uuid references rumaer.piece_item (id) on delete set null;

create index uvp_piece_item_idx on rumaer.uniform_variant_piece (piece_item_id);

-- ----------------------------------------------------------------------------
-- RLS — leitura pública, escrita só service_role
-- ----------------------------------------------------------------------------
alter table rumaer.piece_item enable row level security;

create policy "public read piece_item" on rumaer.piece_item
	for select to anon, authenticated using (true);

-- Grants explícitos (consistente com a migration base do schema).
grant select on rumaer.piece_item to anon, authenticated;
grant all on rumaer.piece_item to service_role;
