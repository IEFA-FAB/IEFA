-- Pesquisa de preços e prefixos redundantes → nomes do glossário — fase EXPAND.
--
-- Lote 3 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D1, D2, D4).
-- A pesquisa de preços (Lei 14.133/2021, art. 23; IN SEGES/ME 65/2021) tinha dois nomes, um em
-- cada língua (`procurement_pesquisa_preco` numa tabela, `price_research_emission` na vizinha), e
-- a amostra coletada chamava-se pelo nome da API de origem (`compras_amostra`). E o schema já diz
-- o domínio: `procurement.procurement_arp` repetia a palavra (D1, critério 4).
--
--   tabela                                   → tabela
--   procurement_pesquisa_preco               → price_research
--   procurement_pesquisa_preco_item          → price_research_item
--   procurement_pesquisa_preco_amostra       → price_research_sample
--   compras_amostra                          → price_sample
--   procurement_arp                          → arp
--   procurement_arp_item                     → arp_item
--   procurement_segment                      → segment
--   procurement_segment_rule                 → segment_rule
--
--   coluna (na tabela renomeada)             → coluna
--   price_research_sample.amostra_id         → price_sample_id
--
--   função                                   → função
--   procurement.upsert_compras_amostras      → procurement.upsert_price_samples (a antiga vira wrapper)
--   sisub.compras_amostra_fingerprint        → sisub.price_sample_fingerprint (a antiga vira wrapper)
--   procurement.procurement_arp_check_acquisition → procurement.arp_check_acquisition (trigger)
--   finance.empenho_item_check_unit, inventory.designations_covering,
--   procurement.supply_order_empenho_usage   → recriadas, com os nomes novos das tabelas
--
-- As colunas de `price_sample` espelham a API do Compras.gov.br e ficam (`id_compra`,
-- `descricao_item`, `ni_fornecedor`...): o nome da tabela é nosso, o das colunas é do terceiro
-- (D2). Idem `numero_ata`, `ano_ata`, `status_ata`, `quantidade_homologada`... da ARP (D3).
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo; a suíte dela tem de continuar
-- verde enquanto o código novo não sobe. Esta migration só ACRESCENTA caminhos (mesma técnica de
-- 20260927010000 e 20260927040000):
--
--   * Tabela renomeada: o nome antigo vira view de compatibilidade (`security_invoker`) de uma
--     tabela só, com a coluna antiga por alias (`price_sample_id as amostra_id`) e os mesmos
--     defaults. É auto-updatable: INSERT/UPDATE/DELETE e `on conflict` do código antigo passam
--     direto para a tabela, e os triggers da tabela disparam.
--   * Nenhuma coluna é espelhada por trigger: a única coluna renomeada (`amostra_id`) está numa
--     tabela renomeada, e a view faz o alias. As FKs de fora que apontam para estas tabelas
--     (`finance.empenho_item.arp_item_id`, `supply_order_item.arp_item_id`,
--     `contract_designation.arp_id`, `quantity_estimate.segment_id`) já têm o nome do glossário e
--     seguem a tabela pelo OID. Por isso o código novo não precisa citar coluna antiga nenhuma.
--   * Função que cita tabela renomeada pelo nome é recriada aqui com o nome novo: plpgsql e SQL
--     resolvem tabela pelo nome, e passariam pela view até o contract derrubá-la. Função
--     renomeada ganha o nome novo e a antiga vira wrapper que chama a nova, para o código da
--     `main` (a RPC `upsert_compras_amostras` do worker da API). Todas com `set search_path = ''`.
--   * Constraint, índice e trigger: rename direto.
--
-- O único objeto que lê estas tabelas sem ser função, `inventory.v_supplier_lead_time`, segue
-- pelo OID. Nenhuma policy nem publicação as cita (conferido em `pg_policies` e
-- `pg_publication_tables` em 2026-09-27); o bloco do fim confere tudo de novo na hora de aplicar.
--
-- O CONTRACT (20260927070000) derruba as views e os wrappers, e só pode ser aplicado depois do
-- deploy do código que usa só os nomes novos.

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────────

