-- Marcador de histórico — NÃO tem efeito, e é de propósito.
--
-- `kitchen.folder_review` e `kitchen.folder_last_review` foram criadas em produção
-- em 2026-08-28 por `apply_migration` (MCP), que carimba o próprio timestamp em vez
-- de usar o nome do arquivo. O conteúdo é byte a byte o de
-- 20260816140000_folder_reviews.sql, que é o arquivo versionado desta mudança.
--
-- Resultado: o histórico remoto tinha uma versão sem arquivo local, e todo
-- `supabase db push` parava com LegacyDbPushMissingLocalError. A saída que o CLI
-- sugere — `migration repair --status reverted 20260828082911` — é proibida neste
-- repositório: apagar linha de histórico é como se perde a noção do que já rodou.
-- Este arquivo resolve pelo outro lado: dá ao carimbo remoto o arquivo local que
-- faltava, sem tocar no histórico e sem repetir a DDL.
--
-- Num replay limpo, 20260816140000 cria as duas relações e este arquivo não faz nada.
-- Se aparecer outro carimbo remoto sem arquivo, o procedimento é este, não o repair.

select 1 where false;
