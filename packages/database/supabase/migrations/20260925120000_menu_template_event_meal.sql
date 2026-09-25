-- ============================================================================
-- Refeições próprias do evento
-- ============================================================================
-- Até aqui o evento (`menu_template.template_type = 'event'`) não tinha refeição
-- nenhuma: o editor listava os tipos de refeição da cozinha (café, almoço,
-- jantar, ceia) e cada preparação ficava sob um deles, sem grupo. Evento não é
-- rotina — um coquetel de formatura tem "entradas" e "volantes", um jantar de
-- gala tem entrada, prato principal e sobremesa —, e nada disso cabia nos tipos
-- de refeição do rancho nem nos conjuntos de grupos deles.
--
-- Agora o evento tem as PRÓPRIAS refeições, zero ou mais, editáveis dentro dele:
--
--   • `name`: como a refeição se chama NO EVENTO ("Coquetel", "Jantar de gala");
--   • `meal_type_id`: o horário do calendário em que ela é servida. É só isso
--     que o tipo de refeição da cozinha passa a significar para o evento: onde
--     o "Aplicar ao calendário" põe os itens (é aditivo ao cardápio daquele
--     horário, como já era);
--   • `groups`: a composição da refeição — as colunas do editor ("Entradas",
--     "Volantes", "Bebidas"…). É do evento e não de um conjunto compartilhado:
--     mudar a composição de um evento não pode mexer no cardápio da semana.
--
-- `groups` é jsonb e não uma tabela filha porque a composição não tem vida
-- própria: nasce, muda e morre com a refeição, sempre inteira. O formato
-- ([{key, label}], ordem do array = ordem de leitura) é o mesmo de
-- `kitchen.menu_group` e é validado pelo domínio (`TemplateEventMealSchema`).
--
-- O item do evento aponta para a refeição (`menu_template_items.event_meal_id`)
-- e continua carregando `meal_type_id` — igual ao da refeição, gravado pelo
-- domínio. Ata, custeio, previsão e a aplicação ao calendário leem o
-- `meal_type_id` do item e seguem funcionando sem saber que o evento mudou.
-- ============================================================================

begin;

create table kitchen.menu_template_event_meal (
	id               uuid primary key default gen_random_uuid(),
	menu_template_id uuid not null references kitchen.menu_template (id) on delete cascade,
	name             text not null,
	meal_type_id     uuid not null references kitchen.meal_type (id),
	groups           jsonb not null default '[]'::jsonb,
	sort_order       smallint not null default 0,
	created_at       timestamptz not null default now(),
	constraint menu_template_event_meal_name_not_blank check (btrim(name) <> ''),
	constraint menu_template_event_meal_groups_is_array check (jsonb_typeof(groups) = 'array')
);

comment on table kitchen.menu_template_event_meal is
	'Refeição de um evento (coquetel, jantar de gala…). name = nome no evento; meal_type_id = horário do calendário em que é servida; groups = composição [{key,label}].';
comment on column kitchen.menu_template_event_meal.meal_type_id is
	'Horário do calendário. O "Aplicar ao calendário" acrescenta os itens desta refeição ao cardápio deste tipo de refeição na data.';
comment on column kitchen.menu_template_event_meal.groups is
	'Composição: [{key, label}] na ordem de leitura. key é o que fica em menu_template_items.item_group.';

create index menu_template_event_meal_template_idx on kitchen.menu_template_event_meal (menu_template_id, sort_order);

alter table kitchen.menu_template_event_meal enable row level security;
-- Só o servidor (service_role) lê e escreve: o navegador não consulta template.
revoke all on kitchen.menu_template_event_meal from anon, authenticated;

alter table kitchen.menu_template_items
	add column event_meal_id uuid references kitchen.menu_template_event_meal (id) on delete cascade;

comment on column kitchen.menu_template_items.event_meal_id is
	'Refeição do evento a que o item pertence (só em template de evento). meal_type_id do item = meal_type_id da refeição.';

create index menu_template_items_event_meal_idx on kitchen.menu_template_items (event_meal_id) where event_meal_id is not null;

-- ----------------------------------------------------------------------------
-- Eventos existentes: uma refeição por tipo de refeição que já tem item
-- ----------------------------------------------------------------------------
-- Nada muda de lugar: a refeição nasce com o nome do tipo de refeição, no mesmo
-- horário, e com a composição do conjunto que o tipo usava (o padrão quando ele
-- não apontava para nenhum). As chaves de grupo já gravadas nos itens continuam
-- valendo dentro dela. Evento arquivado entra também — restaurá-lo não pode
-- trazer de volta um evento sem refeição.
create temporary table _event_meal_backfill on commit drop as
select
	gen_random_uuid() as id,
	src.menu_template_id,
	src.meal_type_id,
	coalesce(nullif(btrim(mt.name), ''), 'Refeição') as name,
	(row_number() over (partition by src.menu_template_id order by mt.sort_order nulls last, mt.name, mt.id) - 1)::smallint as sort_order,
	-- Sem grupo nenhum no conjunto, a refeição nasce com a composição padrão de evento
	-- (DEFAULT_EVENT_MEAL_GROUPS): o domínio exige ao menos um grupo, e uma refeição vazia
	-- travaria o salvamento do evento.
	coalesce(
		(
			select jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label) order by g.sort_order, g.key)
			from kitchen.menu_group g
			where g.group_set_id = coalesce(
				mt.group_set_id,
				(select s.id from kitchen.menu_group_set s where s.slug = 'principal' and s.deleted_at is null limit 1)
			)
		),
		'[{"key":"entrada","label":"Entradas"},{"key":"volante","label":"Volantes"},{"key":"prato_principal","label":"Prato principal"},{"key":"sobremesa","label":"Sobremesas"},{"key":"bebida","label":"Bebidas"}]'::jsonb
	) as groups
from (
	select distinct i.menu_template_id, i.meal_type_id
	from kitchen.menu_template_items i
	join kitchen.menu_template t on t.id = i.menu_template_id
	where t.template_type = 'event'
		and i.meal_type_id is not null
		and i.menu_template_id is not null
) src
join kitchen.meal_type mt on mt.id = src.meal_type_id;

insert into kitchen.menu_template_event_meal (id, menu_template_id, name, meal_type_id, groups, sort_order)
select id, menu_template_id, name, meal_type_id, groups, sort_order
from _event_meal_backfill;

update kitchen.menu_template_items i
set event_meal_id = b.id
from _event_meal_backfill b
where b.menu_template_id = i.menu_template_id
	and b.meal_type_id = i.meal_type_id
	and i.event_meal_id is null;

commit;
