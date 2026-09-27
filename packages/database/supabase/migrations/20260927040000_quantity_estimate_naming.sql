-- Anexo quantitativo: `procurement.procurement_list*` → `procurement.quantity_estimate*` — fase EXPAND.
--
-- Lote 2 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D2 e D4). O
-- anexo quantitativo do termo de referência é a ESTIMATIVA DAS QUANTIDADES (Lei 14.133/2021,
-- art. 18, § 1º, IV; art. 6º, XXIII). Não é lista nem ata (só a ARP é ata, art. 6º, XLVI). E o que o
-- anexo guardava como "margem" é o ACRÉSCIMO da quantidade máxima (art. 82, I) sobre a estimada:
-- margem, na lei, é a de preferência (art. 26).
--
--   tabela                                   → tabela
--   procurement_list                         → quantity_estimate
--   procurement_list_item                    → quantity_estimate_item
--   procurement_list_kitchen                 → quantity_estimate_kitchen
--   procurement_list_selection               → quantity_estimate_selection
--   procurement_list_snapshot_component      → quantity_estimate_snapshot_component
--   procurement_list_snapshot_selection      → quantity_estimate_snapshot_selection
--
--   coluna (nas tabelas renomeadas)          → coluna
--   list_id                                  → quantity_estimate_id
--   list_kitchen_id                          → quantity_estimate_kitchen_id
--   max_margin_percent                       → max_increase_percent
--   margin_justification                     → max_quantity_justification
--   total_quantity                           → estimated_quantity
--
--   coluna (em tabela que fica com o nome)   → coluna
--   procurement_arp.procurement_list_id                     → quantity_estimate_id
--   procurement_arp_item.procurement_list_item_id           → quantity_estimate_item_id
--   procurement_pesquisa_preco.procurement_list_id          → quantity_estimate_id
--   procurement_pesquisa_preco_item.procurement_list_item_id → quantity_estimate_item_id
--   price_research_emission.list_id                         → quantity_estimate_id
--   kitchen_demand_forecast_import.list_id                  → quantity_estimate_id
--
--   valor de CHECK: quantity_estimate.status `published` → `completed` ("publicar" é divulgar
--   no PNCP, art. 54; o anexo é concluído).
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo; a suíte dela tem de continuar
-- verde enquanto o código novo não sobe. Esta migration só ACRESCENTA caminhos (mesma técnica de
-- 20260927010000):
--
--   * Tabela renomeada: o nome antigo vira view de compatibilidade (`security_invoker`) de uma
--     tabela só, com as colunas antigas por alias (`quantity_estimate_id as list_id`) e os
--     mesmos defaults. É auto-updatable: INSERT/UPDATE/DELETE e `on conflict` do código antigo
--     passam direto para a tabela.
--   * Coluna renomeada em tabela que fica com o nome: coluna nova ao lado, backfill, FK e índice
--     próprios, e um trigger BEFORE INSERT OR UPDATE que espelha os dois sentidos e recusa
--     valores divergentes. A antiga mantém FK, índice, unique e PK até o contract: o PostgREST
--     da `main` embute por ela (`procurement_list_item_id (...)` em `replenishment.fn.ts`) e o
--     `on conflict (forecast_id, list_id)` dela usa a PK antiga.
--   * Valor de CHECK: o CHECK aceita `published` e `completed`. NÃO há trigger normalizando
--     `published` → `completed` nesta fase: o código da `main` lê de volta o que gravou
--     (`status === "published"`, a tabela de transições `draft → published`, as asserções da
--     suíte), e um valor trocado por baixo quebraria a `main` até o deploy. O código novo lê os
--     dois e grava só `completed`; o contract converte as linhas e aperta o CHECK.
--   * Constraint e índice: rename direto.
--
-- Nenhuma função, policy ou publicação cita os nomes antigos (conferido em `pg_proc.prosrc`/
-- `prosqlbody`, `pg_policies` e `pg_publication_tables` em 2026-09-27; o bloco abaixo confere de
-- novo na hora de aplicar). A única view que lê as tabelas, `core.v_measure_unit_review`, segue
-- pelo OID; o rótulo textual `'procurement.procurement_list_item'` dela troca no contract, junto
-- com o leitor (`global/review-queues.tsx`), para a `main` não ver o rótulo mudar.
--
-- O CONTRACT (20260927050000) derruba as views, os triggers e as colunas antigas, converte
-- `published` em `completed` e só pode ser aplicado depois do deploy do código que usa só os
-- nomes novos.