alter table procurement.procurement_pesquisa_preco rename to price_research;
alter table procurement.procurement_pesquisa_preco_item rename to price_research_item;
alter table procurement.procurement_pesquisa_preco_amostra rename to price_research_sample;
alter table procurement.compras_amostra rename to price_sample;
alter table procurement.procurement_arp rename to arp;
alter table procurement.procurement_arp_item rename to arp_item;
alter table procurement.procurement_segment rename to segment;
alter table procurement.procurement_segment_rule rename to segment_rule;

-- ─── 2. Coluna da tabela renomeada (a view de compatibilidade faz o alias) ────────

alter table procurement.price_research_sample rename column amostra_id to price_sample_id;

-- ─── 3. Constraints e índices (só nome) ─────────────────────────────────────────────

-- price_research
alter table procurement.price_research rename constraint procurement_pesquisa_preco_pkey to price_research_pkey;
alter table procurement.price_research rename constraint procurement_pesquisa_preco_created_by_fkey to price_research_created_by_fkey;
alter table procurement.price_research
	rename constraint procurement_pesquisa_preco_quantity_estimate_id_fkey to price_research_quantity_estimate_id_fkey;
alter table procurement.price_research
	rename constraint procurement_pesquisa_preco_reference_method_check to price_research_reference_method_check;
alter index procurement.idx_pesquisa_preco_pending rename to idx_price_research_pending;
alter index procurement.idx_pesquisa_preco_quantity_estimate rename to idx_price_research_quantity_estimate;
alter index procurement.procurement_pesquisa_preco_created_by_fk_idx rename to price_research_created_by_fk_idx;
alter index procurement.uq_pesquisa_preco_idempotency rename to uq_price_research_idempotency;

-- price_research_item
alter table procurement.price_research_item rename constraint procurement_pesquisa_preco_item_pkey to price_research_item_pkey;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_item_research_id_fkey to price_research_item_research_id_fkey;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_item_quantity_estimate_item_id_fkey to price_research_item_quantity_estimate_item_id_fkey;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_item_reference_method_check to price_research_item_reference_method_check;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_item_justification_low_sample_check to price_research_item_justification_low_sample_check;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_item_justification_method_check to price_research_item_justification_method_check;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_i_justification_outlier_criter_check to price_research_item_justification_outlier_criteria_check;
alter table procurement.price_research_item
	rename constraint procurement_pesquisa_preco_it_justification_out_of_period_check to price_research_item_justification_out_of_period_check;
alter index procurement.idx_pesquisa_preco_item_research rename to idx_price_research_item_research;
alter index procurement.idx_pesquisa_preco_item_quantity_estimate_item rename to idx_price_research_item_quantity_estimate_item;

-- price_research_sample
alter table procurement.price_research_sample rename constraint procurement_pesquisa_preco_amostra_pkey to price_research_sample_pkey;
alter table procurement.price_research_sample
	rename constraint procurement_pesquisa_preco_amostra_research_item_id_fkey to price_research_sample_research_item_id_fkey;
alter table procurement.price_research_sample
	rename constraint procurement_pesquisa_preco_amostra_amostra_id_fkey to price_research_sample_price_sample_id_fkey;
alter table procurement.price_research_sample
	rename constraint procurement_pesquisa_preco_amostra_sample_type_check to price_research_sample_sample_type_check;
alter table procurement.price_research_sample
	rename constraint procurement_pesquisa_preco_amostra_art5_parameter_check to price_research_sample_art5_parameter_check;
alter index procurement.idx_pesquisa_preco_amostra_item_type rename to idx_price_research_sample_item_type;
alter index procurement.procurement_pesquisa_preco_amostra_amostra_id_fk_idx rename to price_research_sample_price_sample_id_fk_idx;
alter index procurement.uq_amostra_research_item_amostra rename to uq_price_research_sample_item_sample;

-- price_sample
alter table procurement.price_sample rename constraint compras_amostra_pkey to price_sample_pkey;
alter index procurement.idx_compras_amostra_compra rename to idx_price_sample_compra;
alter index procurement.uq_compras_amostra_fingerprint rename to uq_price_sample_fingerprint;

