-- Nomes de banco conforme a Lei 14.133/2021 — fase EXPAND.
--
-- Na lei, só a Ata de Registro de Preços é ata (art. 6º, XLVI). O resto que se chamava "ata"
-- no banco é outra coisa:
--
--   * `procurement.procurement_list*` é o ANEXO QUANTITATIVO do termo de referência. A tabela
--     já tinha nome certo; ficaram com "ata" as colunas que apontam para ela
--     (`ata_id`, `ata_item_id`) e os nomes herdados de constraint e índice (`procurement_ata_*`).
--   * `procurement.kitchen_ata_draft*` é a PREVISÃO DE DEMANDA que a cozinha manda à unidade
--     (a tela já a chama assim): vira `kitchen_demand_forecast*`, e `draft_id` vira `forecast_id`.
--
-- Fica como está o que é ARP de fato: `procurement.procurement_arp` e as colunas `numero_ata`,
-- `ano_ata`, `status_ata`, com o unique `procurement_arp_unit_id_numero_ata_uasg_gerenciadora_key`.
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele em produção o tempo todo. Um rename seco
-- quebraria a `main` no instante em que fosse aplicado. Então esta migration só ACRESCENTA
-- caminhos, e o código antigo continua funcionando até o deploy do código novo:
--
--   * Tabela renomeada: o nome antigo vira view de compatibilidade (`security_invoker`), com as
--     colunas antigas (`forecast_id as draft_id`). É view simples de uma tabela só, então é
--     auto-updatable: o INSERT/UPDATE/DELETE (e o `on conflict` sobre a PK) do código antigo passa
--     direto para a tabela.
--   * Coluna renomeada em tabela que mantém o nome: view não serve. A coluna nova nasce ao lado
--     da antiga, com backfill, FK e índice próprios, e um trigger BEFORE INSERT OR UPDATE espelha
--     os dois sentidos — quem escreve só a antiga (código da `main`) ou só a nova (código novo)
--     deixa as duas iguais; escrever as duas com valores diferentes é recusado. A antiga mantém a
--     FK dela até o contract porque o PostgREST da `main` embute por ela
--     (`ata_item:ata_item_id (...)` em `replenishment.fn.ts`); com as duas FKs as ações
--     `on delete set null`/`cascade` são idempotentes entre si (a segunda não acha linha).
--   * Constraint e índice: só nome, rename direto.
--
-- Nenhuma função, view, policy, CHECK ou publicação cita os nomes antigos (conferido em
-- `pg_proc.prosrc`/`prosqlbody`, `pg_views`, `pg_policies`, `pg_publication_tables` e
-- `pg_depend` em 2026-09-26), então não há função a recriar. O comentário das colunas de
-- `procurement_list` que chamavam o anexo de "ata" é corrigido aqui.
--
-- O CONTRACT (20260927020000) derruba as views, os triggers e as colunas antigas, e só pode ser
-- aplicado depois do deploy do código que usa só os nomes novos.

-- ─── 1. Previsão de demanda da cozinha ───────────────────────────────────────────

alter table procurement.kitchen_ata_draft rename to kitchen_demand_forecast;
alter table procurement.kitchen_ata_draft_selection rename to kitchen_demand_forecast_selection;
alter table procurement.kitchen_ata_draft_import rename to kitchen_demand_forecast_import;

alter table procurement.kitchen_demand_forecast_selection rename column draft_id to forecast_id;
alter table procurement.kitchen_demand_forecast_import rename column draft_id to forecast_id;

alter table procurement.kitchen_demand_forecast rename constraint kitchen_ata_draft_pkey to kitchen_demand_forecast_pkey;
alter table procurement.kitchen_demand_forecast rename constraint kitchen_ata_draft_kitchen_id_fkey to kitchen_demand_forecast_kitchen_id_fkey;
alter table procurement.kitchen_demand_forecast rename constraint kitchen_ata_draft_reviewed_by_fkey to kitchen_demand_forecast_reviewed_by_fkey;
alter table procurement.kitchen_demand_forecast rename constraint kitchen_ata_draft_status_check to kitchen_demand_forecast_status_check;
alter index procurement.kitchen_ata_draft_kitchen_id_fk_idx rename to kitchen_demand_forecast_kitchen_id_fk_idx;
alter index procurement.kitchen_ata_draft_reviewed_by_fk_idx rename to kitchen_demand_forecast_reviewed_by_fk_idx;

