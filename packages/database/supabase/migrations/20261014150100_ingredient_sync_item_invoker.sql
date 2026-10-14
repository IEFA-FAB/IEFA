-- ============================================================================
-- kitchen.ingredient_sync_item passa a SECURITY INVOKER
-- ============================================================================
-- A função (`20260901120000_core_item_nucleus.sql`) é só a dos triggers
-- `ingredient_sync_item_ins` (BEFORE INSERT) e `ingredient_sync_item_upd` (AFTER UPDATE) de
-- `kitchen.ingredient`: mantém `core.item` igual ao insumo. Nasceu SECURITY DEFINER sem motivo
-- escrito, e o DEFINER não compra nada:
--
--   * quem escreve em `kitchen.ingredient` são só `postgres` (Drizzle do sisub, migrations) e
--     `service_role` (supabase-js no servidor, worker da API); são os únicos com INSERT/UPDATE na
--     tabela (`relacl` e `column_privileges` em 2026-10-14; o `analytics_reader` só lê);
--   * os dois têm INSERT/UPDATE/SELECT em `core.item` e SELECT em `kitchen.folder` e
--     `core.measure_unit`, e os dois têm BYPASSRLS (`core.item` tem RLS ligada e nenhuma policy);
--   * `core.item` não tem trigger próprio que peça outro privilégio;
--   * nenhuma função DEFINER escreve em `kitchen.ingredient`.
--
-- Como INVOKER, um papel novo que um dia ganhe escrita no insumo sem ganhar em `core.item` falha
-- alto, em vez de escrever no núcleo com o privilégio do dono.
--
-- `alter function` em vez de `create or replace`: corpo, `search_path = ''` (já fixado desde a
-- criação, tudo qualificado), dono e ACL (EXECUTE só de `postgres` e `service_role`) ficam como
-- estão. O `search_path` é reafirmado para ficar escrito aqui.
--
-- O par citado junto na revisão, `procurement.upsert_compras_amostras` (DEFINER com
-- `search_path = procurement, public`, de `20260926200000`), já foi resolvido: o lote 3
-- (`20260927060000`) criou `procurement.upsert_price_samples` como INVOKER com
-- `search_path = ''`, e o contract (`20260927070000`) derrubou a antiga. Produção conferida em
-- 2026-10-14: a antiga não existe e a nova é INVOKER, executável só por `postgres`/`service_role`.
-- ============================================================================

alter function kitchen.ingredient_sync_item() security invoker;
alter function kitchen.ingredient_sync_item() set search_path = '';

comment on function kitchen.ingredient_sync_item() is
	'Trigger de kitchen.ingredient (ingredient_sync_item_ins/_upd): mantém core.item igual ao insumo. SECURITY INVOKER desde 20261014150100: só postgres e service_role escrevem no insumo, e os dois escrevem em core.item.';
