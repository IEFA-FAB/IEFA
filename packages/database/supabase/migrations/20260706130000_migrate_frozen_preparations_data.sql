-- Backfill + repoint: move as preparações congeladas hoje cadastradas como
-- kitchen.ingredient (sob as pastas raiz "Preparações"/"Pratos Prontos"/"Lanches
-- Prontos") para kitchen.frozen_preparation, preservando qualquer vínculo existente
-- em fichas técnicas. Transacional: nada de referências repointadas com o insumo já
-- deletado (ou vice-versa). Idempotente via source_ingredient_id.
--
-- ─── DIAGNÓSTICO (rodar ANTES, read-only, p/ dimensionar) ─────────────────────
-- Descomente e rode isoladamente pra saber quantos itens/refs existem:
--
-- with recursive roots as (
--   select id from kitchen.folder
--   where parent_id is null and deleted_at is null
--     and (description ~* '^prepara[çc][õo]es' or description ~* '^pratos?\s+prontos?'
--       or description ~* '^lanches?\s+prontos?')
-- ), subtree as (
--   select id from kitchen.folder where id in (select id from roots)
--   union all
--   select f.id from kitchen.folder f join subtree s on f.parent_id = s.id where f.deleted_at is null
-- ), fp_ing as (
--   select i.id from kitchen.ingredient i
--   where i.folder_id in (select id from subtree) and i.deleted_at is null
-- )
-- select
--   (select count(*) from fp_ing) as candidatos,
--   (select count(*) from kitchen.recipe_ingredients ri where ri.ingredient_id in (select id from fp_ing) and ri.deleted_at is null) as em_fichas,
--   (select count(*) from kitchen.recipe_ingredient_alternatives ria where ria.ingredient_id in (select id from fp_ing)) as em_alternativas,
--   (select count(*) from kitchen.ingredient_item ii where ii.ingredient_id in (select id from fp_ing) and ii.deleted_at is null) as com_produto,
--   (select count(*) from procurement.purchase_item_ingredient pii where pii.ingredient_id in (select id from fp_ing)) as com_compra;

begin;

-- ─── Fase 2: backfill (1 linha por insumo candidato) ─────────────────────────
-- Resolve a categoria pela pasta raiz da subárvore de cada insumo.
with recursive folder_tree as (
	select id,
		case
			when description ~* '^prepara[çc][õo]es'   then 'preparacao'
			when description ~* '^pratos?\s+prontos?'  then 'prato_pronto'
			when description ~* '^lanches?\s+prontos?' then 'lanche_pronto'
		end as category
	from kitchen.folder
	where parent_id is null and deleted_at is null
		and (description ~* '^prepara[çc][õo]es'
			or description ~* '^pratos?\s+prontos?'
			or description ~* '^lanches?\s+prontos?')
	union all
	select f.id, ft.category
	from kitchen.folder f
	join folder_tree ft on f.parent_id = ft.id
	where f.deleted_at is null
)
insert into kitchen.frozen_preparation
	(description, measure_unit, correction_factor, density_factor,
	 ceafa_id, legacy_id, source_ingredient_id, category, created_at)
select
	coalesce(i.description, '(sem nome)'),
	i.measure_unit, i.correction_factor, i.density_factor,
	i.ceafa_id, i.legacy_id, i.id, ft.category, i.created_at
from kitchen.ingredient i
join folder_tree ft on ft.id = i.folder_id
where i.deleted_at is null
	-- Edge raro: insumo comprado (frigorífico) miscategorizado — NÃO migrar, deixar
	-- como ingredient p/ revisão manual (mantém o vínculo de compra vivo).
	and not exists (select 1 from procurement.purchase_item_ingredient pii where pii.ingredient_id = i.id)
	and not exists (select 1 from kitchen.frozen_preparation fp where fp.source_ingredient_id = i.id);

-- ─── Fase 3: repoint das referências (preserva uso) ──────────────────────────
update kitchen.recipe_ingredients ri
set frozen_preparation_id = fp.id, ingredient_id = null
from kitchen.frozen_preparation fp
where fp.source_ingredient_id = ri.ingredient_id
	and ri.frozen_preparation_id is null;

update kitchen.recipe_ingredient_alternatives ria
set frozen_preparation_id = fp.id, ingredient_id = null
from kitchen.frozen_preparation fp
where fp.source_ingredient_id = ria.ingredient_id
	and ria.frozen_preparation_id is null;
-- recipe_step_input: sem update — referencia recipe_ingredient_id (pega carona).

-- ─── Fase 4: soft-delete dos insumos migrados + pastas raiz esvaziadas ────────
update kitchen.ingredient i
set deleted_at = now()
where i.deleted_at is null
	and exists (select 1 from kitchen.frozen_preparation fp where fp.source_ingredient_id = i.id);

-- Soft-delete as 3 pastas raiz (e subpastas) agora sem insumos vivos.
update kitchen.folder f
set deleted_at = now()
where f.deleted_at is null
	and f.id in (
		with recursive roots as (
			select id from kitchen.folder
			where parent_id is null and deleted_at is null
				and (description ~* '^prepara[çc][õo]es'
					or description ~* '^pratos?\s+prontos?'
					or description ~* '^lanches?\s+prontos?')
		), subtree as (
			select id from kitchen.folder where id in (select id from roots)
			union all
			select c.id from kitchen.folder c join subtree s on c.parent_id = s.id
		)
		select id from subtree
	)
	-- só se não sobrou nenhum insumo vivo na pasta (edge de compra preservado)
	and not exists (
		select 1 from kitchen.ingredient i where i.folder_id = f.id and i.deleted_at is null
	);

-- ─── Fase 5: valida os XOR (agora que o repoint zerou os pares conflitantes) ──
alter table kitchen.recipe_ingredients            validate constraint recipe_ingredients_source_xor;
alter table kitchen.recipe_ingredient_alternatives validate constraint recipe_ingredient_alt_source_xor;

commit;