alter table procurement.kitchen_demand_forecast_selection rename constraint kitchen_ata_draft_selection_pkey to kitchen_demand_forecast_selection_pkey;
alter table procurement.kitchen_demand_forecast_selection
	rename constraint kitchen_ata_draft_selection_draft_id_fkey to kitchen_demand_forecast_selection_forecast_id_fkey;
alter table procurement.kitchen_demand_forecast_selection
	rename constraint kitchen_ata_draft_selection_template_id_fkey to kitchen_demand_forecast_selection_template_id_fkey;
alter table procurement.kitchen_demand_forecast_selection
	rename constraint kitchen_ata_draft_selection_repetitions_check to kitchen_demand_forecast_selection_repetitions_check;
alter index procurement.kitchen_ata_draft_selection_draft_id_fk_idx rename to kitchen_demand_forecast_selection_forecast_id_fk_idx;
alter index procurement.kitchen_ata_draft_selection_template_id_fk_idx rename to kitchen_demand_forecast_selection_template_id_fk_idx;

alter table procurement.kitchen_demand_forecast_import rename constraint kitchen_ata_draft_import_pkey to kitchen_demand_forecast_import_pkey;
alter table procurement.kitchen_demand_forecast_import
	rename constraint kitchen_ata_draft_import_draft_id_fkey to kitchen_demand_forecast_import_forecast_id_fkey;
alter table procurement.kitchen_demand_forecast_import
	rename constraint kitchen_ata_draft_import_list_id_fkey to kitchen_demand_forecast_import_list_id_fkey;
alter table procurement.kitchen_demand_forecast_import
	rename constraint kitchen_ata_draft_import_imported_by_fkey to kitchen_demand_forecast_import_imported_by_fkey;
alter index procurement.kitchen_ata_draft_import_list_idx rename to kitchen_demand_forecast_import_list_idx;
alter index procurement.kitchen_ata_draft_import_imported_by_fk_idx rename to kitchen_demand_forecast_import_imported_by_fk_idx;

comment on table procurement.kitchen_demand_forecast is
	'Previsão de demanda que a cozinha envia à unidade (pending → sent → reviewed). Não é ata: na Lei 14.133/2021 só a Ata de Registro de Preços é ata (art. 6º, XLVI).';

-- Views de compatibilidade com o nome e as colunas antigos (removidas no contract).
create view procurement.kitchen_ata_draft
with (security_invoker = true) as
select id, kitchen_id, title, notes, status, created_at, updated_at, reviewed_at, reviewed_by
from procurement.kitchen_demand_forecast;

create view procurement.kitchen_ata_draft_selection
with (security_invoker = true) as
select id, forecast_id as draft_id, template_id, repetitions
from procurement.kitchen_demand_forecast_selection;

create view procurement.kitchen_ata_draft_import
with (security_invoker = true) as
select forecast_id as draft_id, list_id, imported_by, imported_at
from procurement.kitchen_demand_forecast_import;

-- Mesmos grants das tabelas: só o servidor (service_role) alcança.
revoke all on procurement.kitchen_ata_draft, procurement.kitchen_ata_draft_selection, procurement.kitchen_ata_draft_import
from public, anon, authenticated;
grant all on procurement.kitchen_ata_draft, procurement.kitchen_ata_draft_selection, procurement.kitchen_ata_draft_import to service_role;

comment on view procurement.kitchen_ata_draft is
	'Compatibilidade do rename 20260927010000 (→ kitchen_demand_forecast) para o código antigo em produção. Removida em 20260927020000.';
comment on view procurement.kitchen_ata_draft_selection is
	'Compatibilidade do rename 20260927010000 (→ kitchen_demand_forecast_selection). Removida em 20260927020000.';
comment on view procurement.kitchen_ata_draft_import is
	'Compatibilidade do rename 20260927010000 (→ kitchen_demand_forecast_import). Removida em 20260927020000.';

-- ─── 2. Colunas que apontam para o anexo quantitativo ────────────────────────────