-- arp
alter table procurement.arp rename constraint procurement_arp_pkey to arp_pkey;
alter table procurement.arp rename constraint procurement_arp_unit_id_fkey to arp_unit_id_fkey;
alter table procurement.arp rename constraint procurement_arp_acquisition_id_fkey to arp_acquisition_id_fkey;
alter table procurement.arp rename constraint procurement_arp_quantity_estimate_id_fkey to arp_quantity_estimate_id_fkey;
alter table procurement.arp rename constraint procurement_arp_source_check to arp_source_check;
alter table procurement.arp
	rename constraint procurement_arp_unit_id_numero_ata_uasg_gerenciadora_key to arp_unit_id_numero_ata_uasg_gerenciadora_key;
alter index procurement.idx_procurement_arp_unit rename to idx_arp_unit;
alter index procurement.idx_procurement_arp_quantity_estimate rename to idx_arp_quantity_estimate;
alter index procurement.procurement_arp_acquisition_idx rename to arp_acquisition_idx;

-- arp_item (`idx_arp_item_*` já nasceram sem o prefixo)
alter table procurement.arp_item rename constraint procurement_arp_item_pkey to arp_item_pkey;
alter table procurement.arp_item rename constraint procurement_arp_item_arp_id_fkey to arp_item_arp_id_fkey;
alter table procurement.arp_item
	rename constraint procurement_arp_item_quantity_estimate_item_id_fkey to arp_item_quantity_estimate_item_id_fkey;
alter table procurement.arp_item rename constraint procurement_arp_item_source_check to arp_item_source_check;
alter index procurement.procurement_arp_item_numero_uq rename to arp_item_numero_uq;

-- segment
alter table procurement.segment rename constraint procurement_segment_pkey to segment_pkey;
alter table procurement.segment rename constraint procurement_segment_unit_id_fkey to segment_unit_id_fkey;
alter table procurement.segment rename constraint procurement_segment_created_by_fkey to segment_created_by_fkey;
alter table procurement.segment rename constraint procurement_segment_name_check to segment_name_check;
alter table procurement.segment rename constraint procurement_segment_planned_month_check to segment_planned_month_check;
alter table procurement.segment rename constraint procurement_segment_lead_time_months_check to segment_lead_time_months_check;
alter table procurement.segment rename constraint procurement_segment_validity_months_check to segment_validity_months_check;
alter index procurement.procurement_segment_unit_id_fk_idx rename to segment_unit_id_fk_idx;
alter index procurement.procurement_segment_created_by_fk_idx rename to segment_created_by_fk_idx;
alter index procurement.procurement_segment_unit_name_uq rename to segment_unit_name_uq;

-- segment_rule
alter table procurement.segment_rule rename constraint procurement_segment_rule_pkey to segment_rule_pkey;
alter table procurement.segment_rule rename constraint procurement_segment_rule_segment_id_fkey to segment_rule_segment_id_fkey;
alter table procurement.segment_rule rename constraint procurement_segment_rule_folder_id_fkey to segment_rule_folder_id_fkey;
alter table procurement.segment_rule rename constraint procurement_segment_rule_purchase_item_id_fkey to segment_rule_purchase_item_id_fkey;
alter table procurement.segment_rule rename constraint procurement_segment_rule_mode_check to segment_rule_mode_check;
alter table procurement.segment_rule rename constraint procurement_segment_rule_target_ck to segment_rule_target_ck;
alter index procurement.procurement_segment_rule_segment_id_fk_idx rename to segment_rule_segment_id_fk_idx;
alter index procurement.procurement_segment_rule_folder_id_fk_idx rename to segment_rule_folder_id_fk_idx;
alter index procurement.procurement_segment_rule_purchase_item_id_fk_idx rename to segment_rule_purchase_item_id_fk_idx;
alter index procurement.procurement_segment_rule_folder_uq rename to segment_rule_folder_uq;
alter index procurement.procurement_segment_rule_item_uq rename to segment_rule_item_uq;

-- ─── 4. Funções ──────────────────────────────────────────────────────────────────

-- Trigger da ARP: só o nome. O corpo não cita tabela renomeada e já tem `search_path = ''`; o
-- rename preserva o OID, e o trigger continua apontando para ela.
alter function procurement.procurement_arp_check_acquisition() rename to arp_check_acquisition;
alter trigger procurement_arp_check_acquisition on procurement.arp rename to arp_check_acquisition;

