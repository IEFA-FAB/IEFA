-- Preparações do SISUBWEB: estrutura própria, fora da árvore de pastas dos insumos.
--
-- O import legado filiou o grupo de produto "Preparações" em kitchen.folder e seus
-- itens em kitchen.ingredient. Não são insumos — são preparações, e os nomes colidem
-- com os das receitas. Até aqui o recorte era feito casando a DESCRIÇÃO da pasta por
-- regex, o que desliga em silêncio se alguém renomear a pasta.
--
-- Esta é a fase EXPAND de um expand/contract. Ela só ACRESCENTA: cria a tabela de
-- grupos, a coluna de vínculo, e popula as duas. `kitchen.folder` e
-- `kitchen.ingredient.folder_id` ficam intactos de propósito — o código em produção
-- neste momento ainda encontra o grupo pela descrição, e derrubar as pastas antes do
-- deploy jogaria 1626 insumos na raiz da árvore. A fase CONTRACT
-- (20260811170000_preparation_group_contract.sql) tira as pastas depois que o código
-- novo estiver no ar.
--
-- As linhas de kitchen.ingredient NÃO se movem. 90% delas têm dependência viva —
-- 1419 vínculos em procurement.purchase_item_ingredient, 766 SKUs em
-- kitchen.ingredient_item — porque boa parte dessas preparações é comprada pronta,
-- com CATMAT. Movê-las arrastaria o fluxo de compras junto. O que muda é a
-- classificação: deixa de ser "está numa pasta com esse nome" e passa a ser uma FK.

begin;

create table if not exists kitchen.preparation_group (
	id          uuid primary key default gen_random_uuid(),
	name        text not null,
	-- Hierarquia própria, espelhando a que o grupo tinha dentro de kitchen.folder.
	parent_id   uuid references kitchen.preparation_group (id),
	-- Correlação com o grupo de produto do SISUBWEB, herdada da pasta de origem.
	legacy_id   integer,
	created_at  timestamptz not null default now(),
	deleted_at  timestamptz,
	constraint preparation_group_name_not_blank check (btrim(name) <> ''),
	constraint preparation_group_not_self_parent check (parent_id is null or parent_id <> id)
);

comment on table kitchen.preparation_group is
	'Grupos das preparações herdadas do SISUBWEB. Fora de kitchen.folder de propósito: aquela árvore é a tela de insumos, e misturar os dois foi a origem da confusão de nomes com o catálogo de receitas.';

create index if not exists preparation_group_parent_id_idx on kitchen.preparation_group (parent_id);
create index if not exists preparation_group_deleted_at_idx on kitchen.preparation_group (deleted_at);

alter table kitchen.ingredient
	add column if not exists preparation_group_id uuid references kitchen.preparation_group (id);

comment on column kitchen.ingredient.preparation_group_id is
	'Preenchido ⇒ a linha é uma preparação herdada do SISUBWEB, não um insumo. Toda listagem de insumo filtra por IS NULL. Substitui o casamento por descrição da pasta.';

create index if not exists ingredient_preparation_group_id_idx
	on kitchen.ingredient (preparation_group_id) where preparation_group_id is not null;

-- ── População ───────────────────────────────────────────────────────────────
-- Subárvore da pasta "Preparações" (raiz + descendentes, em qualquer profundidade).
-- Percorre INCLUSIVE pastas soft-deleted: existem pastas apagadas com filhos vivos, e
-- parar nelas deixaria a subárvore de baixo para trás.
with recursive prep_folder as (
	select f.id, f.description, f.parent_id, f.legacy_id, f.created_at, f.deleted_at
	from kitchen.folder f
	where btrim(f.description) ~* '^[[:space:]]*[pP][rR][eE][pP][aA][rR][aA][çÇcC][õÕoO][eE][sS]'
	union all
	select c.id, c.description, c.parent_id, c.legacy_id, c.created_at, c.deleted_at
	from kitchen.folder c
	join prep_folder p on c.parent_id = p.id
)
insert into kitchen.preparation_group (id, name, parent_id, legacy_id, created_at, deleted_at)
select
	pf.id,
	-- `name` é NOT NULL; folder.description é anulável. Sem descrição, um rótulo
	-- estável derivado do id é melhor do que barrar a migration.
	coalesce(nullif(btrim(pf.description), ''), 'Grupo ' || left(pf.id::text, 8)),
	-- O pai só acompanha se também estiver no recorte. A pasta-topo é filha de
	-- "Gêneros de Alimentação", que fica de fora — ela vira raiz da árvore nova.
	case when pf.parent_id in (select id from prep_folder) then pf.parent_id end,
	pf.legacy_id,
	pf.created_at,
	pf.deleted_at
from prep_folder pf
-- Ids preservados: o vínculo com o ingredient é direto e a fase CONTRACT fica trivial.
on conflict (id) do nothing;

update kitchen.ingredient i
set preparation_group_id = i.folder_id
where i.folder_id in (select id from kitchen.preparation_group)
	and i.preparation_group_id is distinct from i.folder_id;

commit;
