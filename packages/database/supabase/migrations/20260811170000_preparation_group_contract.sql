-- Preparações do SISUBWEB: fase CONTRACT.
--
-- Só rodar DEPOIS que o código que lê `kitchen.ingredient.preparation_group_id`
-- estiver em produção (ver 20260811160000_preparation_group_expand.sql). Antes disso,
-- o código antigo ainda encontra o grupo pela descrição da pasta, e tirar as pastas
-- jogaria as preparações na raiz da árvore de insumos.
--
-- Depois daqui, `kitchen.folder` contém APENAS pastas de insumo. A pasta "Preparações"
-- deixa de existir naquela árvore, que era o pedido: nenhuma listagem de insumo pode
-- topar com esses nomes, e nada mais depende de casar texto.

begin;

-- Guarda de sequência: sem a fase EXPAND, isto apagaria pasta de insumo de verdade.
do $$
declare
	grupos int;
	vinculados int;
	pendentes int;
begin
	select count(*) into grupos from kitchen.preparation_group;
	if grupos = 0 then
		raise exception 'kitchen.preparation_group está vazia — rode a fase EXPAND (20260811160000) antes desta migration';
	end if;

	-- Todo insumo que ainda aponta para uma pasta do grupo tem que ter o vínculo novo.
	select count(*) into pendentes
	from kitchen.ingredient i
	where i.folder_id in (select id from kitchen.preparation_group)
		and i.preparation_group_id is null;
	if pendentes > 0 then
		raise exception '% insumos ainda sem preparation_group_id — a fase EXPAND não completou', pendentes;
	end if;

	select count(*) into vinculados from kitchen.ingredient where preparation_group_id is not null;
	raise notice 'CONTRACT: % grupos, % insumos vinculados', grupos, vinculados;
end $$;

-- `folder_id` some porque a pasta vai sumir; o vínculo agora é `preparation_group_id`.
update kitchen.ingredient
set folder_id = null
where folder_id in (select id from kitchen.preparation_group);

-- Nada mais referencia essas pastas: as únicas FKs para kitchen.folder são
-- ingredient.folder_id (acabou de ser zerado) e folder.parent_id (os filhos estão
-- todos dentro do próprio grupo, então saem juntos). Os ids foram preservados em
-- kitchen.preparation_group, então a operação é reversível.
delete from kitchen.folder
where id in (select id from kitchen.preparation_group);

commit;