-- ─── 0. Conferência: nada no banco cita os nomes antigos pelo texto ──────────────
--
-- plpgsql resolve tabela por nome, não por OID: uma função que citasse `procurement_list`
-- passaria pela view de compatibilidade (sem os triggers da tabela) e quebraria no contract.

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (coalesce(p.prosrc, '') ~ '\mprocurement_list' or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\mprocurement_list');
	if offenders is not null then
		raise exception 'funções citam procurement_list pelo nome e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') ~ '\mprocurement_list' or coalesce(with_check, '') ~ '\mprocurement_list';
	if offenders is not null then
		raise exception 'policies citam procurement_list pelo nome: %', offenders;
	end if;
end;
$$;

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────────

alter table procurement.procurement_list rename to quantity_estimate;
alter table procurement.procurement_list_item rename to quantity_estimate_item;
alter table procurement.procurement_list_kitchen rename to quantity_estimate_kitchen;
alter table procurement.procurement_list_selection rename to quantity_estimate_selection;
alter table procurement.procurement_list_snapshot_component rename to quantity_estimate_snapshot_component;
alter table procurement.procurement_list_snapshot_selection rename to quantity_estimate_snapshot_selection;

-- ─── 2. Colunas das tabelas renomeadas (a view de compatibilidade faz o alias) ─────

alter table procurement.quantity_estimate rename column max_margin_percent to max_increase_percent;
alter table procurement.quantity_estimate rename column margin_justification to max_quantity_justification;

alter table procurement.quantity_estimate_item rename column list_id to quantity_estimate_id;
alter table procurement.quantity_estimate_item rename column total_quantity to estimated_quantity;
alter table procurement.quantity_estimate_item rename column max_margin_percent to max_increase_percent;

alter table procurement.quantity_estimate_kitchen rename column list_id to quantity_estimate_id;

alter table procurement.quantity_estimate_selection rename column list_kitchen_id to quantity_estimate_kitchen_id;

alter table procurement.quantity_estimate_snapshot_component rename column list_id to quantity_estimate_id;
alter table procurement.quantity_estimate_snapshot_component rename column total_quantity to estimated_quantity;
alter table procurement.quantity_estimate_snapshot_component rename column max_margin_percent to max_increase_percent;

alter table procurement.quantity_estimate_snapshot_selection rename column list_id to quantity_estimate_id;

-- ─── 3. Constraints e índices das tabelas renomeadas (só nome) ────────────────────

alter table procurement.quantity_estimate rename constraint procurement_list_pkey to quantity_estimate_pkey;
alter table procurement.quantity_estimate rename constraint procurement_list_unit_id_fkey to quantity_estimate_unit_id_fkey;
alter table procurement.quantity_estimate rename constraint procurement_list_segment_id_fkey to quantity_estimate_segment_id_fkey;
alter table procurement.quantity_estimate
	rename constraint procurement_list_max_margin_percent_check to quantity_estimate_max_increase_percent_check;
alter table procurement.quantity_estimate
	rename constraint procurement_list_min_quote_percent_check to quantity_estimate_min_quote_percent_check;
alter table procurement.quantity_estimate
	rename constraint procurement_list_validity_months_check to quantity_estimate_validity_months_check;
alter table procurement.quantity_estimate rename constraint procurement_list_wizard_step_check to quantity_estimate_wizard_step_check;
alter index procurement.idx_procurement_list_unit_status rename to idx_quantity_estimate_unit_status;
alter index procurement.procurement_list_segment_idx rename to quantity_estimate_segment_idx;
alter index procurement.procurement_list_unit_id_fk_idx rename to quantity_estimate_unit_id_fk_idx;

