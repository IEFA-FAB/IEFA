-- Desfecho para o reset de treino que morreu no meio.
--
-- `core.training_reset_log` grava a linha com status 'running' ANTES da transação de
-- dados, de propósito: um reset que quebra no meio precisa deixar rastro apesar do
-- rollback. O preço é que um processo MORTO entre o INSERT e o UPDATE final deixa a linha
-- em 'running' para sempre — o CHECK só admitia running/succeeded/failed, e o painel da
-- SDAB traduz qualquer coisa que não seja succeeded/failed como "Em andamento".
--
-- Havia 6 linhas assim (5 de 2026-08-18, 1 de 2026-07-31), todas com `finished_at` nulo:
-- runs de CI cancelados no meio do gate de integração.
--
-- 'abandoned' é o desfecho honesto: não se sabe se limpou, não se sabe quando parou. O
-- `finished_at` fica NULO de propósito — inventar um horário seria pior do que admitir
-- que ninguém registrou o fim.

begin;

alter table core.training_reset_log
	drop constraint if exists training_reset_log_status_check;

alter table core.training_reset_log
	add constraint training_reset_log_status_check
	check (status in ('running', 'succeeded', 'failed', 'abandoned'));

comment on column core.training_reset_log.status is
	'running = registrada, ainda sem desfecho; succeeded/failed = a execução registrou o próprio fim; abandoned = o processo morreu antes de registrar (reclassificada pelo reset seguinte, que só age sobre linhas antigas por segurança).';

-- Backfill das órfãs. O corte de 10 minutos é ~27x a execução mais longa já medida
-- (21,7 s em 695 execuções): uma linha mais velha que isso e ainda sem desfecho não está
-- executando. Uma execução em curso agora não é atingida.
update core.training_reset_log
set status = 'abandoned',
    error_message = coalesce(error_message, 'Execução sem desfecho: o processo terminou antes de registrar o resultado.')
where status = 'running'
  and started_at < now() - interval '10 minutes';

commit;
