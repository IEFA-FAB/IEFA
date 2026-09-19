-- ============================================================================
-- Funções do `inventory` deixam de ser executáveis por PUBLIC
-- ============================================================================
-- O Postgres concede EXECUTE a PUBLIC em toda função nova, e as migrations do
-- estoque escreviam `revoke all on function … from anon, authenticated` — que
-- não tira o grant de PUBLIC, do qual `anon` e `authenticated` herdam. Resultado
-- conferido no banco: `issue_stock`, `post_stock_adjustment`,
-- `approve_inventory_count`, `refresh_issue_suggestion` e outras estavam
-- executáveis por `anon`. Hoje não é explorável só porque `anon` e
-- `authenticated` não têm USAGE no schema `inventory` — uma defesa só, e o
-- schema está na lista `pgrst.db_schemas`: um grant de USAGE futuro abriria
-- todas de uma vez, e elas não são SECURITY DEFINER, mas mexem em estoque e
-- dinheiro.
--
-- O servidor usa `service_role`, que tem EXECUTE explícito pelo default ACL do
-- schema e não depende de PUBLIC (`finalize_goods_receipt` já estava assim e
-- funciona). Funções de gatilho e as chamadas por views não dependem do EXECUTE
-- de quem consulta.
-- ============================================================================

revoke execute on all functions in schema inventory from public, anon, authenticated;

-- e as próximas já nascem fechadas
alter default privileges for role postgres in schema inventory revoke execute on functions from public;
