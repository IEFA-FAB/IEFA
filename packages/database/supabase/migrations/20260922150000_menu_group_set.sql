-- ============================================================================
-- Conjuntos de grupos do cardápio ("templates de grupos") por refeição
-- ============================================================================
-- Até aqui o grupo de uma preparação era um vocabulário ÚNICO e fixo, declarado
-- num `check (item_group in (...))` com cinco valores pensados para o almoço:
-- prato principal, acompanhamento, guarnição, bebida, sobremesa. Toda refeição
-- usava os mesmos cinco — e o dado em produção mostra o que isso produziu:
--
--   • café: `guarnicao` = bolos e achocolatado (211 itens), `acompanhamento` =
--     pães (100), `prato_principal` = ovos, frios e iogurte (56), `sobremesa` =
--     frutas (49). Nenhum dos quatro rótulos descreve o que está na linha;
--   • ceia: `prato_principal` = salgado assado e pão com frios (37),
--     `acompanhamento` = biscoito e doce (82), `guarnicao` = paçoca e bombom (10);
--   • almoço/jantar: uso coerente — faltava SALADA, e é por isso que 126 itens do
--     almoço e 95 do jantar (quase todos folhas, legumes e vinagretes) estavam
--     sem grupo nenhum.
--
-- O grupo deixa de ser vocabulário global e passa a ser CONJUNTO por refeição:
-- `kitchen.menu_group_set` (o conjunto, global da SDAB ou próprio da cozinha) e
-- `kitchen.menu_group` (as colunas do conjunto: chave gravada em `item_group`,
-- rótulo exibido, ordem de leitura). `kitchen.meal_type.group_set_id` diz qual
-- conjunto cada refeição usa — inclusive as refeições personalizadas, que até
-- agora só tinham nome e ordem.
--
-- O CHECK sai das duas tabelas de item. Ele não pode virar FK: `item_group`
-- guarda a CHAVE (texto), e a mesma chave existe em conjuntos diferentes
-- ('bebida' está nos três). Quem valida é o domínio, contra o conjunto da
-- refeição; chave fora do conjunto não é erro de escrita — aparece na coluna
-- "Fora do conjunto" do editor para alguém recolocar. Era esse o comportamento
-- de `item_group is null` e ele continua existindo.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Conjuntos
-- ----------------------------------------------------------------------------
create table kitchen.menu_group_set (
	id          uuid primary key default gen_random_uuid(),
	name        text not null,
	description text,
	-- Mesmo par global/local dos demais ativos do cardápio (receita, template,
	-- tipo de refeição): null = da SDAB, exige global:2; preenchido = da cozinha.
	kitchen_id  bigint references kitchen.kitchen (id),
	-- Só nos conjuntos GLOBAIS, e só para o código os alcançar por nome estável
	-- (o padrão de refeição nova, o contrato do seed). Conjunto de cozinha nasce
	-- sem slug — quem o identifica é o id.
	slug        text,
	sort_order  smallint not null default 0,
	created_at  timestamptz not null default now(),
	deleted_at  timestamptz,
	constraint menu_group_set_name_not_blank check (btrim(name) <> ''),
	constraint menu_group_set_slug_shape check (slug is null or slug ~ '^[a-z][a-z0-9_]{1,39}$'),
	-- Slug é de conjunto global: num conjunto de cozinha ele confundiria a busca
	-- por nome estável com um homônimo local.
	constraint menu_group_set_slug_is_global check (slug is null or kitchen_id is null)
);

comment on table kitchen.menu_group_set is
	'Conjunto de grupos ("template de grupos") de uma refeição: almoço/jantar, café, ceia. kitchen_id null = global da SDAB.';

