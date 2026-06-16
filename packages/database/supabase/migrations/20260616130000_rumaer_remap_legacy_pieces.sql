-- Remapeia composições que apontavam para peças de seed antigas (sem código FAB,
-- não provenientes do CSV oficial) para as peças equivalentes do catálogo,
-- e faz soft-delete de TODAS as peças antigas (codigo is null) para que nenhum
-- uniforme referencie item fora do catálogo MCA 168-2.
--
-- Mapeamento (slug antigo → slug novo / código FAB):
--   abrigo-camuflado-impermeavel                    → abrigo-camuflado                       (FAB-AG-002)
--   casaco-camuflado-impermeavel-com-forro-e-capuz  → casaco-camuflado-com-forro-e-capuz     (FAB-AG-013)
--   cinto-preto                                     → cinto-azul-aeronautica-branco-ou-preto (FAB-V-047)
--   fivela-preta                                    → fivela-prateada-ou-preta               (FAB-V-050)
--   meia-preta-cano-longo                           → meia-preta-branca-de-cano-longo        (FAB-V-077)
--   poncho-camuflado-impermeavel                    → poncho-camuflado                       (FAB-AG-010)

-- 1. Repontar a composição (uniform_variant_piece) das peças antigas para as novas.
with mapping(old_slug, new_slug) as (
	values
		('abrigo-camuflado-impermeavel', 'abrigo-camuflado'),
		('casaco-camuflado-impermeavel-com-forro-e-capuz', 'casaco-camuflado-com-forro-e-capuz'),
		('cinto-preto', 'cinto-azul-aeronautica-branco-ou-preto'),
		('fivela-preta', 'fivela-prateada-ou-preta'),
		('meia-preta-cano-longo', 'meia-preta-branca-de-cano-longo'),
		('poncho-camuflado-impermeavel', 'poncho-camuflado')
)
update rumaer.uniform_variant_piece uvp
set piece_id = newp.id
from mapping m
join rumaer.piece oldp on oldp.slug = m.old_slug and oldp.codigo is null
join rumaer.piece newp on newp.slug = m.new_slug and newp.deleted_at is null
where uvp.piece_id = oldp.id;

-- 2. Repontar imagens de variante (caso existam) das peças antigas para as novas.
with mapping(old_slug, new_slug) as (
	values
		('abrigo-camuflado-impermeavel', 'abrigo-camuflado'),
		('casaco-camuflado-impermeavel-com-forro-e-capuz', 'casaco-camuflado-com-forro-e-capuz'),
		('cinto-preto', 'cinto-azul-aeronautica-branco-ou-preto'),
		('fivela-preta', 'fivela-prateada-ou-preta'),
		('meia-preta-cano-longo', 'meia-preta-branca-de-cano-longo'),
		('poncho-camuflado-impermeavel', 'poncho-camuflado')
)
update rumaer.uniform_variant_image uvi
set piece_id = newp.id
from mapping m
join rumaer.piece oldp on oldp.slug = m.old_slug and oldp.codigo is null
join rumaer.piece newp on newp.slug = m.new_slug and newp.deleted_at is null
where uvi.piece_id = oldp.id;

-- 3. Soft-delete de todas as peças antigas (seed pré-CSV, sem código FAB).
update rumaer.piece
set deleted_at = now()
where codigo is null and deleted_at is null;
