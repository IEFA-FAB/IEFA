-- Anexo quantitativo: `procurement_list*` → `quantity_estimate*` — fase CONTRACT de 20260927040000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos
-- (`quantity_estimate*`, `quantity_estimate_id`, `quantity_estimate_item_id`,
-- `max_increase_percent`, `max_quantity_justification`, `estimated_quantity`, status
-- `completed`). Aplicada antes, derruba em produção o código que ainda lê as views de
-- compatibilidade ou escreve as colunas antigas. Conferir no CI/CD da `main` que o deploy do PR
-- do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo:
--
--   * as seis views `procurement.procurement_list*`;
--   * os triggers e as funções de espelho;
--   * as colunas `procurement_list_id` (procurement_arp, procurement_pesquisa_preco),
--     `procurement_list_item_id` (procurement_arp_item, procurement_pesquisa_preco_item) e
--     `list_id` (price_research_emission, kitchen_demand_forecast_import), que levam junto as FKs,
--     os índices, o unique `(list_id, sequence)` da emissão e a PK `(forecast_id, list_id)` da
--     importação — recriada sobre `quantity_estimate_id`;
--   * o valor antigo do status: `published` vira `completed`, e o CHECK aceita só o vocabulário
--     do glossário.
--
-- E recria `core.v_measure_unit_review` com o rótulo do nome novo da tabela
-- (`'procurement.quantity_estimate_item'`), que o leitor (`global/review-queues.tsx`) já entende.

-- Nada além do espelho pode citar as colunas que caem: função plpgsql não cria dependência de
-- coluna, então o `drop column` passaria e ela quebraria só quando rodasse, em produção.
do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.proname not in ('mirror_quantity_estimate_id', 'mirror_quantity_estimate_item_id', 'mirror_quantity_estimate_id_from_list_id')
		and (
			coalesce(p.prosrc, '') ~ '\m(procurement_list\w*|list_id|list_kitchen_id|max_margin_percent|margin_justification|total_quantity)\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\m(procurement_list\w*|list_id)\M'
		);
	if offenders is not null then
		raise exception 'funções citam colunas ou views que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || coalesce(with_check, '') ~ '\m(procurement_list\w*|list_id)\M';
	if offenders is not null then
		raise exception 'policies citam colunas ou views que este contract derruba: %', offenders;
	end if;
end;
$$;

-- O espelho garante colunas iguais; se não estiverem, algo escreveu por fora dele e a coluna
-- antiga tem dado que a nova não tem. Para, em vez de perder o vínculo.
do $$
declare
	diverging text;
begin
	select string_agg(t, ', ') into diverging
	from (
		select 'procurement_arp' as t
		where exists (select 1 from procurement.procurement_arp where procurement_list_id is distinct from quantity_estimate_id)
		union all
		select 'procurement_arp_item'
		where exists (select 1 from procurement.procurement_arp_item where procurement_list_item_id is distinct from quantity_estimate_item_id)
		union all
		select 'procurement_pesquisa_preco'
		where exists (select 1 from procurement.procurement_pesquisa_preco where procurement_list_id is distinct from quantity_estimate_id)
		union all
		select 'procurement_pesquisa_preco_item'
		where exists (select 1 from procurement.procurement_pesquisa_preco_item where procurement_list_item_id is distinct from quantity_estimate_item_id)
		union all
		select 'price_research_emission' where exists (select 1 from procurement.price_research_emission where list_id is distinct from quantity_estimate_id)
		union all
		select 'kitchen_demand_forecast_import'
		where exists (select 1 from procurement.kitchen_demand_forecast_import where list_id is distinct from quantity_estimate_id)
	) d;
	if diverging is not null then
		raise exception 'coluna antiga e nova divergem em: %', diverging;
	end if;
end;
$$;

-- ─── 1. Views de compatibilidade ─────────────────────────────────────────────────

drop view procurement.procurement_list_snapshot_selection;
drop view procurement.procurement_list_snapshot_component;
drop view procurement.procurement_list_selection;
drop view procurement.procurement_list_kitchen;
drop view procurement.procurement_list_item;
drop view procurement.procurement_list;

-- ─── 2. Espelhos e colunas antigas ───────────────────────────────────────────────