alter table procurement.quantity_estimate_item rename constraint procurement_list_item_pkey to quantity_estimate_item_pkey;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_list_id_fkey to quantity_estimate_item_quantity_estimate_id_fkey;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_ingredient_id_fkey to quantity_estimate_item_ingredient_id_fkey;
alter table procurement.quantity_estimate_item rename constraint procurement_list_item_folder_id_fkey to quantity_estimate_item_folder_id_fkey;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_purchase_item_id_fkey to quantity_estimate_item_purchase_item_id_fkey;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_delivery_cycle_check to quantity_estimate_item_delivery_cycle_check;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_max_margin_percent_check to quantity_estimate_item_max_increase_percent_check;
alter table procurement.quantity_estimate_item
	rename constraint procurement_list_item_min_order_quantity_check to quantity_estimate_item_min_order_quantity_check;
alter index procurement.idx_procurement_list_item_list_id rename to idx_quantity_estimate_item_quantity_estimate_id;
alter index procurement.procurement_list_item_folder_id_fk_idx rename to quantity_estimate_item_folder_id_fk_idx;
alter index procurement.procurement_list_item_ingredient_id_fk_idx rename to quantity_estimate_item_ingredient_id_fk_idx;
alter index procurement.procurement_list_item_purchase_item_idx rename to quantity_estimate_item_purchase_item_idx;

alter table procurement.quantity_estimate_kitchen rename constraint procurement_list_kitchen_pkey to quantity_estimate_kitchen_pkey;
alter table procurement.quantity_estimate_kitchen
	rename constraint procurement_list_kitchen_list_id_fkey to quantity_estimate_kitchen_quantity_estimate_id_fkey;
alter table procurement.quantity_estimate_kitchen
	rename constraint procurement_list_kitchen_kitchen_id_fkey to quantity_estimate_kitchen_kitchen_id_fkey;
alter table procurement.quantity_estimate_kitchen
	rename constraint procurement_list_kitchen_list_id_kitchen_id_key to quantity_estimate_kitchen_quantity_estimate_id_kitchen_id_key;
alter index procurement.idx_procurement_list_kitchen_list_id rename to idx_quantity_estimate_kitchen_quantity_estimate_id;
alter index procurement.procurement_list_kitchen_kitchen_id_fk_idx rename to quantity_estimate_kitchen_kitchen_id_fk_idx;

alter table procurement.quantity_estimate_selection rename constraint procurement_list_selection_pkey to quantity_estimate_selection_pkey;
alter table procurement.quantity_estimate_selection
	rename constraint procurement_list_selection_list_kitchen_id_fkey to quantity_estimate_selection_quantity_estimate_kitchen_id_fkey;
alter table procurement.quantity_estimate_selection
	rename constraint procurement_list_selection_template_id_fkey to quantity_estimate_selection_template_id_fkey;
alter table procurement.quantity_estimate_selection
	rename constraint procurement_list_selection_origin_template_id_fkey to quantity_estimate_selection_origin_template_id_fkey;
alter table procurement.quantity_estimate_selection
	rename constraint procurement_list_selection_repetitions_check to quantity_estimate_selection_repetitions_check;
alter index procurement.procurement_list_selection_list_kitchen_id_fk_idx rename to quantity_estimate_selection_quantity_estimate_kitchen_id_fk_idx;
alter index procurement.procurement_list_selection_template_id_fk_idx rename to quantity_estimate_selection_template_id_fk_idx;
alter index procurement.procurement_list_selection_origin_template_id_fk_idx rename to quantity_estimate_selection_origin_template_id_fk_idx;

alter table procurement.quantity_estimate_snapshot_component
	rename constraint procurement_list_snapshot_component_pkey to quantity_estimate_snapshot_component_pkey;
alter table procurement.quantity_estimate_snapshot_component
	rename constraint procurement_list_snapshot_component_list_id_fkey to quantity_estimate_snapshot_component_quantity_estimate_id_fkey;
alter table procurement.quantity_estimate_snapshot_component
	rename constraint procurement_list_snapshot_component_snapshot_source_check to quantity_estimate_snapshot_component_snapshot_source_check;