-- Fingerprint da amostra: rename, para a coluna gerada `price_sample.fingerprint` (que depende
-- da função pelo OID) seguir sem reescrever as 122 mil linhas. O nome antigo volta como wrapper
-- para quem o chama pelo nome até o contract.
alter function sisub.compras_amostra_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
) rename to price_sample_fingerprint;

create function sisub.compras_amostra_fingerprint(
	p_id_compra text,
	p_id_item_compra integer,
	p_descricao_item text,
	p_preco_unitario numeric,
	p_capacidade_unidade_fornecimento numeric,
	p_sigla_unidade_fornecimento text,
	p_sigla_unidade_medida text,
	p_quantidade numeric,
	p_codigo_uasg text,
	p_nome_uasg text,
	p_municipio text,
	p_estado text,
	p_esfera text,
	p_marca text,
	p_normalized_price numeric,
	p_reference_date date
)
returns text
language sql
immutable
set search_path = ''
as $$
	select sisub.price_sample_fingerprint(
		p_id_compra, p_id_item_compra, p_descricao_item, p_preco_unitario, p_capacidade_unidade_fornecimento,
		p_sigla_unidade_fornecimento, p_sigla_unidade_medida, p_quantidade, p_codigo_uasg, p_nome_uasg, p_municipio,
		p_estado, p_esfera, p_marca, p_normalized_price, p_reference_date
	)
$$;

comment on function sisub.price_sample_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
) is 'Impressão digital da amostra de preço (procurement.price_sample.fingerprint, coluna gerada): md5 dos fatos da API do Compras.gov.br, para o upsert idempotente.';
comment on function sisub.compras_amostra_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
) is 'Obsoleta: wrapper de sisub.price_sample_fingerprint do expand 20260927060000. Removida em 20260927070000.';

-- Upsert das amostras: recriado com o nome novo, `search_path = ''` e SECURITY INVOKER. Era
-- DEFINER com `search_path = procurement, public`; só o `service_role` executa (o worker da API),
-- e ele já tem os grants da tabela e ignora RLS, então o DEFINER não comprava nada.
create function procurement.upsert_price_samples(p_samples jsonb)
returns setof uuid
language plpgsql
set search_path = ''
as $$
declare
	r jsonb;
	v_id uuid;
begin
	for r in select value from jsonb_array_elements(p_samples) loop
		insert into procurement.price_sample (
			id_compra, id_item_compra, descricao_item, preco_unitario,
			capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
			sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
			municipio, estado, esfera, marca, normalized_price, reference_date,
			ni_fornecedor, nome_fornecedor
		)
		values (
			r ->> 'id_compra', (r ->> 'id_item_compra')::integer, r ->> 'descricao_item', (r ->> 'preco_unitario')::numeric,
			(r ->> 'capacidade_unidade_fornecimento')::numeric, r ->> 'sigla_unidade_fornecimento',
			r ->> 'sigla_unidade_medida', (r ->> 'quantidade')::numeric, r ->> 'codigo_uasg', r ->> 'nome_uasg',
			r ->> 'municipio', r ->> 'estado', r ->> 'esfera', r ->> 'marca', (r ->> 'normalized_price')::numeric, (r ->> 'reference_date')::date,
			r ->> 'ni_fornecedor', r ->> 'nome_fornecedor'
		)
		-- Linha pré-existente: devolve o id (RETURNING) e completa o fornecedor que faltava,
		-- sem nunca sobrescrever um já gravado.
		on conflict (fingerprint) do update set
			ni_fornecedor = coalesce(procurement.price_sample.ni_fornecedor, excluded.ni_fornecedor),
			nome_fornecedor = coalesce(procurement.price_sample.nome_fornecedor, excluded.nome_fornecedor)
		returning id into v_id;
		return next v_id;
	end loop;
end;
$$;

comment on function procurement.upsert_price_samples(jsonb) is
	'Grava as amostras de preço coletadas do Compras.gov.br (IN SEGES/ME 65/2021, art. 5º, I) sem duplicar: devolve o id de cada uma, na ordem da entrada.';

-- O nome antigo continua respondendo à RPC da `main` (worker da API) até o contract.
create or replace function procurement.upsert_compras_amostras(p_samples jsonb)
returns setof uuid
language sql
security invoker
set search_path = ''
as $$
	select procurement.upsert_price_samples(p_samples)
