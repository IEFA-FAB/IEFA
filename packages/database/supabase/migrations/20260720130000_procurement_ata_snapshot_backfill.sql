-- freeze-ata-snapshot-on-publish (2/2): backfill
--
-- Gera snapshot best-effort para ATAs já publicadas/arquivadas, para que ATAs
-- legadas também fiquem autocontidas. snapshot_source = 'backfill' distingue de
-- snapshots nativos (gerados no ato de publicação).
--
-- Idempotente: só insere para ATAs que ainda não têm snapshot.

-- ── seleções (resolve nome/tipo do template ainda existente) ───────────────────
insert into procurement.procurement_list_snapshot_selection
	(list_id, origin_template_id, template_name, template_type, kitchen_id, kitchen_name, repetitions, snapshot_source)
select
	lk.list_id,
	sel.template_id,
	mt.name,
	mt.template_type,
	lk.kitchen_id,
	k.display_name,
	sel.repetitions,
	'backfill'
from procurement.procurement_list_selection sel
join procurement.procurement_list_kitchen lk on lk.id = sel.list_kitchen_id
join procurement.procurement_list pl on pl.id = lk.list_id
left join kitchen.menu_template mt on mt.id = sel.template_id
left join core.kitchen k on k.id = lk.kitchen_id
where pl.status in ('published', 'archived')
	and pl.deleted_at is null
	and not exists (
		select 1 from procurement.procurement_list_snapshot_selection s where s.list_id = lk.list_id
	);

-- ── componentes (cópia dos itens agregados já persistidos) ─────────────────────
insert into procurement.procurement_list_snapshot_component
	(list_id, ingredient_id, ingredient_name, folder_description, measure_unit, total_quantity,
	 purchase_item_id, purchase_item_description, purchase_measure_unit, purchase_quantity,
	 catmat_item_codigo, unit_price, snapshot_source)
select
	li.list_id,
	li.ingredient_id,
	li.ingredient_name,
	li.folder_description,
	li.measure_unit,
	li.total_quantity,
	li.purchase_item_id,
	li.purchase_item_description,
	li.purchase_measure_unit,
	li.purchase_quantity,
	li.catmat_item_codigo,
	li.unit_price,
	'backfill'
from procurement.procurement_list_item li
join procurement.procurement_list pl on pl.id = li.list_id
where pl.status in ('published', 'archived')
	and pl.deleted_at is null
	and not exists (
		select 1 from procurement.procurement_list_snapshot_component s where s.list_id = li.list_id
	);

-- computed_at para itens legados sem carimbo: usa a criação/atualização da ATA
update procurement.procurement_list_item li
	set computed_at = coalesce(pl.updated_at, pl.created_at)
	from procurement.procurement_list pl
	where pl.id = li.list_id and li.computed_at is null;
