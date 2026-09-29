-- ============================================================================
-- Cardápio: global relativo, local absoluto; apoio com refeições próprias
-- ============================================================================
-- Change `sisub-menu-composition-relative-quantities`.
--
-- 1. O modelo GLOBAL (kitchen_id nulo, catálogo da SDAB) guarda só quantidade
--    relativa: proporção por preparação e quantidade de preparações por grupo.
--    Pax (headcount_override), efetivo de refeição (base_headcount) e
--    ocorrências por mês são da cozinha. Antes, só o editor global do semanal
--    escondia esses campos; o evento e o apoio globais os aceitavam, e a cópia
--    levava o número da SDAB como se fosse da cozinha.
-- 2. A proporção passa a ser também "porções por kit" no apoio (÷ 100): o teto
--    sobe de 300 para 1000 (10 porções). O domínio mantém 300 no semanal e no
--    evento. O padrão de lanche guardava porções por kit em headcount_override;
--    o valor vai para recommended_proportion.
-- 3. O apoio passa a usar as refeições próprias do evento
--    (menu_template_event_meal): uma refeição por horário dos itens, sem grupos
--    (o "kit" simples). O nome da tabela fica por ora (design D2).
--
-- Dados em 2026-09-29: 1 item com pax num modelo global excluído; 0 padrões de
-- lanche; 0 itens de apoio. Nenhuma tabela nova: nada a declarar no guard de
-- reset de treino.
-- ============================================================================

begin;

-- ── 1. Porções por kit do padrão de lanche e limpeza dos absolutos globais ─

-- Proporção até 1000 antes de mover as porções por kit para ela.
alter table kitchen.menu_template_items
	drop constraint menu_template_items_recommended_proportion_range,
	add constraint menu_template_items_recommended_proportion_range
	check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 1000));

alter table kitchen.menu_items
	drop constraint menu_items_recommended_proportion_range,
	add constraint menu_items_recommended_proportion_range
	check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 1000));

-- Padrão de lanche (da cozinha OU global): as porções por kit moravam no pax e vão para a
-- proporção (× 100). ANTES da limpeza abaixo, que zeraria o pax do padrão global e levaria as
-- porções junto. Proporção já preenchida vence, como na leitura (`portionsPerKit`).
update kitchen.menu_template_items i
set recommended_proportion = coalesce(i.recommended_proportion, least(i.headcount_override * 100, 1000)),
	headcount_override = null
from kitchen.menu_template t
where t.id = i.menu_template_id
	and t.snack_family is not null
	and i.headcount_override is not null;


update kitchen.menu_template_items i
set headcount_override = null
from kitchen.menu_template t
where t.id = i.menu_template_id
	and t.kitchen_id is null
	and i.headcount_override is not null;

update kitchen.menu_template_meal m
set base_headcount = null
from kitchen.menu_template t
where t.id = m.menu_template_id
	and t.kitchen_id is null
	and m.base_headcount is not null;

update kitchen.menu_template_event_meal m
set base_headcount = null
from kitchen.menu_template t
where t.id = m.menu_template_id
	and t.kitchen_id is null
	and m.base_headcount is not null;

update kitchen.menu_template
set expected_monthly_occurrences = null
where kitchen_id is null
	and expected_monthly_occurrences is not null;

-- ── 2. A regra no banco ────────────────────────────────────────────────────

alter table kitchen.menu_template
	add constraint menu_template_global_without_occurrences
	check (kitchen_id is not null or expected_monthly_occurrences is null);

-- Uma função por tabela: em plpgsql, ler um campo que o registro não tem falha
-- mesmo no ramo não executado.
create function kitchen.menu_template_items_relative_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.headcount_override is not null
		and exists (select 1 from kitchen.menu_template t where t.id = new.menu_template_id and t.kitchen_id is null)
	then
		raise exception using
			errcode = '23514',
			message = 'GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY: modelo global não guarda pax de preparação',
			hint = 'O pax é da cozinha: informe-o ao adaptar ou aplicar o modelo.';
	end if;
	return new;