alter index procurement.idx_proc_snapshot_component_list_id rename to idx_quantity_estimate_snapshot_component_quantity_estimate_id;

alter table procurement.quantity_estimate_snapshot_selection
	rename constraint procurement_list_snapshot_selection_pkey to quantity_estimate_snapshot_selection_pkey;
alter table procurement.quantity_estimate_snapshot_selection
	rename constraint procurement_list_snapshot_selection_list_id_fkey to quantity_estimate_snapshot_selection_quantity_estimate_id_fkey;
alter table procurement.quantity_estimate_snapshot_selection
	rename constraint procurement_list_snapshot_selection_snapshot_source_check to quantity_estimate_snapshot_selection_snapshot_source_check;
alter index procurement.idx_proc_snapshot_selection_list_id rename to idx_quantity_estimate_snapshot_selection_quantity_estimate_id;

-- ─── 4. Status: `completed` ao lado de `published` até o contract ─────────────────

alter table procurement.quantity_estimate drop constraint procurement_list_status_check;
alter table procurement.quantity_estimate
	add constraint quantity_estimate_status_check check (status = any (array['draft', 'completed', 'published', 'archived']));

-- ─── 5. Comentários ──────────────────────────────────────────────────────────────

comment on table procurement.quantity_estimate is
	'Anexo quantitativo do termo de referência: a estimativa das quantidades (Lei 14.133, art. 18, § 1º, IV). Não é ata: só a Ata de Registro de Preços é ata (art. 6º, XLVI). status: draft → completed (concluído) → archived; `published` é o nome antigo de `completed` até o contract 20260927050000.';
comment on table procurement.quantity_estimate_item is
	'Item do anexo quantitativo: quantidade estimada (Lei 14.133, art. 18, § 1º, IV) e máxima (art. 82, I) de um insumo.';
comment on table procurement.quantity_estimate_kitchen is 'Cozinha atendida pelo anexo quantitativo.';
comment on table procurement.quantity_estimate_selection is 'Cardápio considerado no anexo quantitativo, por cozinha, com as repetições.';
comment on table procurement.quantity_estimate_snapshot_component is 'Retrato dos itens do anexo quantitativo congelado na conclusão.';
comment on table procurement.quantity_estimate_snapshot_selection is 'Retrato dos cardápios do anexo quantitativo congelado na conclusão.';

comment on column procurement.quantity_estimate.wizard_step is
	'Passo do wizard em andamento (1-4). NULL = anexo fora do wizard (completo ou concluído).';
comment on column procurement.quantity_estimate.max_increase_percent is
	'Acréscimo padrão da quantidade máxima (Lei 14.133, art. 82, I) sobre a quantidade estimada, em %. O item pode sobrescrever.';
comment on column procurement.quantity_estimate.max_quantity_justification is
	'Justificativa única do anexo para os itens com acréscimo acima da referência. Exigida na conclusão.';
comment on column procurement.quantity_estimate_item.estimated_quantity is
	'Quantidade estimada (Lei 14.133, art. 18, § 1º, IV), na unidade do insumo.';
comment on column procurement.quantity_estimate_item.max_increase_percent is
	'Acréscimo da quantidade máxima sobre a estimada, em %. Nulo = vale o do anexo.';
comment on column procurement.quantity_estimate_snapshot_component.estimated_quantity is
	'Quantidade estimada congelada na conclusão.';
comment on column kitchen.ingredient.default_delivery_cycle is
	'Ciclo de entrega padrão do insumo nos anexos quantitativos (weekly = perecível, monthly = não perecível). O ciclo efetivo de cada anexo fica em quantity_estimate_item.delivery_cycle.';

-- ─── 6. Views de compatibilidade com os nomes e as colunas antigos ──────────────────
--
-- Mesma ordem de colunas das tabelas antigas. Os defaults são repetidos na view para quem
-- insere sem a coluna (o PostgREST lê o default da relação que recebe o INSERT).

create view procurement.procurement_list
with (security_invoker = true) as
select
	id,
	unit_id,
	title,
	notes,
	status,
	created_at,
	updated_at,
	deleted_at,
	wizard_step,
	validity_months,
	max_increase_percent as max_margin_percent,
	max_quantity_justification as margin_justification,
	segment_id,
	is_budget_confidential,
	min_quote_percent