$$;

comment on function procurement.upsert_compras_amostras(jsonb) is
	'Obsoleta: wrapper de procurement.upsert_price_samples do expand 20260927060000. Removida em 20260927070000.';

-- As funções novas já nascem só com o `service_role` pelo default do dono (20260920210000); o
-- grant explícito deixa isso escrito aqui, como estava nas antigas (o rename preserva o ACL da
-- impressão digital, e o `create or replace` preserva o do upsert antigo).
revoke all on function procurement.upsert_price_samples(jsonb) from public, anon, authenticated;
grant execute on function procurement.upsert_price_samples(jsonb) to service_role;
revoke all on function sisub.compras_amostra_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
) from public, anon, authenticated;
grant execute on function sisub.compras_amostra_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
) to service_role;

-- Funções que citavam `procurement_arp`/`procurement_arp_item` pelo nome: mesmas assinaturas e
-- corpos, com os nomes novos.
create or replace function finance.empenho_item_check_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_empenho_unit bigint;
	v_arp_unit bigint;
begin
	if new.arp_item_id is null then return new; end if;
	select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
	select a.unit_id into v_arp_unit
		from procurement.arp_item ai
		join procurement.arp a on a.id = ai.arp_id
	 where ai.id = new.arp_item_id;
	if v_arp_unit is distinct from v_empenho_unit then
		raise exception 'O item da ARP é de outra unidade (empenho da unidade %, ARP da unidade %)', v_empenho_unit, v_arp_unit
			using errcode = '23514';
	end if;
	return new;
end;
$$;

create or replace function inventory.designations_covering(p_unit_id bigint, p_empenho_id uuid, p_roles text[])
returns table (
	designation_id uuid,
	person_id uuid,
	by_empenho boolean,
	by_arp boolean,
	by_acquisition boolean,
	is_substitute boolean,
	valid_from date
)
language sql
stable
set search_path = ''
as $$
	with arps as (
		select ai.arp_id
			from finance.empenho_item ei
			join procurement.arp_item ai on ai.id = ei.arp_item_id
		 where ei.empenho_id = p_empenho_id
	),
	acquisitions as (
		select e.acquisition_id from finance.empenho e where e.id = p_empenho_id and e.acquisition_id is not null
		union
		select a.acquisition_id from procurement.arp a
		 where a.id in (select arp_id from arps) and a.acquisition_id is not null
	)
	select d.id, d.person_id, d.empenho_id is not null, d.arp_id is not null, d.acquisition_id is not null, d.is_substitute, d.valid_from
		from procurement.contract_designation d
	 where d.unit_id = p_unit_id
		 and d.role = any(p_roles)
		 and d.valid_from <= (now() at time zone 'America/Sao_Paulo')::date
		 and (d.valid_to is null or d.valid_to >= (now() at time zone 'America/Sao_Paulo')::date)
		 and (d.empenho_id is null or d.empenho_id = p_empenho_id)
		 and (d.arp_id is null or d.arp_id in (select arp_id from arps))
		 and (d.acquisition_id is null or d.acquisition_id in (select acquisition_id from acquisitions));
$$;

create or replace function procurement.supply_order_empenho_usage(p_empenho_id uuid)
returns table (priced_total numeric, unpriced_qty numeric, unpriced_lines integer, empenho_qty numeric)
language sql
stable
set search_path = ''
as $$
	with lines as (
		select
			i.ordered_qty,
			coalesce(
				i.unit_price,
				(select x.unit_price from finance.empenho_item x
					where x.empenho_id = so.empenho_id and x.unit_price is not null
						and (x.arp_item_id = i.arp_item_id
							or (i.arp_item_id is null and (select count(*) from finance.empenho_item y where y.empenho_id = so.empenho_id) = 1))
					order by x.position limit 1),
				ai.valor_unitario
			) as price
		from procurement.supply_order_item i
		join procurement.supply_order so on so.id = i.supply_order_id
		left join procurement.arp_item ai on ai.id = i.arp_item_id
		where so.empenho_id = p_empenho_id and so.status <> 'cancelled'
	)
	select
		coalesce(sum(ordered_qty * price) filter (where price is not null), 0)::numeric,
		coalesce(sum(ordered_qty) filter (where price is null), 0)::numeric,
		(count(*) filter (where price is null))::integer,
		(select sum(x.quantity) from finance.empenho_item x where x.empenho_id = p_empenho_id having count(x.quantity) > 0)::numeric
	from lines;
