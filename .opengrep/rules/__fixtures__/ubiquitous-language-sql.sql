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
select numero_ata, ano_ata, status_ata from procurement.procurement_arp;

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