end;
$$;

create function kitchen.menu_template_meal_relative_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.base_headcount is not null
		and exists (select 1 from kitchen.menu_template t where t.id = new.menu_template_id and t.kitchen_id is null)
	then
		raise exception using
			errcode = '23514',
			message = 'GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY: modelo global não guarda efetivo de refeição',
			hint = 'O efetivo é da cozinha: informe-o ao adaptar ou aplicar o modelo.';
	end if;
	return new;
end;
$$;

create trigger menu_template_items_relative_only
	before insert or update of headcount_override, menu_template_id on kitchen.menu_template_items
	for each row execute function kitchen.menu_template_items_relative_only();

create trigger menu_template_meal_relative_only
	before insert or update of base_headcount, menu_template_id on kitchen.menu_template_meal
	for each row execute function kitchen.menu_template_meal_relative_only();

create trigger menu_template_event_meal_relative_only
	before insert or update of base_headcount, menu_template_id on kitchen.menu_template_event_meal
	for each row execute function kitchen.menu_template_meal_relative_only();

-- ── 3. Apoio com refeições próprias ────────────────────────────────────────

create temporary table _support_meal_backfill on commit drop as
select
	gen_random_uuid() as id,
	src.menu_template_id,
	src.meal_type_id,
	case
		when count(*) over (partition by src.menu_template_id) > 1 then 'Kit — ' || coalesce(nullif(btrim(mt.name), ''), 'Refeição')
		else 'Kit'
	end as name,
	(row_number() over (partition by src.menu_template_id order by mt.sort_order nulls last, mt.name, mt.id) - 1)::smallint as sort_order
from (
	select distinct i.menu_template_id, i.meal_type_id
	from kitchen.menu_template_items i
	join kitchen.menu_template t on t.id = i.menu_template_id
	where t.template_type = 'apoio'
		and i.event_meal_id is null
		and i.meal_type_id is not null
) src
join kitchen.meal_type mt on mt.id = src.meal_type_id;

insert into kitchen.menu_template_event_meal (id, menu_template_id, name, meal_type_id, groups, sort_order)
select id, menu_template_id, name, meal_type_id, '[]'::jsonb, sort_order
from _support_meal_backfill;

-- A refeição nasce sem grupos: o grupo que o item tivesse não existe nela.
update kitchen.menu_template_items i
set event_meal_id = b.id,
	item_group = null
from _support_meal_backfill b
where b.menu_template_id = i.menu_template_id
	and b.meal_type_id = i.meal_type_id
	and i.event_meal_id is null;

-- ── 4. Documentação ────────────────────────────────────────────────────────

comment on table kitchen.menu_template_event_meal is
	'Refeição própria de um evento (coquetel, jantar de gala…) ou de um apoio (o kit; "Refeição" e "Lanche" de um Bordo C). name = nome no cardápio; meal_type_id = horário do calendário em que é servida; groups = composição [{key,label,minItems?,maxItems?}], vazia no apoio simples.';
comment on column kitchen.menu_template_event_meal.groups is
	'Composição: [{key, label, minItems?, maxItems?}] na ordem de leitura. key é o que fica em menu_template_items.item_group; minItems/maxItems = quantas preparações o grupo espera (aviso, não trava).';
comment on column kitchen.menu_template_event_meal.base_headcount is
	'Efetivo da refeição (no apoio: kits). A porcentagem do item (recommended_proportion) incide sobre ele; o pax do item (headcount_override) vence os dois. Só em cardápio de cozinha: modelo global é relativo.';
comment on column kitchen.menu_template_items.recommended_proportion is
	'Quantidade relativa da preparação: % do efetivo da refeição no semanal e no evento (até 300, pelo domínio); porções por kit × 100 no apoio (até 1000).';
comment on column kitchen.menu_template_items.headcount_override is
	'Pax da preparação (quantidade absoluta, vence a proporção). Só em cardápio de cozinha: modelo global é relativo.';

commit;