$$;

-- ─── 5. Comentários ──────────────────────────────────────────────────────────────

comment on table procurement.price_research is
	'Pesquisa de preços (Lei 14.133, art. 23; IN SEGES/ME 65/2021): parâmetros e contagens de uma pesquisa, em geral de um anexo quantitativo.';
comment on table procurement.price_research_item is
	'Item pesquisado (IN SEGES/ME 65/2021, art. 3º): o funil das amostras, as estatísticas e o preço de referência de um item.';
comment on table procurement.price_research_sample is
	'Amostra usada no item pesquisado (IN SEGES/ME 65/2021, art. 6º), com a classificação (válida, outlier, poluição) e a conversão de unidade.';
comment on table procurement.price_sample is
	'Preço coletado (amostra) do Compras.gov.br, uma linha por fato da API. As colunas têm o nome da API de origem; o fingerprint impede duplicar.';
comment on table procurement.arp is
	'Ata de registro de preços (ARP, Lei 14.133, art. 6º, XLVI): a única "ata" do sistema. Importada do Compras.gov.br ou cadastrada à mão.';
comment on table procurement.arp_item is 'Item da ata de registro de preços, com o retrato do saldo no Compras.gov.br.';
comment on table procurement.segment is
	'Contratação planejada (segmento do PCA): recorte do que a OM compra num mesmo processo, no calendário do Plano de Contratações Anual, antes da seleção do fornecedor. "Grupo" e "lote" ficam reservados ao sentido da Lei 14.133.';
comment on table procurement.segment_rule is
	'Regra de uma contratação planejada: inclui ou exclui uma pasta do catálogo (com as subpastas) ou um item de compra. A mais específica vence.';

-- ─── 6. Views de compatibilidade com os nomes e as colunas antigos ──────────────────
--
-- Mesma ordem de colunas das tabelas antigas. Os defaults são repetidos na view para quem
-- insere sem a coluna (o PostgREST lê o default da relação que recebe o INSERT).

create view procurement.procurement_pesquisa_preco
with (security_invoker = true) as
select
	id,
	reference_method,
	period_months,
	similarity_threshold,
	filter_estado,
	filter_uasg_code,
	filter_municipio_code,
	total_items,
	items_with_price,
	items_without_catmat,
	non_compliant_items,
	created_at,
	idempotency_key,
	created_by,
	quantity_estimate_id
from procurement.price_research;

alter view procurement.procurement_pesquisa_preco alter column id set default gen_random_uuid();
alter view procurement.procurement_pesquisa_preco alter column reference_method set default 'median';
alter view procurement.procurement_pesquisa_preco alter column period_months set default 12;
alter view procurement.procurement_pesquisa_preco alter column total_items set default 0;
alter view procurement.procurement_pesquisa_preco alter column items_with_price set default 0;
alter view procurement.procurement_pesquisa_preco alter column items_without_catmat set default 0;
alter view procurement.procurement_pesquisa_preco alter column non_compliant_items set default 0;
alter view procurement.procurement_pesquisa_preco alter column created_at set default now();

create view procurement.procurement_pesquisa_preco_item
with (security_invoker = true) as
select
	id,
	research_id,
	catmat_codigo,
	catmat_descricao,
	product_name,
	total_raw,
	total_after_date_filter,
	total_after_pollution_filter,
	total_after_outlier,
	price_min,
	price_max,
	price_mean,
	price_median,
	std_dev,
	cv_pct,
	unique_sources,
	reference_price,
	reference_method,
	measure_unit,
	is_compliant,
	non_compliance_reasons,
	error,
	created_at,
	justification_low_sample,
	justification_method,
	justification_outlier_criteria,
	justification_out_of_period,
	manual_selection,
	quantity_estimate_item_id
from procurement.price_research_item;