from procurement.quantity_estimate;

alter view procurement.procurement_list alter column id set default gen_random_uuid();
alter view procurement.procurement_list alter column status set default 'draft';
alter view procurement.procurement_list alter column created_at set default now();
alter view procurement.procurement_list alter column max_margin_percent set default 20;
alter view procurement.procurement_list alter column is_budget_confidential set default false;
alter view procurement.procurement_list alter column min_quote_percent set default 100;

create view procurement.procurement_list_item
with (security_invoker = true) as
select
	id,
	quantity_estimate_id as list_id,
	ingredient_id,
	catmat_item_codigo,
	catmat_item_descricao,
	ingredient_name,
	folder_id,
	folder_description,
	measure_unit,
	estimated_quantity as total_quantity,
	unit_price,
	purchase_item_id,
	purchase_item_description,
	purchase_measure_unit,
	purchase_quantity,
	conversion_factor,
	item_description,
	computed_at,
	max_increase_percent as max_margin_percent,
	delivery_cycle,
	min_order_quantity
from procurement.quantity_estimate_item;

alter view procurement.procurement_list_item alter column id set default gen_random_uuid();

create view procurement.procurement_list_kitchen
with (security_invoker = true) as
select id, quantity_estimate_id as list_id, kitchen_id, delivery_notes
from procurement.quantity_estimate_kitchen;

alter view procurement.procurement_list_kitchen alter column id set default gen_random_uuid();

create view procurement.procurement_list_selection
with (security_invoker = true) as
select id, quantity_estimate_kitchen_id as list_kitchen_id, template_id, repetitions, origin_template_id
from procurement.quantity_estimate_selection;

alter view procurement.procurement_list_selection alter column id set default gen_random_uuid();
alter view procurement.procurement_list_selection alter column repetitions set default 1;

create view procurement.procurement_list_snapshot_component
with (security_invoker = true) as
select
	id,
	quantity_estimate_id as list_id,
	ingredient_id,
	ingredient_name,
	folder_description,
	measure_unit,
	estimated_quantity as total_quantity,
	purchase_item_id,
	purchase_item_description,
	purchase_measure_unit,
	purchase_quantity,
	catmat_item_codigo,
	unit_price,
	snapshot_source,
	computed_at,
	max_increase_percent as max_margin_percent,
	max_quantity,
	delivery_cycle,
	min_order_quantity,
	min_quote_quantity
from procurement.quantity_estimate_snapshot_component;

alter view procurement.procurement_list_snapshot_component alter column id set default gen_random_uuid();
alter view procurement.procurement_list_snapshot_component alter column snapshot_source set default 'native';
alter view procurement.procurement_list_snapshot_component alter column computed_at set default now();

create view procurement.procurement_list_snapshot_selection
with (security_invoker = true) as
select
	id,
	quantity_estimate_id as list_id,
	origin_template_id,
	template_name,
	template_type,
	kitchen_id,
	kitchen_name,
	repetitions,
	snapshot_source,
	created_at
from procurement.quantity_estimate_snapshot_selection;

alter view procurement.procurement_list_snapshot_selection alter column id set default gen_random_uuid();
alter view procurement.procurement_list_snapshot_selection alter column repetitions set default 1;
alter view procurement.procurement_list_snapshot_selection alter column snapshot_source set default 'native';
alter view procurement.procurement_list_snapshot_selection alter column created_at set default now();

-- Mesmos grants das tabelas: só o servidor (service_role) escreve; o leitor do analytics lê o
-- cabeçalho e os itens, como já lia pelas tabelas.
revoke all on procurement.procurement_list, procurement.procurement_list_item, procurement.procurement_list_kitchen,
procurement.procurement_list_selection, procurement.procurement_list_snapshot_component, procurement.procurement_list_snapshot_selection
from public, anon, authenticated;
grant all on procurement.procurement_list, procurement.procurement_list_item, procurement.procurement_list_kitchen,
procurement.procurement_list_selection, procurement.procurement_list_snapshot_component, procurement.procurement_list_snapshot_selection
to service_role;
grant select on procurement.procurement_list, procurement.procurement_list_item to analytics_reader;

