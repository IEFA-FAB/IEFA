-- Log de sincronização COMPARTILHADO por todas as integrações.
--
-- O problema: cada worker nasceu com o seu par de tabelas. `compras_sync_log`/`_step` para o
-- catálogo do Compras.gov, `nutrition_sync_log`/`_step` para o TACO/IBGE/USDA — colunas
-- idênticas, funções de incremento idênticas, e uma cópia inteira da lógica de heartbeat,
-- liveness e recuperação de sync morto em cada worker. O terceiro (PCA do PNCP) ia repetir
-- tudo de novo.
--
-- Esta migration unifica: UMA tabela, discriminada por `source`, e cada painel filtra a sua.
--
-- Três coisas que este DDL existe para tornar possíveis:
--
--   1. CONCORRÊNCIA GARANTIDA PELO BANCO, não por check-then-act. O padrão anterior era
--      "consulta se há sync viva, e se não houver, insere" — dois disparos simultâneos passam
--      os dois pela consulta e inserem os dois. O índice parcial único abaixo torna isso
--      impossível: a segunda inserção falha com 23505, e quem chama traduz para "já está
--      rodando". É a diferença entre uma corrida improvável e uma corrida impossível.
--
--   2. RECUPERAÇÃO ISOLADA POR ORIGEM. Sem `source`, o `recoverStaleSyncs` de um worker marca
--      como `instance_died` a execução saudável de outro, e o `hasLiveSync` de um bloqueia o
--      outro. Com ele, cada origem só enxerga a si mesma.
--
--   3. PAINEL POR ORIGEM SEM TABELA POR ORIGEM. `/sync/latest` de cada rota admin passa a ser
--      a mesma consulta com um `where source = ...`.
--
-- Nomes ficam NEUTROS: manter `compras_sync_log` guardando linha de nutrição e de PNCP seria
-- um nome que mente. O conteúdo é preservado — rename, não recriação.

begin;

-- ── 1. Nomes neutros ─────────────────────────────────────────────────────────
alter table compras_gov_integration.compras_sync_log  rename to integration_sync_log;
alter table compras_gov_integration.compras_sync_step rename to integration_sync_step;

comment on table compras_gov_integration.integration_sync_log is
	'Log de execução compartilhado por TODAS as integrações. Discriminado por `source`; cada painel filtra o seu. Mora neste schema por herança histórica, não por pertencer ao Compras.gov.';
comment on column compras_gov_integration.integration_sync_log.source is
	'Origem da sincronização: compras_gov | nutrition_reference | pncp_pca. Toda consulta de concorrência, recuperação e "último sync" DEVE filtrar por esta coluna.';

-- ── 2. Concorrência: uma execução viva por origem, garantida pelo banco ──────
-- É o coração desta migration. Sem isso, "verifica e insere" é uma corrida.
--
-- Antes do índice, normaliza execução presa em `running`: duas linhas assim da mesma origem
-- fariam a criação do índice falhar e a migration inteira voltar atrás. Elas estão mortas —
-- nenhum processo sobrevive à janela de heartbeat.
update compras_gov_integration.integration_sync_log
   set status = 'error',
       error_message = coalesce(error_message, 'instance_died (normalizado na consolidação)'),
       finished_at = coalesce(finished_at, now())
 where status = 'running';

create unique index if not exists uq_integration_sync_log_one_running_per_source
	on compras_gov_integration.integration_sync_log (source)
	where status = 'running';

create index if not exists idx_integration_sync_log_source_started
	on compras_gov_integration.integration_sync_log (source, started_at desc);

drop index if exists compras_gov_integration.idx_compras_sync_log_source_started;

-- ── 3. Absorve o log da nutrição ─────────────────────────────────────────────
-- Colunas são idênticas (conferido); só falta `source`. Os ids são remapeados para preservar
-- o vínculo dos steps.
create temp table nutrition_id_map on commit drop as
select id as old_id, null::bigint as new_id
from nutrition_reference.nutrition_sync_log;

do $$
declare
	r record;
	v_new bigint;
begin
	for r in select * from nutrition_reference.nutrition_sync_log order by id loop
		insert into compras_gov_integration.integration_sync_log (
			started_at, finished_at, triggered_by, status, total_steps, completed_steps,
			successful_steps, failed_steps, total_upserted, total_deactivated, error_message,
			heartbeat_at, stop_requested, source
		)
		values (
			r.started_at, r.finished_at, r.triggered_by,
			-- Uma execução histórica presa em `running` violaria o índice único novo se houvesse
			-- duas. Elas estão mortas há muito; entram como `error`, que é o que de fato são.
			case when r.status = 'running' then 'error' else r.status end,
			r.total_steps, r.completed_steps, r.successful_steps, r.failed_steps,
			r.total_upserted, r.total_deactivated,
			case when r.status = 'running' then coalesce(r.error_message, 'instance_died (migrado)') else r.error_message end,
			r.heartbeat_at, r.stop_requested, 'nutrition_reference'
		)
		returning id into v_new;

		update nutrition_id_map set new_id = v_new where old_id = r.id;
	end loop;
end $$;

insert into compras_gov_integration.integration_sync_step (
	sync_id, step_name, status, current_page, total_pages,
	records_upserted, records_deactivated, error_message, started_at, finished_at
)
select m.new_id, s.step_name, s.status, s.current_page, s.total_pages,
       s.records_upserted, s.records_deactivated, s.error_message, s.started_at, s.finished_at
from nutrition_reference.nutrition_sync_step s
join nutrition_id_map m on m.old_id = s.sync_id;

-- ── 4. Funções de incremento neutras ─────────────────────────────────────────
create or replace function compras_gov_integration.integration_sync_step_success(p_sync_id bigint, p_upserted integer)
returns void language sql as $$
	update compras_gov_integration.integration_sync_log
	set completed_steps  = completed_steps + 1,
	    successful_steps = successful_steps + 1,
	    total_upserted   = total_upserted + p_upserted
	where id = p_sync_id;
$$;

create or replace function compras_gov_integration.integration_sync_step_failure(p_sync_id bigint)
returns void language sql as $$
	update compras_gov_integration.integration_sync_log
	set completed_steps = completed_steps + 1,
	    failed_steps    = failed_steps + 1
	where id = p_sync_id;
$$;

revoke all on function compras_gov_integration.integration_sync_step_success(bigint, integer) from public;
revoke all on function compras_gov_integration.integration_sync_step_failure(bigint) from public;
grant execute on function compras_gov_integration.integration_sync_step_success(bigint, integer) to service_role;
grant execute on function compras_gov_integration.integration_sync_step_failure(bigint) to service_role;

drop function if exists compras_gov_integration.compras_sync_step_success(bigint, integer);
drop function if exists compras_gov_integration.compras_sync_step_failure(bigint);
drop function if exists nutrition_reference.nutrition_sync_step_success(bigint, integer);
drop function if exists nutrition_reference.nutrition_sync_step_failure(bigint);

-- ── 5. Tabelas antigas da nutrição saem ──────────────────────────────────────
-- O conteúdo foi copiado acima; manter as duas seria criar uma segunda fonte de verdade.
drop table if exists nutrition_reference.nutrition_sync_step;
drop table if exists nutrition_reference.nutrition_sync_log;

commit;
