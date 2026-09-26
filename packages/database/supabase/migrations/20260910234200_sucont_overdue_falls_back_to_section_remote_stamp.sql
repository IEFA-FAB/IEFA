-- Marcador de histórico — NÃO tem efeito, e é de propósito.
--
-- A função `sucont.run_notification_tick()` desta mudança foi aplicada em produção por
-- `apply_migration` (MCP), que carimba o próprio timestamp (20260910234200) em vez de usar o
-- nome do arquivo. O SQL gravado nesse carimbo é o de
-- 20260910234731_sucont_overdue_falls_back_to_section.sql, que é o arquivo versionado desta
-- mudança (conferido em 2026-09-26, comentários e espaços à parte).
--
-- Mesmo procedimento de 20260828082911_folder_reviews_remote_stamp.sql: dar ao carimbo remoto
-- o arquivo local que faltava, sem apagar linha de histórico (`migration repair --status
-- reverted` é proibido neste repositório) e sem repetir a DDL. Num replay limpo,
-- 20260910234731 define a função e este arquivo não faz nada.

select 1 where false;