comment on view procurement.procurement_list is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate) para o código antigo em produção. Removida em 20260927050000.';
comment on view procurement.procurement_list_item is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate_item). Removida em 20260927050000.';
comment on view procurement.procurement_list_kitchen is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate_kitchen). Removida em 20260927050000.';
comment on view procurement.procurement_list_selection is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate_selection). Removida em 20260927050000.';
comment on view procurement.procurement_list_snapshot_component is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate_snapshot_component). Removida em 20260927050000.';
comment on view procurement.procurement_list_snapshot_selection is
	'Compatibilidade do rename 20260927040000 (→ quantity_estimate_snapshot_selection). Removida em 20260927050000.';

-- ─── 7. Colunas que apontam para o anexo em tabelas que ficam com o nome ───────────
--
-- Uma função de espelho por par de nomes; o plpgsql resolve `new.<coluna>` pelo tipo da linha,
-- então a mesma função serve às duas tabelas de cada par. INSERT: aceita qualquer uma das duas
-- e recusa as duas divergentes. UPDATE: vale a que mudou; as duas mudadas para valores
-- diferentes são recusadas.

-- procurement_list_id → quantity_estimate_id (procurement_arp, procurement_pesquisa_preco)
create function procurement.mirror_quantity_estimate_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.quantity_estimate_id is not null and new.procurement_list_id is not null and new.quantity_estimate_id <> new.procurement_list_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: procurement_list_id e quantity_estimate_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.procurement_list_id, new.quantity_estimate_id);
		end if;
		new.quantity_estimate_id := coalesce(new.quantity_estimate_id, new.procurement_list_id);
	elsif new.quantity_estimate_id is distinct from old.quantity_estimate_id then
		if new.procurement_list_id is distinct from old.procurement_list_id and new.procurement_list_id is distinct from new.quantity_estimate_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: procurement_list_id e quantity_estimate_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.procurement_list_id, new.quantity_estimate_id);
		end if;
	elsif new.procurement_list_id is distinct from old.procurement_list_id then
		new.quantity_estimate_id := new.procurement_list_id;
	end if;
	new.procurement_list_id := new.quantity_estimate_id;
	return new;
end;
$$;

-- procurement_list_item_id → quantity_estimate_item_id (procurement_arp_item, procurement_pesquisa_preco_item)
create function procurement.mirror_quantity_estimate_item_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.quantity_estimate_item_id is not null and new.procurement_list_item_id is not null
			and new.quantity_estimate_item_id <> new.procurement_list_item_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: procurement_list_item_id e quantity_estimate_item_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.procurement_list_item_id, new.quantity_estimate_item_id);
		end if;
		new.quantity_estimate_item_id := coalesce(new.quantity_estimate_item_id, new.procurement_list_item_id);
	elsif new.quantity_estimate_item_id is distinct from old.quantity_estimate_item_id then
		if new.procurement_list_item_id is distinct from old.procurement_list_item_id and new.procurement_list_item_id is distinct from new.quantity_estimate_item_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: procurement_list_item_id e quantity_estimate_item_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.procurement_list_item_id, new.quantity_estimate_item_id);
		end if;
	elsif new.procurement_list_item_id is distinct from old.procurement_list_item_id then
		new.quantity_estimate_item_id := new.procurement_list_item_id;
	end if;
	new.procurement_list_item_id := new.quantity_estimate_item_id;
	return new;
end;
$$;

-- list_id → quantity_estimate_id (price_research_emission, kitchen_demand_forecast_import)
create function procurement.mirror_quantity_estimate_id_from_list_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.quantity_estimate_id is not null and new.list_id is not null and new.quantity_estimate_id <> new.list_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: list_id e quantity_estimate_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.list_id, new.quantity_estimate_id);
		end if;
		new.quantity_estimate_id := coalesce(new.quantity_estimate_id, new.list_id);
	elsif new.quantity_estimate_id is distinct from old.quantity_estimate_id then
		if new.list_id is distinct from old.list_id and new.list_id is distinct from new.quantity_estimate_id then
			raise exception using
				errcode = '23514',
				message = format('%I.%I: list_id e quantity_estimate_id divergem (%s ≠ %s)', tg_table_schema, tg_table_name, new.list_id, new.quantity_estimate_id);
		end if;
	elsif new.list_id is distinct from old.list_id then
		new.quantity_estimate_id := new.list_id;
	end if;
	new.list_id := new.quantity_estimate_id;
	return new;
