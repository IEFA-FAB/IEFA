-- ============================================================================
-- RUMAER — uniform_variant_image (imagens alternativas por peça facultativa/eventual)
-- ============================================================================
-- Uma variante (ex.: 7A · Oficiais · Masculino) tem a imagem base em
-- uniform_variant.image_path. Quando o militar usa uma peça facultativa/eventual
-- (ex.: blusa), o visual muda. Cada linha aqui é uma imagem alternativa atrelada
-- a UMA peça da composição — selecionada na página pública troca a ilustração.
-- ============================================================================

create table rumaer.uniform_variant_image (
	id uuid primary key default gen_random_uuid(),
	variant_id uuid not null references rumaer.uniform_variant (id) on delete cascade,
	piece_id uuid not null references rumaer.piece (id) on delete cascade,
	image_path text not null,
	legenda text,                     -- rótulo opcional; default = nome da peça
	ordem int not null default 0,
	created_at timestamptz not null default now(),
	unique (variant_id, piece_id)     -- uma imagem alternativa por peça na variante
);

create index uvi_variant_idx on rumaer.uniform_variant_image (variant_id);

-- ----------------------------------------------------------------------------
-- RLS — leitura pública, escrita só service_role
-- ----------------------------------------------------------------------------
alter table rumaer.uniform_variant_image enable row level security;

create policy "public read uniform_variant_image" on rumaer.uniform_variant_image
	for select to anon, authenticated using (true);

grant select on rumaer.uniform_variant_image to anon, authenticated;
grant all on rumaer.uniform_variant_image to service_role;