alter view procurement.procurement_pesquisa_preco_item alter column id set default gen_random_uuid();
alter view procurement.procurement_pesquisa_preco_item alter column total_raw set default 0;
alter view procurement.procurement_pesquisa_preco_item alter column total_after_date_filter set default 0;
alter view procurement.procurement_pesquisa_preco_item alter column total_after_pollution_filter set default 0;
alter view procurement.procurement_pesquisa_preco_item alter column total_after_outlier set default 0;
alter view procurement.procurement_pesquisa_preco_item alter column is_compliant set default false;
alter view procurement.procurement_pesquisa_preco_item alter column non_compliance_reasons set default '{}'::text[];
alter view procurement.procurement_pesquisa_preco_item alter column created_at set default now();
alter view procurement.procurement_pesquisa_preco_item alter column manual_selection set default false;

create view procurement.procurement_pesquisa_preco_amostra
with (security_invoker = true) as
select
	id,
	research_item_id,
	sample_type,
	similarity,
	price_sample_id as amostra_id,
	converted_price,
	content_in_unit,
	conversion,
	art5_parameter
from procurement.price_research_sample;

alter view procurement.procurement_pesquisa_preco_amostra alter column id set default gen_random_uuid();
alter view procurement.procurement_pesquisa_preco_amostra alter column art5_parameter set default 'I';

-- `fingerprint` é coluna gerada: na view ela é só leitura, como era na tabela.
create view procurement.compras_amostra
with (security_invoker = true) as
select
	id,
	id_compra,
	id_item_compra,
	descricao_item,
	preco_unitario,
	capacidade_unidade_fornecimento,
	sigla_unidade_fornecimento,
	sigla_unidade_medida,
	quantidade,
	codigo_uasg,
	nome_uasg,
	municipio,
	estado,
	esfera,
	marca,
	normalized_price,
	reference_date,
	fingerprint,
	created_at,
	ni_fornecedor,
	nome_fornecedor
from procurement.price_sample;

alter view procurement.compras_amostra alter column id set default gen_random_uuid();
alter view procurement.compras_amostra alter column created_at set default now();

create view procurement.procurement_arp
with (security_invoker = true) as
select
	id,
	unit_id,
	numero_ata,
	ano_ata,
	uasg_gerenciadora,
	nome_uasg_gerenciadora,
	objeto,
	data_vigencia_inicio,
	data_vigencia_fim,
	status_ata,
	last_synced_at,
	created_at,
	acquisition_id,
	source,
	quantity_estimate_id
from procurement.arp;

alter view procurement.procurement_arp alter column id set default gen_random_uuid();
alter view procurement.procurement_arp alter column created_at set default now();
alter view procurement.procurement_arp alter column source set default 'compras_gov';

create view procurement.procurement_arp_item
with (security_invoker = true) as
select
	id,
	arp_id,
	numero_item,
	catmat_item_codigo,
	descricao_item,
	ni_fornecedor,
	nome_fornecedor,
	valor_unitario,
	quantidade_homologada,
	medida_catmat,
	quantidade_empenhada,
	saldo_empenho,
	synced_at,
	source,
	quantity_estimate_item_id
from procurement.arp_item;

alter view procurement.procurement_arp_item alter column id set default gen_random_uuid();
alter view procurement.procurement_arp_item alter column quantidade_empenhada set default 0;
alter view procurement.procurement_arp_item alter column synced_at set default now();
alter view procurement.procurement_arp_item alter column source set default 'compras_gov';

create view procurement.procurement_segment
with (security_invoker = true) as
select
	id,
	unit_id,
	name,
	description,
	planned_month,
	lead_time_months,
	validity_months,
	pca_identifier,
	created_by,
	created_at,
	updated_at,
	deleted_at
from procurement.segment;

alter view procurement.procurement_segment alter column id set default gen_random_uuid();
alter view procurement.procurement_segment alter column lead_time_months set default 5;
alter view procurement.procurement_segment alter column validity_months set default 12;
alter view procurement.procurement_segment alter column created_at set default now();
alter view procurement.procurement_segment alter column updated_at set default now();

create view procurement.procurement_segment_rule
with (security_invoker = true) as
select id, segment_id, mode, folder_id, purchase_item_id, created_at
from procurement.segment_rule;

alter view procurement.procurement_segment_rule alter column id set default gen_random_uuid();
alter view procurement.procurement_segment_rule alter column created_at set default now();

