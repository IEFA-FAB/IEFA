-- Migration: Add catmat_item_descricao denormalized column to product table
--
-- Context: product.catmat_item_codigo references compras_material_item (340k+ records).
-- Denormalizing the description here avoids a JOIN on every product load/list view.
-- CATMAT items are a stable government catalog — descriptions rarely change.
-- When the user re-links a product to a CATMAT item, the description is refreshed.

alter table sisub.product
  add column if not exists catmat_item_descricao text null;

comment on column sisub.product.catmat_item_descricao is
  'Descrição desnormalizada de compras_material_item.descricao_item. '
  'Atualizada automaticamente ao vincular/alterar o código CATMAT do produto. '
  'Evita JOIN com a tabela de 340k+ itens em leituras frequentes.';

-- ---------------------------------------------------------------------------
-- Performance: trigram index for fast ILIKE searches on CATMAT descriptions
-- Requires pg_trgm. In Supabase, enable via Dashboard → Database → Extensions
-- or the command below (needs superuser / rds_superuser).
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm schema extensions;

create index if not exists idx_compras_material_item_descricao_trgm
  on sisub.compras_material_item
  using gin (descricao_item gin_trgm_ops);
