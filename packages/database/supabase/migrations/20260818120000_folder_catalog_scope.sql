-- Itens auxiliares (EPI, limpeza, embalagem, combustível…) separados do catálogo de
-- alimentação — aba própria em /global/ingredients.
--
-- O import do SISUBWEB trouxe os grupos de material NÃO alimentar para dentro da mesma
-- árvore de `kitchen.folder` dos gêneros. São 168 itens em 21 pastas sob 6 raízes: EPI,
-- material de limpeza, embalagem, copa e cozinha, gás e combustíveis. Eles precisam
-- continuar existindo (são comprados, estocados e alguns entram em preparação — copo
-- descartável, palito, fósforo, álcool), mas não são insumo de alimentação e poluem a
-- árvore de quem monta ficha técnica.
--
-- A classificação é uma COLUNA na pasta, não um casamento de nome: renomear "Material de
-- Limpeza e Higienização" não pode devolver 58 itens ao catálogo de gêneros em silêncio.
-- Mesma lição da migração das preparações do SISUBWEB (20260811160000).
--
-- Recorte de leitura, NÃO de escrita: o seletor de insumo da ficha técnica e as tools de
-- IA continuam enxergando os dois escopos (`include` é o default do parâmetro). Só as
-- abas de /global/ingredients pedem um escopo explícito. Estreitar o default quebraria as
-- 29 linhas de recipe_ingredients que hoje apontam para item auxiliar.

begin;

alter table kitchen.folder
	add column if not exists catalog_scope text not null default 'alimentacao';

alter table kitchen.folder
	drop constraint if exists folder_catalog_scope_check;

alter table kitchen.folder
	add constraint folder_catalog_scope_check check (catalog_scope in ('alimentacao', 'auxiliar'));

comment on column kitchen.folder.catalog_scope is
	'alimentacao = gêneros (catálogo de insumos); auxiliar = material não alimentar (EPI, limpeza, embalagem, copa, gás, combustível). Recorte das abas de /global/ingredients. Herdado do pai por trigger.';

create index if not exists folder_catalog_scope_idx
	on kitchen.folder (catalog_scope) where catalog_scope <> 'alimentacao';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Pelo `legacy_id` do grupo de produto do SISUBWEB, não pela descrição: o código é
-- estável e a descrição é editável na tela. Raiz desconhecida (legacy_id nulo, grupo
-- novo) fica no default 'alimentacao' de propósito — o modo de falha seguro é o item
-- aparecer no catálogo, não sumir dele.
with recursive aux_root as (
	select f.id
	from kitchen.folder f
	where f.parent_id is null
		and f.legacy_id in (
			230013, -- Combustíveis e Lubrificantes
			230022, -- Gás Engarrafado
			230030, -- Material de Proteção e Segurança (EPI)
			230031, -- Material de Acondicionamento / Embalagem
			230035, -- Material de Copa e Cozinha
			230044  -- Material de Limpeza e Higienização
		)
	union all
	-- Percorre INCLUSIVE pastas soft-deleted: parar numa apagada deixaria a subárvore
	-- viva abaixo dela classificada como alimentação.
	select c.id
	from kitchen.folder c
	join aux_root p on c.parent_id = p.id
)
update kitchen.folder f
set catalog_scope = 'auxiliar'
where f.id in (select id from aux_root)
	and f.catalog_scope <> 'auxiliar';

-- ── Herança ─────────────────────────────────────────────────────────────────
-- Subpasta nova nasce no escopo do pai. Sem isto, criar "Luvas" dentro de EPI produziria
-- uma pasta de alimentação pendurada na árvore auxiliar — visível na aba errada, e a
-- divergência só apareceria quando alguém reparasse no item fora de lugar.
--
-- Só age quando o INSERT/UPDATE não declara o escopo (ou o declara igual ao default):
-- criar uma raiz auxiliar de propósito continua possível informando `catalog_scope`.
create or replace function kitchen.folder_inherit_catalog_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
	parent_scope text;
begin
	if new.parent_id is null then
		return new;
	end if;

	select f.catalog_scope into parent_scope from kitchen.folder f where f.id = new.parent_id;
	if parent_scope is null then
		return new;
	end if;

	-- INSERT sem escopo explícito, ou reparentagem que muda o pai: herda.
	if tg_op = 'INSERT' then
		if new.catalog_scope = 'alimentacao' then
			new.catalog_scope := parent_scope;
		end if;
	elsif new.parent_id is distinct from old.parent_id and new.catalog_scope = old.catalog_scope then
		new.catalog_scope := parent_scope;
	end if;

	return new;
end;
$$;

drop trigger if exists folder_inherit_catalog_scope on kitchen.folder;
create trigger folder_inherit_catalog_scope
	before insert or update of parent_id, catalog_scope on kitchen.folder
	for each row
	execute function kitchen.folder_inherit_catalog_scope();

-- Propagação para a SUBÁRVORE. O gatilho acima só reescreve a própria linha: mover
-- "Descartáveis" (com "Copos" e "Talheres" dentro) de embalagem para gêneros trocaria a
-- aba da pasta e deixaria as filhas — e os itens delas — na aba antiga. A divergência
-- só apareceria quando alguém reparasse num item fora de lugar.
--
-- Recursão termina: o UPDATE ignora quem já está no escopo novo, então o gatilho que ele
-- dispara nos filhos não encontra mais nada para mudar.
create or replace function kitchen.folder_cascade_catalog_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	update kitchen.folder c
	set catalog_scope = new.catalog_scope
	where c.parent_id = new.id
		and c.catalog_scope is distinct from new.catalog_scope;
	return null;
end;
$$;

drop trigger if exists folder_cascade_catalog_scope on kitchen.folder;
-- Sem `of catalog_scope`: aquela cláusula olha as colunas que o UPDATE *lista*, e o caso
-- principal — mover a pasta de aba — atualiza só `parent_id`; quem troca o escopo é o
-- gatilho BEFORE acima, o que a lista de colunas não enxerga. O `when` faz o filtro.
create trigger folder_cascade_catalog_scope
	after update on kitchen.folder
	for each row
	when (old.catalog_scope is distinct from new.catalog_scope)
	execute function kitchen.folder_cascade_catalog_scope();

commit;
