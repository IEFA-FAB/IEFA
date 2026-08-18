-- ============================================================================
-- SUCONT-4 · SAC-DGC: análise crítica do Demonstrativo Gerencial de Custos
-- ============================================================================
-- A ferramenta produz UMA análise por Unidade Gestora, e a competência tem ~69
-- UGs. Cada análise é uma chamada ao modelo com o recorte da UG: a rodada
-- completa custa dezenas de minutos e tokens de verdade. Sem persistir, tudo
-- isso vive na aba do navegador e morre no F5 — o mesmo defeito que o
-- 20260818150000 corrigiu no auditor SIAFI x SILOMS.
--
-- Persistir também é o que permite o que a análise sozinha não faz: comparar a
-- mesma UG entre competências, e saber QUAL modelo produziu cada apontamento
-- antes de levar o achado à UG.
--
-- A rodada reaproveita `sucont.analysis_run` (tool = 'sac-dgc'), que já é o
-- registro de "um upload processado". Aqui entra o grão: uma linha por UG.
--
-- As planilhas do DGC NÃO são armazenadas. Elas são lidas no navegador e só o
-- recorte da UG trafega, para o modelo. O que fica é o resultado.
-- ============================================================================

create table sucont.dgc_analysis (
	id         uuid primary key default gen_random_uuid(),
	run_id     uuid not null references sucont.analysis_run (id) on delete cascade,

	ug_codigo  text not null,
	ug_nome    text,
	-- Grupo de comparação institucional (Bases Aéreas, GAP, Hospitais…). É o que
	-- define contra quem a UG foi comparada NAQUELA rodada; fica gravado porque a
	-- classificação da SUCONT pode mudar e o apontamento antigo tem de continuar
	-- explicável.
	ug_grupo   text,

	-- Rótulo como veio das planilhas ("JULHO/2026"). Guardado cru porque o export
	-- às vezes traz mais de um mês no mesmo arquivo, e aí não existe uma data.
	competence text not null,
	-- Dia 1 do mês, quando a competência é um mês só. Null quando ambígua — é o
	-- que permite a série histórica sem inventar uma data que o arquivo não tinha.
	period     date,

	-- A análise normalizada (identificacao, analisePainel1..4, alertas, checklist).
	analysis   jsonb not null,

	-- Contagens DERIVADAS do próprio jsonb. Ficam aqui, e não vindas da aplicação,
	-- porque a lista da tela ordena e filtra por elas: um número que discordasse do
	-- conteúdo faria a UG com 9 alertas aparecer como limpa.
	alert_count integer not null generated always as (jsonb_array_length(analysis -> 'alertasDeCriticidade')) stored,
	finding_count integer not null generated always as ((analysis -> 'checklistAec' -> 'indicadores' ->> 'comApontamento')::integer) stored,

	-- Proveniência: qual modelo respondeu. Sem isto não há como reavaliar um lote
	-- antigo depois de trocar de modelo.
	model      text,

	created_by uuid,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	constraint dgc_analysis_period_is_month_start check (period is null or extract(day from period) = 1),
	-- Uma UG é analisada no máximo uma vez por rodada. Reanálise sobrescreve.
	constraint dgc_analysis_unique_grain unique (run_id, ug_codigo)
);

create trigger dgc_analysis_updated_at before update on sucont.dgc_analysis
	for each row execute function sucont.set_updated_at();

-- Histórico de uma UG entre competências.
create index dgc_analysis_ug_idx on sucont.dgc_analysis (ug_codigo, period desc nulls last);
-- Abrir uma rodada inteira (a tela lista as UGs da rodada).
create index dgc_analysis_run_idx on sucont.dgc_analysis (run_id);
-- "Quem tem apontamento nesta competência" — a fila de trabalho da seção.
create index dgc_analysis_findings_idx on sucont.dgc_analysis (period desc nulls last, finding_count desc);

-- ── RLS: leitura a autenticados; escrita só service_role (via server functions) ──
alter table sucont.dgc_analysis enable row level security;

create policy "auth read dgc_analysis" on sucont.dgc_analysis
	for select to authenticated using (true);

grant select on sucont.dgc_analysis to authenticated;
grant all    on sucont.dgc_analysis to service_role;

comment on table sucont.dgc_analysis is
	'Análise crítica do DGC por (rodada, UG) — SAC-DGC. As planilhas de origem não são armazenadas; só o resultado.';
comment on column sucont.dgc_analysis.period is
	'Dia 1 do mês de competência, ou null quando a carga misturou meses.';
comment on column sucont.dgc_analysis.alert_count is
	'Gerada de analysis->alertasDeCriticidade. Nunca vem da aplicação.';
comment on column sucont.dgc_analysis.finding_count is
	'Gerada de analysis->checklistAec->indicadores->comApontamento. Nunca vem da aplicação.';
