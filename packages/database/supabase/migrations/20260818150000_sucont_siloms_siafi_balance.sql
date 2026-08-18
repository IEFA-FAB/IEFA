-- ============================================================================
-- SUCONT-4 · auditor SIAFI x SILOMS: tabela de fato dos saldos
-- ============================================================================
-- Até aqui o /auditor era 100% memória do navegador: a planilha era parseada,
-- os números apareciam na tela e sumiam no F5. Não havia como confrontar o mês
-- corrente contra o anterior sem o operador subir de novo um arquivo com a
-- série inteira, nem como saber qual arquivo produziu qual número.
--
-- `analysis_run` e `generated_message` já existiam (20260705180000) mas nunca
-- receberam escrita. Elas guardam o AGREGADO (resumo da rodada) e a MENSAGEM;
-- faltava o GRÃO — um saldo por (mês, UG, grupo de contas). É esta tabela.
--
-- Chave natural (period, ug_codigo, account_group): reupload do mesmo mês é
-- idempotente e um arquivo que repete um período com números diferentes vira
-- conflito visível, não linha duplicada silenciosa.
-- ============================================================================

create table sucont.siloms_siafi_balance (
	id            uuid primary key default gen_random_uuid(),
	-- Sempre o dia 1 do mês de competência. A planilha traz "JANEIRO/2024",
	-- "janeiro/2025" e células de data de verdade, tudo misturado no mesmo
	-- arquivo; a normalização acontece na aplicação e aqui chega só a data.
	period        date not null,
	ug_codigo     text not null,
	ug_nome       text,
	account_group text not null check (account_group in ('CONSUMO', 'BMP', 'INTANGIVEL')),

	siafi_value   numeric(18, 2) not null default 0,
	siloms_value  numeric(18, 2) not null default 0,

	-- Coluna GERADA, deliberadamente. A coluna "DIF" do relatório de origem tem
	-- o sinal invertido linha a linha (parte é SILOMS-SIAFI, parte é
	-- SIAFI-SILOMS, misturados dentro do mesmo mês) e há células com DIF zerado
	-- sobre saldos que divergem de verdade. Derivar aqui torna impossível que
	-- esse número entre errado no banco.
	difference    numeric(18, 2) generated always as (abs(siafi_value - siloms_value)) stored,

	source_run_id uuid references sucont.analysis_run (id) on delete set null,
	created_by    uuid,
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),

	constraint siloms_siafi_balance_period_is_month_start check (extract(day from period) = 1),
	constraint siloms_siafi_balance_unique_grain unique (period, ug_codigo, account_group)
);

create trigger siloms_siafi_balance_updated_at before update on sucont.siloms_siafi_balance
	for each row execute function sucont.set_updated_at();

-- Série histórica de uma UG (o caso do gráfico de evolução e da MSG).
create index siloms_siafi_balance_ug_idx on sucont.siloms_siafi_balance (ug_codigo, account_group, period desc);
-- Corte por competência (KPI do mês, heatmap).
create index siloms_siafi_balance_period_idx on sucont.siloms_siafi_balance (period desc);
-- Rastreio "de qual rodada veio este número".
create index siloms_siafi_balance_run_idx on sucont.siloms_siafi_balance (source_run_id);

-- ── RLS: leitura a autenticados; escrita só service_role (via server functions) ──
alter table sucont.siloms_siafi_balance enable row level security;

create policy "auth read siloms_siafi_balance" on sucont.siloms_siafi_balance
	for select to authenticated using (true);

grant select on sucont.siloms_siafi_balance to authenticated;
grant all    on sucont.siloms_siafi_balance to service_role;

comment on table sucont.siloms_siafi_balance is
	'Saldos SIAFI x SILOMS por (competência, UG, grupo de contas). Grão do auditor SUCONT-4; alimentado por upload de planilha e consultado para confronto entre períodos.';
comment on column sucont.siloms_siafi_balance.difference is
	'Gerada: abs(siafi_value - siloms_value). Nunca vem do arquivo — a coluna DIF de origem tem sinal inconsistente.';