end;
$$;

comment on function procurement.mirror_quantity_estimate_id() is
	'Expand de 20260927040000: mantém procurement_list_id = quantity_estimate_id enquanto o código antigo escreve procurement_list_id. Removida em 20260927050000.';
comment on function procurement.mirror_quantity_estimate_item_id() is
	'Expand de 20260927040000: mantém procurement_list_item_id = quantity_estimate_item_id enquanto o código antigo escreve procurement_list_item_id. Removida em 20260927050000.';
comment on function procurement.mirror_quantity_estimate_id_from_list_id() is
	'Expand de 20260927040000: mantém list_id = quantity_estimate_id enquanto o código antigo escreve list_id. Removida em 20260927050000.';

-- procurement_arp.procurement_list_id → quantity_estimate_id
alter table procurement.procurement_arp add column quantity_estimate_id uuid;
update procurement.procurement_arp set quantity_estimate_id = procurement_list_id where procurement_list_id is not null;
alter table procurement.procurement_arp
	add constraint procurement_arp_quantity_estimate_id_fkey
	foreign key (quantity_estimate_id) references procurement.quantity_estimate (id) on delete set null;
create index idx_procurement_arp_quantity_estimate on procurement.procurement_arp (quantity_estimate_id);
create trigger procurement_arp_mirror_quantity_estimate_id
before insert or update on procurement.procurement_arp
for each row execute function procurement.mirror_quantity_estimate_id();

-- procurement_arp_item.procurement_list_item_id → quantity_estimate_item_id
alter table procurement.procurement_arp_item add column quantity_estimate_item_id uuid;
update procurement.procurement_arp_item set quantity_estimate_item_id = procurement_list_item_id where procurement_list_item_id is not null;
alter table procurement.procurement_arp_item
	add constraint procurement_arp_item_quantity_estimate_item_id_fkey
	foreign key (quantity_estimate_item_id) references procurement.quantity_estimate_item (id) on delete set null;
create index idx_arp_item_quantity_estimate_item on procurement.procurement_arp_item (quantity_estimate_item_id);
create trigger procurement_arp_item_mirror_quantity_estimate_item_id
before insert or update on procurement.procurement_arp_item
for each row execute function procurement.mirror_quantity_estimate_item_id();

-- procurement_pesquisa_preco.procurement_list_id → quantity_estimate_id
alter table procurement.procurement_pesquisa_preco add column quantity_estimate_id uuid;
update procurement.procurement_pesquisa_preco set quantity_estimate_id = procurement_list_id where procurement_list_id is not null;
alter table procurement.procurement_pesquisa_preco
	add constraint procurement_pesquisa_preco_quantity_estimate_id_fkey
	foreign key (quantity_estimate_id) references procurement.quantity_estimate (id) on delete cascade;
create index idx_pesquisa_preco_quantity_estimate on procurement.procurement_pesquisa_preco (quantity_estimate_id, created_at desc);
-- O parcial das pesquisas sem anexo troca de coluna; o antigo cede o nome e cai com ela no contract.
alter index procurement.idx_pesquisa_preco_pending rename to idx_pesquisa_preco_pending_procurement_list_id;
create index idx_pesquisa_preco_pending on procurement.procurement_pesquisa_preco (quantity_estimate_id) where quantity_estimate_id is null;
create trigger procurement_pesquisa_preco_mirror_quantity_estimate_id
before insert or update on procurement.procurement_pesquisa_preco
for each row execute function procurement.mirror_quantity_estimate_id();