-- Espelho entre a coluna antiga e a nova. Uma função por par de nomes; o plpgsql resolve
-- `new.<coluna>` pelo tipo da linha, então a mesma função serve às duas tabelas de cada par.
create function procurement.mirror_procurement_list_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.procurement_list_id is not null and new.ata_id is not null and new.procurement_list_id <> new.ata_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: ata_id e procurement_list_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.ata_id, new.procurement_list_id);
		end if;
		new.procurement_list_id := coalesce(new.procurement_list_id, new.ata_id);
	elsif new.procurement_list_id is distinct from old.procurement_list_id then
		if new.ata_id is distinct from old.ata_id and new.ata_id is distinct from new.procurement_list_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: ata_id e procurement_list_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.ata_id, new.procurement_list_id);
		end if;
	elsif new.ata_id is distinct from old.ata_id then
		new.procurement_list_id := new.ata_id;
	end if;
	new.ata_id := new.procurement_list_id;
	return new;
end;
$$;

create function procurement.mirror_procurement_list_item_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.procurement_list_item_id is not null and new.ata_item_id is not null and new.procurement_list_item_id <> new.ata_item_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: ata_item_id e procurement_list_item_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.ata_item_id, new.procurement_list_item_id);
		end if;
		new.procurement_list_item_id := coalesce(new.procurement_list_item_id, new.ata_item_id);
	elsif new.procurement_list_item_id is distinct from old.procurement_list_item_id then
		if new.ata_item_id is distinct from old.ata_item_id and new.ata_item_id is distinct from new.procurement_list_item_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: ata_item_id e procurement_list_item_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.ata_item_id, new.procurement_list_item_id);
		end if;
	elsif new.ata_item_id is distinct from old.ata_item_id then
		new.procurement_list_item_id := new.ata_item_id;
	end if;
	new.ata_item_id := new.procurement_list_item_id;
	return new;
end;
$$;

comment on function procurement.mirror_procurement_list_id() is
	'Expand de 20260927010000: mantém ata_id = procurement_list_id enquanto o código antigo escreve ata_id. Removida em 20260927020000.';
comment on function procurement.mirror_procurement_list_item_id() is
	'Expand de 20260927010000: mantém ata_item_id = procurement_list_item_id enquanto o código antigo escreve ata_item_id. Removida em 20260927020000.';

-- procurement_arp.ata_id → procurement_list_id
alter table procurement.procurement_arp add column procurement_list_id uuid;
update procurement.procurement_arp set procurement_list_id = ata_id where ata_id is not null;
alter table procurement.procurement_arp
	add constraint procurement_arp_procurement_list_id_fkey
	foreign key (procurement_list_id) references procurement.procurement_list (id) on delete set null;
create index idx_procurement_arp_procurement_list on procurement.procurement_arp (procurement_list_id);
create trigger procurement_arp_mirror_procurement_list_id
before insert or update on procurement.procurement_arp
for each row execute function procurement.mirror_procurement_list_id();

-- procurement_arp_item.ata_item_id → procurement_list_item_id
alter table procurement.procurement_arp_item add column procurement_list_item_id uuid;
update procurement.procurement_arp_item set procurement_list_item_id = ata_item_id where ata_item_id is not null;
alter table procurement.procurement_arp_item
	add constraint procurement_arp_item_procurement_list_item_id_fkey
	foreign key (procurement_list_item_id) references procurement.procurement_list_item (id) on delete set null;
create index idx_arp_item_procurement_list_item on procurement.procurement_arp_item (procurement_list_item_id);
create trigger procurement_arp_item_mirror_procurement_list_item_id
before insert or update on procurement.procurement_arp_item
for each row execute function procurement.mirror_procurement_list_item_id();

-- procurement_pesquisa_preco.ata_id → procurement_list_id
alter table procurement.procurement_pesquisa_preco add column procurement_list_id uuid;
update procurement.procurement_pesquisa_preco set procurement_list_id = ata_id where ata_id is not null;
alter table procurement.procurement_pesquisa_preco
	add constraint procurement_pesquisa_preco_procurement_list_id_fkey
	foreign key (procurement_list_id) references procurement.procurement_list (id) on delete cascade;
create index idx_pesquisa_preco_procurement_list on procurement.procurement_pesquisa_preco (procurement_list_id, created_at desc);
-- O parcial das pesquisas sem anexo troca de coluna; o antigo cede o nome e cai com ela no contract.
alter index procurement.idx_pesquisa_preco_pending rename to idx_pesquisa_preco_pending_ata_id;
create index idx_pesquisa_preco_pending on procurement.procurement_pesquisa_preco (procurement_list_id) where procurement_list_id is null;
create trigger procurement_pesquisa_preco_mirror_procurement_list_id
before insert or update on procurement.procurement_pesquisa_preco
for each row execute function procurement.mirror_procurement_list_id();

