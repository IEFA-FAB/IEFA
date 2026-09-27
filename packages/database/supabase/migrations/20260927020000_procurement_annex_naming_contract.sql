-- Nomes de banco conforme a Lei 14.133/2021 — fase CONTRACT de 20260927010000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos
-- (`kitchen_demand_forecast*`, `forecast_id`, `procurement_list_id`, `procurement_list_item_id`).
-- Aplicada antes, derruba em produção o código que ainda lê as views de compatibilidade ou
-- escreve as colunas antigas. Conferir no CI/CD da `main` que o deploy do PR do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo: as três views com o nome
-- `kitchen_ata_draft*`, os triggers e as funções de espelho, e as colunas `ata_id`/`ata_item_id`
-- (que levam junto a FK e os índices delas: `procurement_arp_ata_id_fkey`,
-- `procurement_arp_item_ata_item_id_fkey`, `procurement_pesquisa_preco_ata_id_fkey`,
-- `procurement_pesquisa_preco_item_ata_item_id_fkey`, `idx_procurement_arp_ata`,
-- `idx_arp_item_ata_item`, `idx_pesquisa_preco_ata`, `idx_pesquisa_preco_pending_ata_id`,
-- `idx_pesquisa_preco_item_ata_item`).

-- O espelho garante colunas iguais; se não estiverem, algo escreveu por fora dele e a coluna
-- antiga tem dado que a nova não tem. Para, em vez de perder o vínculo.
do $$
declare
	diverging text;
begin
	select string_agg(t, ', ') into diverging
	from (
		select 'procurement_arp' as t where exists (select 1 from procurement.procurement_arp where ata_id is distinct from procurement_list_id)
		union all
		select 'procurement_arp_item' where exists (select 1 from procurement.procurement_arp_item where ata_item_id is distinct from procurement_list_item_id)
		union all
		select 'procurement_pesquisa_preco' where exists (select 1 from procurement.procurement_pesquisa_preco where ata_id is distinct from procurement_list_id)
		union all
		select 'procurement_pesquisa_preco_item'
		where exists (select 1 from procurement.procurement_pesquisa_preco_item where ata_item_id is distinct from procurement_list_item_id)
	) d;
	if diverging is not null then
		raise exception 'coluna antiga e nova divergem em: %', diverging;
	end if;
end;
$$;

drop view procurement.kitchen_ata_draft_import;
drop view procurement.kitchen_ata_draft_selection;
drop view procurement.kitchen_ata_draft;

drop trigger procurement_arp_mirror_procurement_list_id on procurement.procurement_arp;
drop trigger procurement_arp_item_mirror_procurement_list_item_id on procurement.procurement_arp_item;
drop trigger procurement_pesquisa_preco_mirror_procurement_list_id on procurement.procurement_pesquisa_preco;
drop trigger procurement_pesquisa_preco_item_mirror_procurement_list_item_id on procurement.procurement_pesquisa_preco_item;
drop function procurement.mirror_procurement_list_id();
drop function procurement.mirror_procurement_list_item_id();

alter table procurement.procurement_arp drop column ata_id;
alter table procurement.procurement_arp_item drop column ata_item_id;
alter table procurement.procurement_pesquisa_preco drop column ata_id;
alter table procurement.procurement_pesquisa_preco_item drop column ata_item_id;