drop trigger procurement_arp_mirror_quantity_estimate_id on procurement.procurement_arp;
drop trigger procurement_arp_item_mirror_quantity_estimate_item_id on procurement.procurement_arp_item;
drop trigger procurement_pesquisa_preco_mirror_quantity_estimate_id on procurement.procurement_pesquisa_preco;
drop trigger procurement_pesquisa_preco_item_mirror_quantity_estimate_item on procurement.procurement_pesquisa_preco_item;
drop trigger price_research_emission_mirror_quantity_estimate_id on procurement.price_research_emission;
drop trigger kitchen_demand_forecast_import_mirror_quantity_estimate_id on procurement.kitchen_demand_forecast_import;
drop function procurement.mirror_quantity_estimate_id();
drop function procurement.mirror_quantity_estimate_item_id();
drop function procurement.mirror_quantity_estimate_id_from_list_id();

alter table procurement.procurement_arp drop column procurement_list_id;
alter table procurement.procurement_arp_item drop column procurement_list_item_id;
alter table procurement.procurement_pesquisa_preco drop column procurement_list_id;
alter table procurement.procurement_pesquisa_preco_item drop column procurement_list_item_id;
alter table procurement.price_research_emission drop column list_id;

-- A PK (forecast_id, list_id) cai com a coluna; o índice único do expand vira a PK, com o nome
-- dela, sem reconstruir o índice.
alter table procurement.kitchen_demand_forecast_import drop column list_id;
alter table procurement.kitchen_demand_forecast_import
	add constraint kitchen_demand_forecast_import_pkey primary key using index kitchen_demand_forecast_import_quantity_estimate_key;

-- ─── 3. Status: só o vocabulário do glossário ────────────────────────────────────

update procurement.quantity_estimate set status = 'completed' where status = 'published';
alter table procurement.quantity_estimate drop constraint quantity_estimate_status_check;
alter table procurement.quantity_estimate
	add constraint quantity_estimate_status_check check (status = any (array['draft', 'completed', 'archived']));

comment on table procurement.quantity_estimate is
	'Anexo quantitativo do termo de referência: a estimativa das quantidades (Lei 14.133, art. 18, § 1º, IV). Não é ata: só a Ata de Registro de Preços é ata (art. 6º, XLVI). status: draft → completed (concluído) → archived.';

-- ─── 4. Fila de revisão de unidades com o nome novo da tabela ─────────────────────

create or replace view core.v_measure_unit_review
with (security_invoker = true) as
select
	'kitchen.ingredient'::text as source_table,
	ingredient.id::text as source_id,
	coalesce(ingredient.description, ''::text) as source_description,
	ingredient.measure_unit as raw_value
from kitchen.ingredient
where
	ingredient.deleted_at is null
	and ingredient.measure_unit is not null
	and not (ingredient.measure_unit in (select measure_unit.code from core.measure_unit))
union all
select
	'kitchen.ingredient_item'::text as source_table,
	ingredient_item.id::text as source_id,
	coalesce(ingredient_item.description, ''::text) as source_description,
	ingredient_item.purchase_measure_unit as raw_value
from kitchen.ingredient_item
where
	ingredient_item.deleted_at is null
	and ingredient_item.purchase_measure_unit is not null
	and not (ingredient_item.purchase_measure_unit in (select measure_unit.code from core.measure_unit))
union all
select
	'procurement.purchase_item'::text as source_table,
	purchase_item.id::text as source_id,
	purchase_item.description as source_description,
	purchase_item.purchase_measure_unit as raw_value
from procurement.purchase_item
where
	purchase_item.deleted_at is null
	and purchase_item.purchase_measure_unit is not null
	and not (purchase_item.purchase_measure_unit in (select measure_unit.code from core.measure_unit))
union all
select
	'procurement.quantity_estimate_item'::text as source_table,
	quantity_estimate_item.id::text as source_id,
	quantity_estimate_item.ingredient_name as source_description,
	quantity_estimate_item.measure_unit as raw_value
from procurement.quantity_estimate_item
where
	quantity_estimate_item.measure_unit is not null
	and not (quantity_estimate_item.measure_unit in (select measure_unit.code from core.measure_unit))
union all
select
	'procurement.quantity_estimate_item (compra)'::text as source_table,
	quantity_estimate_item.id::text as source_id,
	quantity_estimate_item.ingredient_name as source_description,
	quantity_estimate_item.purchase_measure_unit as raw_value
from procurement.quantity_estimate_item
where
	quantity_estimate_item.purchase_measure_unit is not null
	and not (quantity_estimate_item.purchase_measure_unit in (select measure_unit.code from core.measure_unit));