-- Mesmos grants das tabelas: só o servidor (service_role) escreve; o leitor do analytics lê o
-- item da ARP, como já lia pela tabela.
revoke all on procurement.procurement_pesquisa_preco, procurement.procurement_pesquisa_preco_item,
procurement.procurement_pesquisa_preco_amostra, procurement.compras_amostra, procurement.procurement_arp,
procurement.procurement_arp_item, procurement.procurement_segment, procurement.procurement_segment_rule
from public, anon, authenticated;
grant all on procurement.procurement_pesquisa_preco, procurement.procurement_pesquisa_preco_item,
procurement.procurement_pesquisa_preco_amostra, procurement.compras_amostra, procurement.procurement_arp,
procurement.procurement_arp_item, procurement.procurement_segment, procurement.procurement_segment_rule
to service_role;
grant select on procurement.procurement_arp_item to analytics_reader;

comment on view procurement.procurement_pesquisa_preco is
	'Compatibilidade do rename 20260927060000 (→ price_research) para o código antigo em produção. Removida em 20260927070000.';
comment on view procurement.procurement_pesquisa_preco_item is
	'Compatibilidade do rename 20260927060000 (→ price_research_item). Removida em 20260927070000.';
comment on view procurement.procurement_pesquisa_preco_amostra is
	'Compatibilidade do rename 20260927060000 (→ price_research_sample, coluna price_sample_id). Removida em 20260927070000.';
comment on view procurement.compras_amostra is 'Compatibilidade do rename 20260927060000 (→ price_sample). Removida em 20260927070000.';
comment on view procurement.procurement_arp is 'Compatibilidade do rename 20260927060000 (→ arp). Removida em 20260927070000.';
comment on view procurement.procurement_arp_item is 'Compatibilidade do rename 20260927060000 (→ arp_item). Removida em 20260927070000.';
comment on view procurement.procurement_segment is 'Compatibilidade do rename 20260927060000 (→ segment). Removida em 20260927070000.';
comment on view procurement.procurement_segment_rule is
	'Compatibilidade do rename 20260927060000 (→ segment_rule). Removida em 20260927070000.';

-- ─── 7. Conferência: nada além dos wrappers cita os nomes antigos pelo texto ────────
--
-- plpgsql e SQL resolvem tabela por nome, não por OID: uma função esquecida passaria pela view
-- de compatibilidade e quebraria no contract. Aborta a migration inteira se sobrar alguma.

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid not in (
			'procurement.upsert_compras_amostras(jsonb)'::regprocedure,
			'sisub.compras_amostra_fingerprint(text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date)'::regprocedure
		)
		and (
			coalesce(p.prosrc, '') ~ '\m(procurement_pesquisa_preco\w*|compras_amostra\w*|procurement_arp\w*|procurement_segment\w*|amostra_id)\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\m(procurement_pesquisa_preco\w*|compras_amostra\w*|procurement_arp\w*|procurement_segment\w*|amostra_id)\M'
		);
	if offenders is not null then
		raise exception 'funções citam nomes antigos do lote 3 e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || coalesce(with_check, '') ~ '\m(procurement_pesquisa_preco\w*|compras_amostra\w*|procurement_arp\w*|procurement_segment\w*|amostra_id)\M';
	if offenders is not null then
		raise exception 'policies citam nomes antigos do lote 3: %', offenders;
	end if;

	-- As funções novas e recriadas fixam `search_path` vazio (o `create or replace` sem a cláusula
	-- apagaria o que a função tinha).
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	where p.oid in (
		'procurement.upsert_price_samples(jsonb)'::regprocedure,
		'procurement.upsert_compras_amostras(jsonb)'::regprocedure,
		'procurement.arp_check_acquisition()'::regprocedure,
		'finance.empenho_item_check_unit()'::regprocedure,
		'inventory.designations_covering(bigint, uuid, text[])'::regprocedure,
		'procurement.supply_order_empenho_usage(uuid)'::regprocedure,
		'sisub.price_sample_fingerprint(text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date)'::regprocedure,
		'sisub.compras_amostra_fingerprint(text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date)'::regprocedure
	)
		and not coalesce(p.proconfig, '{}') @> array['search_path=""'];
	if offenders is not null then
		raise exception 'funções do lote 3 sem search_path vazio: %', offenders;
	end if;
end;
$$;
