-- Casos de teste de `.opengrep/rules/ubiquitous-language-sql.yaml`. Não é migration: fica fora de
-- `packages/database/supabase/migrations` (o `scan:rules` não o lê).
--
-- Rodar: opengrep test --config .opengrep/rules/ubiquitous-language-sql.yaml .opengrep/rules/__fixtures__/ubiquitous-language-sql.sql
-- (a regra restringe `paths` às migrations novas; no modo de teste o Opengrep ignora `paths`. As
-- anotações usam `//` porque o `opengrep test` não reconhece `--` como comentário.)

// ruleid: ubiquitous-language-migration-lot2
create table procurement.procurement_list_note (id uuid primary key, note text);

// ruleid: ubiquitous-language-migration-lot2
alter table procurement.supply_order add column list_id uuid;

// ruleid: ubiquitous-language-migration-lot2
alter table procurement.quantity_estimate rename column max_increase_percent to max_margin_percent;

// ruleid: ubiquitous-language-migration-lot2
create index supply_order_ata_id_idx on procurement.supply_order (ata_id);

// ruleid: ubiquitous-language-migration-lot2
comment on column procurement.quantity_estimate_item.estimated_quantity is 'antes total_quantity';

// ruleid: ubiquitous-language-migration-lot2
create function procurement.touch_note() returns void language plpgsql set search_path = '' as $$
begin
	perform 1;
	update procurement.procurement_list set title = title;
end;
$$;

// ok: ubiquitous-language-migration-lot2
create function procurement.touch_estimate() returns void language plpgsql set search_path = '' as $$
begin
	perform 1;
	update procurement.quantity_estimate set title = title;
end;
$$;

// ok: ubiquitous-language-migration-lot2
create table procurement.quantity_estimate_note (id uuid primary key, quantity_estimate_id uuid not null);

// ok: ubiquitous-language-migration-lot2
alter table procurement.supply_order add column quantity_estimate_id uuid;

// ok: ubiquitous-language-migration-lot2
drop view procurement.procurement_list;

// ok: ubiquitous-language-migration-lot2
alter table procurement.procurement_arp drop column procurement_list_id;

// ok: ubiquitous-language-migration-lot2
select numero_ata, ano_ata, status_ata from procurement.arp;

// ── Lote 3: pesquisa de preços e prefixos redundantes ──

// ruleid: ubiquitous-language-migration-lot3
create table procurement.procurement_pesquisa_preco_note (id uuid primary key, note text);

// ruleid: ubiquitous-language-migration-lot3
alter table procurement.price_research_sample add column amostra_id uuid;

// ruleid: ubiquitous-language-migration-lot3
alter table procurement.arp rename to procurement_arp;

// ruleid: ubiquitous-language-migration-lot3
create index idx_pesquisa_preco_created on procurement.price_research (created_at);

// ruleid: ubiquitous-language-migration-lot3
comment on table procurement.segment is 'antes procurement_segment';

// ruleid: ubiquitous-language-migration-lot3
create function procurement.count_samples() returns bigint language sql set search_path = '' as $$
	select count(*) from procurement.compras_amostra;
$$;

// ok: ubiquitous-language-migration-lot3
create function procurement.count_price_samples() returns bigint language sql set search_path = '' as $$
	select count(*) from procurement.price_sample;
$$;

// ok: ubiquitous-language-migration-lot3
create table procurement.segment_note (id uuid primary key, segment_id uuid not null);

// ok: ubiquitous-language-migration-lot3
drop view procurement.procurement_arp_item;

// ok: ubiquitous-language-migration-lot3
drop function procurement.upsert_compras_amostras(jsonb);


// ── Lote 4: finanças ───────────────────────────────────────────────────────

// ruleid: ubiquitous-language-migration-lot4
alter table finance.budget_credit add column dotacao numeric(14, 2);

// ruleid: ubiquitous-language-migration-lot4
alter table finance.empenho rename column issuer_ug to ug_emitente;

// ruleid: ubiquitous-language-migration-lot4
comment on column finance.budget_credit.available_credit_siafi is 'antes saldo_siafi';

// ruleid: ubiquitous-language-migration-lot4
create function finance.touch_credit() returns void language plpgsql set search_path = '' as $$
begin
	perform 1;
	update finance.budget_credit set dotacao = dotacao;
end;
$$;

// ruleid: ubiquitous-language-migration-lot4
create function finance.touch_issuer() returns void language plpgsql set search_path = '' as $$
begin
	-- um comentário no corpo não esconde a função
	update finance.empenho set ug_emitente = null;
end;
$$;

// ruleid: ubiquitous-language-migration-lot2
create function procurement.touch_list() returns void language plpgsql set search_path = '' as $$
begin
	-- idem para o lote 2
	update procurement.quantity_estimate_item set total_quantity = 0;
end;
$$;

// ok: ubiquitous-language-migration-lot4
create function finance.touch_credit_ok() returns void language plpgsql set search_path = '' as $$
begin
	perform 1;
	update finance.budget_credit set received_credit = received_credit;
end;
$$;

// ok: ubiquitous-language-migration-lot4
alter table finance.empenho add column issuer_ug text;

// ok: ubiquitous-language-migration-lot4
alter table finance.budget_credit drop column saldo_siafi;

// ruleid: ubiquitous-language-migration-lot8a
comment on table kitchen.snack_request_material is 'Material de rancho cautelado com o lanche; volta ao rancho.';

// ruleid: ubiquitous-language-migration-lot8a
create table kitchen.rancho_schedule (id bigint primary key);

// ruleid: ubiquitous-language-migration-lot8a
alter table kitchen.mess_halls add column rancho_code text;

// ok: ubiquitous-language-migration-lot8a
comment on table kitchen.snack_request_material is 'Material da cozinha cautelado com o lanche.';

// ok: ubiquitous-language-migration-lot8a
comment on column kitchen.meal_presences.mess_hall_id is 'Refeitório em que o Fiscal de rancho registrou a presença.';

// ok: ubiquitous-language-migration-lot8a
update procurement.policy_rule set title = 'Sem itens impróprios para a alimentação coletiva militar' where title = 'Sem itens impróprios para rancho militar FAB';

// ok: ubiquitous-language-migration-lot8a
create index workforce_submission_competence_idx on kitchen.workforce_submission (competence, rancho_id);

// ruleid: ubiquitous-language-migration-lot8a
comment on table kitchen.snack_request_material is 'Material da cozinha; volta ao rancho.';

// ruleid: ubiquitous-language-migration-lot8a
comment on table kitchen.meal_presences is 'Chame o Fiscal de Rancho';

// ok: ubiquitous-language-migration-lot8a
comment on table kitchen.meal_presences is 'Registro do refeitório; quem registra é o Fiscal de rancho.';
