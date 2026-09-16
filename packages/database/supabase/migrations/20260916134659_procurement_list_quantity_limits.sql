-- Limites do anexo de quantitativos da ATA: quantidade máxima e mínima por pedido.
--
-- A ATA interna só guardava o ALVO (o que o cardápio projeta para a vigência). O anexo da
-- ata de registro de preços pede duas grandezas que o alvo não é:
--
--   • quantidade MÁXIMA registrada — alvo + margem percentual. Registrar o alvo cru faz
--     qualquer anormalidade (perda de estoque, fornecedor que para de entregar e empurra a
--     demanda para o substituto) esgotar a ata no meio da vigência, e a ata não admite
--     acréscimo depois (Decreto 11.462/2023, art. 23);
--   • quantidade MÍNIMA por pedido — dimensionada pelo ciclo de entrega do item (semanal
--     ou mensal), não pela vigência.
--
-- O banco guarda as ESCOLHAS (margem, ciclo, mínimo informado, justificativa). Máxima e
-- mínima sugerida são derivadas em `@iefa/sisub-domain` (`ata-quantity-limits.ts`) — mesmo
-- motivo de `total_value` ter saído de `procurement_list_item` em 20260512. A exceção é o
-- snapshot, que congela os números resolvidos na publicação.
--
-- `smallint` em percentual pelo motivo de sempre: `numeric` volta STRING pelo PostgREST.
-- O vocabulário do ciclo é espelhado em `DELIVERY_CYCLES` e conferido por
-- `ata-quantity-limits.sql-contract.test.ts`.

-- ─── Insumo: ciclo de entrega padrão ─────────────────────────────────────────
-- Perecível (salada, fruta, verdura) entra toda semana; não perecível, uma vez por mês.
-- Null = não classificado: a ata cai para a conservação do item de compra e, sem ela, mensal.
alter table kitchen.ingredient
	add column if not exists default_delivery_cycle text;

alter table kitchen.ingredient
	drop constraint if exists ingredient_default_delivery_cycle_check,
	add constraint ingredient_default_delivery_cycle_check
		check (default_delivery_cycle is null or default_delivery_cycle in ('weekly', 'monthly'));

comment on column kitchen.ingredient.default_delivery_cycle is
	'Ciclo de entrega padrão do insumo nas ATAs (weekly = perecível, monthly = não perecível). O ciclo efetivo de cada ata fica em procurement_list_item.delivery_cycle.';

-- ─── ATA: margem padrão e justificativa ──────────────────────────────────────
alter table procurement.procurement_list
	add column if not exists max_margin_percent smallint not null default 20,
	add column if not exists margin_justification text;

alter table procurement.procurement_list
	drop constraint if exists procurement_list_max_margin_percent_check,
	add constraint procurement_list_max_margin_percent_check
		check (max_margin_percent between 0 and 100);

comment on column procurement.procurement_list.max_margin_percent is
	'Margem padrão da quantidade máxima sobre o alvo planejado, em %. O item pode sobrescrever.';
comment on column procurement.procurement_list.margin_justification is
	'Justificativa única da ata para os itens com margem acima da referência. Exigida na publicação.';

-- ─── Item da ATA: o que foi escolhido nesta ata ──────────────────────────────
-- `delivery_cycle` nasce do padrão do insumo no cálculo e é GRAVADO: mudar o insumo depois
-- não muda o ciclo de uma ata já montada. Null só nas linhas anteriores a esta migration.
alter table procurement.procurement_list_item
	add column if not exists max_margin_percent smallint,
	add column if not exists delivery_cycle text,
	add column if not exists min_order_quantity numeric(14,4);

alter table procurement.procurement_list_item
	drop constraint if exists procurement_list_item_max_margin_percent_check,
	add constraint procurement_list_item_max_margin_percent_check
		check (max_margin_percent is null or max_margin_percent between 0 and 100);

alter table procurement.procurement_list_item
	drop constraint if exists procurement_list_item_delivery_cycle_check,
	add constraint procurement_list_item_delivery_cycle_check
		check (delivery_cycle is null or delivery_cycle in ('weekly', 'monthly'));

alter table procurement.procurement_list_item
	drop constraint if exists procurement_list_item_min_order_quantity_check,
	add constraint procurement_list_item_min_order_quantity_check
		check (min_order_quantity is null or min_order_quantity > 0);

-- ─── Snapshot: números resolvidos na publicação ──────────────────────────────
-- Nulos nas linhas congeladas antes desta migration: aquelas atas foram publicadas sem
-- limites, e inventá-los agora seria reescrever o documento publicado.
alter table procurement.procurement_list_snapshot_component
	add column if not exists max_margin_percent smallint,
	add column if not exists max_quantity numeric(14,4),
	add column if not exists delivery_cycle text,
	add column if not exists min_order_quantity numeric(14,4);
