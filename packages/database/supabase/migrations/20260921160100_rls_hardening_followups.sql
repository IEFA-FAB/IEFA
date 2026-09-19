-- Segunda porta nas tabelas que dependiam só da ausência de GRANT (auditoria de 2026-09-19).
--
-- 1. RLS ligada nas tabelas que nasceram sem ela. Hoje nenhum cliente tem GRANT nelas, e é
--    isso que as protege; um `grant select … to authenticated` futuro (o padrão do realtime)
--    as abriria por inteiro. Com RLS e sem policy, grant sozinho não abre nada. Quem lê
--    (service_role, e o `postgres` dono pelo Drizzle) não é afetado: BYPASSRLS e dono.
alter table kitchen.ingredient_substitution enable row level security;
alter table kitchen.preparation_group enable row level security;
alter table procurement.procurement_list_snapshot_selection enable row level security;
alter table procurement.procurement_list_snapshot_component enable row level security;
alter table forms.om_option enable row level security;
alter table forms.response_version enable row level security;
alter table forms.response_viewer enable row level security;
alter table forms.response_viewer_scope_binding enable row level security;

-- 2. `inventory.v_lot_expiry` era a última view SECURITY DEFINER (sem `security_invoker`):
--    quem a lê enxerga as tabelas de base com o privilégio do DONO. Fechada hoje por falta
--    de grant; invoker é o que faz a próxima concessão não contornar RLS. O único leitor é o
--    servidor (service_role, que tem SELECT nas cinco tabelas de base).
alter view inventory.v_lot_expiry set (security_invoker = true);

-- 3. Leitura `using (true)` para `authenticated` sem leitor. O navegador só usa o Supabase
--    para auth e Realtime (`kitchen.daily_menu/menu_items/recipes`); catálogo de item e
--    especificação GS1 são lidos pelo servidor. O grant deixava QUALQUER conta de QUALQUER
--    app (portal, rumaer…) ler o catálogo inteiro pelo PostgREST.
drop policy if exists item_read on core.item;
revoke select on core.item from authenticated;

drop policy if exists gpc_attribute_read on gs1_integration.gpc_attribute;
drop policy if exists gpc_attribute_value_read on gs1_integration.gpc_attribute_value;
drop policy if exists gpc_brick_attribute_read on gs1_integration.gpc_brick_attribute;
drop policy if exists gtin_gpc_attribute_read on gs1_integration.gtin_gpc_attribute;
drop policy if exists gtin_specification_check_read on gs1_integration.gtin_specification_check;
drop policy if exists purchase_item_gpc_requirement_read on procurement.purchase_item_gpc_requirement;
revoke select on gs1_integration.gpc_attribute, gs1_integration.gpc_attribute_value,
  gs1_integration.gpc_brick_attribute, gs1_integration.gtin_gpc_attribute,
  gs1_integration.gtin_specification_check from authenticated;
revoke select on procurement.purchase_item_gpc_requirement from authenticated;
