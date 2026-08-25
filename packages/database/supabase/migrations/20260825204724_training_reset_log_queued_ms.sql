-- Separa a espera na fila do tempo de trabalho do reset de treino.
--
-- `duration_ms` era medido do INSERT do registro até o fim — e o INSERT acontece ANTES do
-- advisory lock. Numa execução que chegou enquanto outra trabalhava, a coluna "duração" do
-- painel somava a espera ao trabalho. Em 695 execuções a média era 9,4 s contra um mínimo
-- de 687 ms: boa parte disso é fila do CI, não limpeza.
--
-- Coluna nova em vez de redefinir a antiga em silêncio: as 697 linhas históricas continuam
-- medindo o total (fila + trabalho) e não há como separá-las retroativamente. Daqui em
-- diante `duration_ms` é só o trabalho e `queued_ms` é a espera; linha antiga tem
-- `queued_ms` nulo, que é a forma honesta de dizer "não dá para saber".

begin;

alter table core.training_reset_log
	add column if not exists queued_ms integer;

comment on column core.training_reset_log.queued_ms is
	'Espera pelo advisory lock, em ms — tempo entre registrar a execução e começar a trabalhar. NULO nas linhas anteriores a 2026-08-25, quando essa espera estava embutida em duration_ms.';

comment on column core.training_reset_log.duration_ms is
	'Tempo de TRABALHO do reset, em ms (transação de dados + seed do baseline). Nas linhas anteriores a 2026-08-25 inclui também a espera pelo lock, hoje em queued_ms.';

commit;