-- procurement_pesquisa_preco_item.ata_item_id → procurement_list_item_id
alter table procurement.procurement_pesquisa_preco_item add column procurement_list_item_id uuid;
update procurement.procurement_pesquisa_preco_item set procurement_list_item_id = ata_item_id where ata_item_id is not null;
alter table procurement.procurement_pesquisa_preco_item
	add constraint procurement_pesquisa_preco_item_procurement_list_item_id_fkey
	foreign key (procurement_list_item_id) references procurement.procurement_list_item (id) on delete set null;
create index idx_pesquisa_preco_item_procurement_list_item on procurement.procurement_pesquisa_preco_item (procurement_list_item_id);
create trigger procurement_pesquisa_preco_item_mirror_procurement_list_item_id
before insert or update on procurement.procurement_pesquisa_preco_item
for each row execute function procurement.mirror_procurement_list_item_id();

comment on column procurement.procurement_arp.ata_id is 'Obsoleta: espelho de procurement_list_id até o contract 20260927020000.';
comment on column procurement.procurement_arp_item.ata_item_id is 'Obsoleta: espelho de procurement_list_item_id até o contract 20260927020000.';
comment on column procurement.procurement_pesquisa_preco.ata_id is 'Obsoleta: espelho de procurement_list_id até o contract 20260927020000.';
comment on column procurement.procurement_pesquisa_preco_item.ata_item_id is
	'Obsoleta: espelho de procurement_list_item_id até o contract 20260927020000.';

-- ─── 3. Constraints e índices do anexo quantitativo (só nome) ────────────────────

alter table procurement.procurement_list rename constraint procurement_ata_pkey to procurement_list_pkey;
alter table procurement.procurement_list rename constraint procurement_ata_status_check to procurement_list_status_check;
alter table procurement.procurement_list rename constraint procurement_ata_unit_id_fkey to procurement_list_unit_id_fkey;

alter table procurement.procurement_list_item rename constraint procurement_ata_item_pkey to procurement_list_item_pkey;
alter table procurement.procurement_list_item rename constraint procurement_ata_item_ata_id_fkey to procurement_list_item_list_id_fkey;
-- `product_id` era o nome antigo de `ingredient_id`.
alter table procurement.procurement_list_item rename constraint procurement_ata_item_product_id_fkey to procurement_list_item_ingredient_id_fkey;

alter table procurement.procurement_list_kitchen rename constraint procurement_ata_kitchen_pkey to procurement_list_kitchen_pkey;
alter table procurement.procurement_list_kitchen rename constraint procurement_ata_kitchen_ata_id_fkey to procurement_list_kitchen_list_id_fkey;
alter table procurement.procurement_list_kitchen rename constraint procurement_ata_kitchen_kitchen_id_fkey to procurement_list_kitchen_kitchen_id_fkey;
alter table procurement.procurement_list_kitchen
	rename constraint procurement_ata_kitchen_ata_id_kitchen_id_key to procurement_list_kitchen_list_id_kitchen_id_key;

alter table procurement.procurement_list_selection rename constraint procurement_ata_selection_pkey to procurement_list_selection_pkey;
alter table procurement.procurement_list_selection
	rename constraint procurement_ata_selection_ata_kitchen_id_fkey to procurement_list_selection_list_kitchen_id_fkey;
alter table procurement.procurement_list_selection
	rename constraint procurement_ata_selection_template_id_fkey to procurement_list_selection_template_id_fkey;
alter table procurement.procurement_list_selection
	rename constraint procurement_ata_selection_repetitions_check to procurement_list_selection_repetitions_check;

comment on column procurement.procurement_list.wizard_step is
	'Passo do wizard em andamento (1-4). NULL = anexo fora do wizard (completo ou publicado).';
comment on column procurement.procurement_list.validity_months is
	'Vigência, em meses, da contratação que o anexo quantifica. Multiplica as ocorrências mensais das seleções de exceção. Nulo em anexos anteriores à coluna (tratado como 1).';
comment on column procurement.procurement_list.margin_justification is
	'Justificativa única do anexo para os itens com margem acima da referência. Exigida na publicação.';