-- procurement_pesquisa_preco_item.procurement_list_item_id → quantity_estimate_item_id
alter table procurement.procurement_pesquisa_preco_item add column quantity_estimate_item_id uuid;
update procurement.procurement_pesquisa_preco_item
set quantity_estimate_item_id = procurement_list_item_id
where procurement_list_item_id is not null;
alter table procurement.procurement_pesquisa_preco_item
	add constraint procurement_pesquisa_preco_item_quantity_estimate_item_id_fkey
	foreign key (quantity_estimate_item_id) references procurement.quantity_estimate_item (id) on delete set null;
create index idx_pesquisa_preco_item_quantity_estimate_item on procurement.procurement_pesquisa_preco_item (quantity_estimate_item_id);
create trigger procurement_pesquisa_preco_item_mirror_quantity_estimate_item
before insert or update on procurement.procurement_pesquisa_preco_item
for each row execute function procurement.mirror_quantity_estimate_item_id();

-- price_research_emission.list_id → quantity_estimate_id
-- A emissão é apenas-inserção (`price_research_emission_no_update`); o backfill é a única
-- atualização legítima e desliga o trigger só dentro desta transação.
alter table procurement.price_research_emission add column quantity_estimate_id uuid;
alter table procurement.price_research_emission disable trigger price_research_emission_no_update;
update procurement.price_research_emission set quantity_estimate_id = list_id;
alter table procurement.price_research_emission enable trigger price_research_emission_no_update;
alter table procurement.price_research_emission alter column quantity_estimate_id set not null;
alter table procurement.price_research_emission
	add constraint price_research_emission_quantity_estimate_id_fkey
	foreign key (quantity_estimate_id) references procurement.quantity_estimate (id) on delete cascade;
alter table procurement.price_research_emission
	add constraint price_research_emission_quantity_estimate_id_sequence_key unique (quantity_estimate_id, sequence);
create trigger price_research_emission_mirror_quantity_estimate_id
before insert or update on procurement.price_research_emission
for each row execute function procurement.mirror_quantity_estimate_id_from_list_id();

-- kitchen_demand_forecast_import.list_id → quantity_estimate_id
-- A PK (forecast_id, list_id) fica até o contract, que promove o unique novo a PK.
alter table procurement.kitchen_demand_forecast_import add column quantity_estimate_id uuid;
update procurement.kitchen_demand_forecast_import set quantity_estimate_id = list_id;
alter table procurement.kitchen_demand_forecast_import alter column quantity_estimate_id set not null;
alter table procurement.kitchen_demand_forecast_import
	add constraint kitchen_demand_forecast_import_quantity_estimate_id_fkey
	foreign key (quantity_estimate_id) references procurement.quantity_estimate (id) on delete cascade;
alter table procurement.kitchen_demand_forecast_import
	add constraint kitchen_demand_forecast_import_quantity_estimate_key unique (forecast_id, quantity_estimate_id);
create index kitchen_demand_forecast_import_quantity_estimate_idx on procurement.kitchen_demand_forecast_import (quantity_estimate_id);
create trigger kitchen_demand_forecast_import_mirror_quantity_estimate_id
before insert or update on procurement.kitchen_demand_forecast_import
for each row execute function procurement.mirror_quantity_estimate_id_from_list_id();

comment on column procurement.procurement_arp.procurement_list_id is 'Obsoleta: espelho de quantity_estimate_id até o contract 20260927050000.';
comment on column procurement.procurement_arp_item.procurement_list_item_id is
	'Obsoleta: espelho de quantity_estimate_item_id até o contract 20260927050000.';
comment on column procurement.procurement_pesquisa_preco.procurement_list_id is
	'Obsoleta: espelho de quantity_estimate_id até o contract 20260927050000.';
comment on column procurement.procurement_pesquisa_preco_item.procurement_list_item_id is
	'Obsoleta: espelho de quantity_estimate_item_id até o contract 20260927050000.';
comment on column procurement.price_research_emission.list_id is 'Obsoleta: espelho de quantity_estimate_id até o contract 20260927050000.';
comment on column procurement.kitchen_demand_forecast_import.list_id is
	'Obsoleta: espelho de quantity_estimate_id até o contract 20260927050000.';