-- Parcial por deleted_at: conjunto arquivado não pode bloquear a criação de um
-- novo com o mesmo slug (é o mesmo motivo do índice parcial de daily_menu).
create unique index menu_group_set_slug_key on kitchen.menu_group_set (slug) where slug is not null and deleted_at is null;
create index menu_group_set_kitchen_idx on kitchen.menu_group_set (kitchen_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- Grupos do conjunto
-- ----------------------------------------------------------------------------
create table kitchen.menu_group (
	id            uuid primary key default gen_random_uuid(),
	group_set_id  uuid not null references kitchen.menu_group_set (id) on delete cascade,
	-- Valor gravado em menu_template_items.item_group / menu_items.item_group.
	key           text not null,
	label         text not null,
	sort_order    smallint not null default 0,
	created_at    timestamptz not null default now(),
	constraint menu_group_key_shape check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
	constraint menu_group_label_not_blank check (btrim(label) <> ''),
	constraint menu_group_key_unique unique (group_set_id, key)
);

comment on table kitchen.menu_group is
	'Coluna de um conjunto. `key` é o que fica gravado em item_group; `label` é só exibição, e mudar o rótulo NÃO reclassifica o que já está no cardápio.';

comment on column kitchen.menu_group.key is
	'Chave do grupo. Repete-se entre conjuntos de propósito (bebida existe nos três) — a unicidade é dentro do conjunto.';

create index menu_group_set_idx on kitchen.menu_group (group_set_id, sort_order);

alter table kitchen.menu_group_set enable row level security;
alter table kitchen.menu_group enable row level security;

-- ----------------------------------------------------------------------------
-- Vínculo refeição → conjunto
-- ----------------------------------------------------------------------------
alter table kitchen.meal_type
	add column group_set_id uuid references kitchen.menu_group_set (id);

comment on column kitchen.meal_type.group_set_id is
	'Conjunto de grupos desta refeição. Null = o editor cai no conjunto padrão (slug `principal`) — é o estado de linha antiga, não um modo de operação.';

create index meal_type_group_set_idx on kitchen.meal_type (group_set_id) where group_set_id is not null;

-- ----------------------------------------------------------------------------
-- Fim do vocabulário único
-- ----------------------------------------------------------------------------
-- Quem valida passa a ser o domínio, contra o conjunto da refeição. Manter o
-- CHECK aqui recusaria 'salada' no almoço — o grupo que motivou tudo isto.
alter table kitchen.menu_template_items drop constraint if exists menu_template_items_item_group_check;
alter table kitchen.menu_items          drop constraint if exists menu_items_item_group_check;

-- ----------------------------------------------------------------------------
-- Seed dos conjuntos globais
-- ----------------------------------------------------------------------------
-- Espelhado em DEFAULT_MENU_GROUP_SETS (@iefa/sisub-domain) e verificado por
-- contrato em menu-groups.sql-contract.test.ts: chave, rótulo e ordem.
insert into kitchen.menu_group_set (name, description, slug, sort_order) values
	('Refeição principal', 'Almoço e jantar: salada, prato principal, acompanhamento, guarnição, bebida e sobremesa.', 'principal', 1),
	('Café da manhã',      'Pães, frios e ovos, bolos e complementos, frutas e bebidas.',                              'cafe',      2),
	('Ceia e lanches',     'Lanche, complementos, frutas e bebidas — serve ceia, lanche de bordo e apoio.',            'ceia',      3);

insert into kitchen.menu_group (group_set_id, key, label, sort_order)
select s.id, g.key, g.label, g.sort_order
from kitchen.menu_group_set s
join (values
	('principal', 'salada',          'Salada',                1),
	('principal', 'prato_principal', 'Prato principal',       2),
	('principal', 'acompanhamento',  'Acompanhamento',        3),
	('principal', 'guarnicao',       'Guarnição',             4),
	('principal', 'bebida',          'Bebida',                5),
	('principal', 'sobremesa',       'Sobremesa',             6),
	('cafe',      'pao',             'Pães',                  1),
	('cafe',      'proteina',        'Frios e ovos',          2),
	('cafe',      'complemento',     'Bolos e complementos',  3),
	('cafe',      'fruta',           'Frutas',                4),
	('cafe',      'bebida',          'Bebidas',               5),
	('ceia',      'lanche',          'Lanche',                1),
	('ceia',      'complemento',     'Complementos',          2),
	('ceia',      'fruta',           'Frutas',                3),
	('ceia',      'bebida',          'Bebidas',               4)
) as g(set_slug, key, label, sort_order) on g.set_slug = s.slug;

-- ----------------------------------------------------------------------------
-- Refeições existentes → conjunto
-- ----------------------------------------------------------------------------
-- Por NOME, e só para as refeições genéricas que este repositório conhece. O que
-- não casar fica com group_set_id null e o editor usa o conjunto padrão — mesma
-- tela de hoje, mais a salada.
update kitchen.meal_type mt
set group_set_id = s.id
from kitchen.menu_group_set s
where s.slug = case
		when lower(btrim(mt.name)) in ('café', 'cafe', 'café da manhã', 'cafe da manha') then 'cafe'
		when lower(btrim(mt.name)) in ('ceia') or lower(btrim(mt.name)) like 'lanche%' then 'ceia'
		when lower(btrim(mt.name)) in ('almoço', 'almoco', 'jantar') then 'principal'
	end
	and mt.group_set_id is null;

-- ----------------------------------------------------------------------------
-- Reclassificação do que já está no cardápio
-- ----------------------------------------------------------------------------
-- Determinística: a chave nova sai da chave antiga + do conjunto da refeição.
-- Nada é apagado, e item cuja chave não estiver no conjunto continuaria visível
-- (coluna "Fora do conjunto") — o remapeamento existe para que ninguém precise
-- disso em 500+ linhas.
create temporary table _group_remap (set_slug text, old_key text, new_key text) on commit drop;

insert into _group_remap values
	-- café: pães estavam em acompanhamento; ovos/frios/iogurte em prato_principal;
	-- bolos, aveia e achocolatado em guarnição; frutas em sobremesa.
	('cafe', 'acompanhamento',  'pao'),
	('cafe', 'prato_principal', 'proteina'),
	('cafe', 'guarnicao',       'complemento'),
	('cafe', 'sobremesa',       'fruta'),
	('cafe', 'bebida',          'bebida'),
	-- ceia: salgado assado, bolo e pão com frios eram prato_principal; biscoito e
	-- doce vinham partidos entre acompanhamento e guarnição — viram um grupo só.
	('ceia', 'prato_principal', 'lanche'),
	('ceia', 'acompanhamento',  'complemento'),
	('ceia', 'guarnicao',       'complemento'),
	('ceia', 'sobremesa',       'fruta'),
	('ceia', 'bebida',          'bebida');

update kitchen.menu_template_items i
set item_group = r.new_key
from kitchen.meal_type mt
join kitchen.menu_group_set s on s.id = mt.group_set_id
join _group_remap r on r.set_slug = s.slug
where mt.id = i.meal_type_id
	and i.item_group = r.old_key
	and i.item_group is distinct from r.new_key;

update kitchen.menu_items i
set item_group = r.new_key
from kitchen.daily_menu dm
join kitchen.meal_type mt on mt.id = dm.meal_type_id
join kitchen.menu_group_set s on s.id = mt.group_set_id
join _group_remap r on r.set_slug = s.slug
where dm.id = i.daily_menu_id
	and i.item_group = r.old_key
	and i.item_group is distinct from r.new_key;

-- Salada do almoço/jantar: as folhas, legumes e vinagretes do cardápio estavam
-- SEM grupo (era o único destino honesto quando salada não existia). O recorte é
-- estreito de propósito — casa pelo começo do nome da preparação, exclui salada
-- de frutas, e só toca item que já estava sem grupo. Classificação errada aqui
-- aparece numa coluna do editor e se arrasta de volta; nada é perdido.
update kitchen.menu_template_items i
set item_group = 'salada'
from kitchen.meal_type mt
join kitchen.menu_group_set s on s.id = mt.group_set_id and s.slug = 'principal'
where mt.id = i.meal_type_id
	and i.item_group is null
	and lower(btrim(coalesce((select r.name from kitchen.recipes r where r.id = i.recipe_id), ''))) !~ '^salada de frutas'
	and lower(btrim(coalesce((select r.name from kitchen.recipes r where r.id = i.recipe_id), ''))) ~
		'^(salada|alface|r[úu]cula|acelga|agri[ãa]o|repolho|tomate|pepino|beterraba|cenoura ralada|vinagrete|tabule|chic[óo]ria|couve|berinjela|abobrinha|vagem cozida)';

-- No cardápio do dia a ficha é um instantâneo (`recipe`, json) e a linha de
-- origem pode não existir mais: o nome sai da origem quando ela existe, e do
-- instantâneo quando não existe. Só `recipe_origin_id` deixaria de fora
-- justamente o item cuja ficha foi apagada depois de publicado.
update kitchen.menu_items i
set item_group = 'salada'
from kitchen.daily_menu dm
join kitchen.meal_type mt on mt.id = dm.meal_type_id
join kitchen.menu_group_set s on s.id = mt.group_set_id and s.slug = 'principal'
where dm.id = i.daily_menu_id
	and i.item_group is null
	and lower(btrim(coalesce((select r.name from kitchen.recipes r where r.id = i.recipe_origin_id), i.recipe ->> 'name', ''))) !~ '^salada de frutas'
	and lower(btrim(coalesce((select r.name from kitchen.recipes r where r.id = i.recipe_origin_id), i.recipe ->> 'name', ''))) ~
		'^(salada|alface|r[úu]cula|acelga|agri[ãa]o|repolho|tomate|pepino|beterraba|cenoura ralada|vinagrete|tabule|chic[óo]ria|couve|berinjela|abobrinha|vagem cozida)';

-- Reindexa a ordem DENTRO da célula. Na ceia dois grupos viraram um só
-- (acompanhamento + guarnição → complemento): sem isto a coluna abriria com duas
-- sequências embaralhadas, cada uma começando em 0.
with ordered as (
	select id,
		(row_number() over (
			partition by menu_template_id, day_of_week, meal_type_id, item_group
			order by sort_order, created_at, id
		) - 1) as pos
	from kitchen.menu_template_items
)
update kitchen.menu_template_items t
set sort_order = ordered.pos
from ordered
where ordered.id = t.id and t.sort_order is distinct from ordered.pos;

with ordered as (
	select id,
		(row_number() over (
			partition by daily_menu_id, item_group
			order by sort_order, created_at, id
		) - 1) as pos
	from kitchen.menu_items
)
update kitchen.menu_items m
set sort_order = ordered.pos
from ordered
where ordered.id = m.id and m.sort_order is distinct from ordered.pos;

commit;
