-- Cardápio: preparações dentro de uma refeição passam a ter (1) grupo canônico
-- (prato principal / acompanhamento / guarnição / bebida / sobremesa), (2) ordem
-- explícita dentro do grupo e (3) uma proporção recomendada de consumo (advisory,
-- ex.: 2 proteínas → bovina 70% / suína 30%). Aplicado nas DUAS tabelas de item:
-- menu_template_items (cardápio semanal editável) e menu_items (cardápio do dia).
--
-- item_group: null = legado/sem grupo. sort_order: posição dentro do grupo, dentro
-- da célula (dia+refeição no template; daily_menu no cardápio do dia).
-- recommended_proportion: 0–100, sem soma forçada (sugestão).

-- ── kitchen.menu_template_items ──────────────────────────────────────────────
alter table kitchen.menu_template_items
    add column if not exists item_group             text,
    add column if not exists sort_order             smallint not null default 0,
    add column if not exists recommended_proportion numeric;

alter table kitchen.menu_template_items
    drop constraint if exists menu_template_items_item_group_check,
    add  constraint menu_template_items_item_group_check
        check (item_group is null or item_group in
            ('prato_principal', 'acompanhamento', 'guarnicao', 'bebida', 'sobremesa'));

alter table kitchen.menu_template_items
    drop constraint if exists menu_template_items_recommended_proportion_check,
    add  constraint menu_template_items_recommended_proportion_check
        check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 100));

-- Backfill de ordem estável para itens já existentes: por célula (template+dia+refeição),
-- na ordem de criação. Mantém o cardápio legado com a mesma sequência de leitura.
with ordered as (
    select id,
           (row_number() over (
               partition by menu_template_id, day_of_week, meal_type_id
               order by created_at, id
           ) - 1) as pos
    from kitchen.menu_template_items
)
update kitchen.menu_template_items t
set sort_order = ordered.pos
from ordered
where ordered.id = t.id;

-- ── kitchen.menu_items ───────────────────────────────────────────────────────
alter table kitchen.menu_items
    add column if not exists item_group             text,
    add column if not exists sort_order             smallint not null default 0,
    add column if not exists recommended_proportion numeric;

alter table kitchen.menu_items
    drop constraint if exists menu_items_item_group_check,
    add  constraint menu_items_item_group_check
        check (item_group is null or item_group in
            ('prato_principal', 'acompanhamento', 'guarnicao', 'bebida', 'sobremesa'));

alter table kitchen.menu_items
    drop constraint if exists menu_items_recommended_proportion_check,
    add  constraint menu_items_recommended_proportion_check
        check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 100));

-- Backfill de ordem estável por daily_menu (a refeição do dia), na ordem de criação.
with ordered as (
    select id,
           (row_number() over (
               partition by daily_menu_id
               order by created_at, id
           ) - 1) as pos
    from kitchen.menu_items
)
update kitchen.menu_items m
set sort_order = ordered.pos
from ordered
where ordered.id = m.id;
