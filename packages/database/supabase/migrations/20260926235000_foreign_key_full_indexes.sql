-- Índice CHEIO nas FKs que só tinham índice parcial. A checagem de FK (o `delete`/`update` na
-- tabela referenciada, e a cascata) procura as linhas filhas com `where <col> = $1`, sem o
-- predicado do índice; o planner só usa um índice parcial quando a consulta implica o predicado.
-- `where deleted_at is null`, `where used_at is null` ou `where active` não são implicados, e a
-- checagem varre a tabela filha; `where <col> is not null` é implicado e serve. O advisor
-- `unindexed_foreign_keys` conta o parcial como cobertura, por isso 20260926219500 e
-- 20260926234500 não pegaram estas. Levantamento no catálogo (pg_constraint × pg_index) em
-- 2026-09-26: 41 FKs, todas em tabelas pequenas (a maior, kitchen.recipes, ~5 mil linhas e 7 MB),
-- então `create index` comum, sem `concurrently`. O lint `fk_without_full_index` do `audit:rls`
-- reprova a próxima.

create index if not exists mfa_recovery_code_user_id_fk_idx on access_control.mfa_recovery_code (user_id);
create index if not exists count_scope_item_kitchen_id_fk_idx on inventory.count_scope_item (kitchen_id);
create index if not exists stock_cost_kitchen_id_fk_idx on inventory.stock_cost (kitchen_id);
create index if not exists equipment_issue_unit_id_fk_idx on kitchen.equipment_issue (unit_id);
create index if not exists equipment_maintenance_log_issue_id_fk_idx on kitchen.equipment_maintenance_log (issue_id);
create index if not exists equipment_maintenance_log_plan_id_fk_idx on kitchen.equipment_maintenance_log (plan_id);
create index if not exists equipment_maintenance_log_unit_id_fk_idx on kitchen.equipment_maintenance_log (unit_id);
create index if not exists equipment_maintenance_plan_kitchen_id_fk_idx on kitchen.equipment_maintenance_plan (kitchen_id);
create index if not exists equipment_maintenance_plan_model_id_fk_idx on kitchen.equipment_maintenance_plan (model_id);
create index if not exists equipment_maintenance_plan_role_id_fk_idx on kitchen.equipment_maintenance_plan (role_id);
create index if not exists equipment_model_kitchen_id_fk_idx on kitchen.equipment_model (kitchen_id);
create index if not exists equipment_model_role_model_id_fk_idx on kitchen.equipment_model_role (model_id);
create index if not exists equipment_model_role_role_id_fk_idx on kitchen.equipment_model_role (role_id);
create index if not exists equipment_unit_kitchen_id_fk_idx on kitchen.equipment_unit (kitchen_id);
create index if not exists equipment_unit_model_id_fk_idx on kitchen.equipment_unit (model_id);
create index if not exists equipment_unit_role_unit_id_fk_idx on kitchen.equipment_unit_role (unit_id);
create index if not exists frozen_preparation_production_recipe_id_fk_idx on kitchen.frozen_preparation (production_recipe_id);
create index if not exists frozen_preparation_provisional_kitchen_id_fk_idx on kitchen.frozen_preparation (provisional_kitchen_id);
create index if not exists frozen_preparation_source_ingredient_id_fk_idx on kitchen.frozen_preparation (source_ingredient_id);
create index if not exists ingredient_item_gtin_fk_idx on kitchen.ingredient_item (gtin);
create index if not exists menu_group_set_kitchen_id_fk_idx on kitchen.menu_group_set (kitchen_id);
create index if not exists menu_template_kitchen_id_fk_idx on kitchen.menu_template (kitchen_id);
create index if not exists rancho_unit_id_fk_idx on kitchen.rancho (unit_id);
create index if not exists recipe_equipment_requirement_recipe_id_fk_idx on kitchen.recipe_equipment_requirement (recipe_id);
create index if not exists recipe_equipment_requirement_recipe_step_id_fk_idx on kitchen.recipe_equipment_requirement (recipe_step_id);
create index if not exists recipe_step_recipe_id_fk_idx on kitchen.recipe_step (recipe_id);
create index if not exists recipe_step_input_recipe_ingredient_id_fk_idx on kitchen.recipe_step_input (recipe_ingredient_id);
create index if not exists recipe_step_input_recipe_step_id_fk_idx on kitchen.recipe_step_input (recipe_step_id);
create index if not exists recipe_step_input_source_output_id_fk_idx on kitchen.recipe_step_input (source_output_id);
create index if not exists recipe_step_output_recipe_id_fk_idx on kitchen.recipe_step_output (recipe_id);
create index if not exists recipe_step_output_recipe_step_id_fk_idx on kitchen.recipe_step_output (recipe_step_id);
create index if not exists recipe_step_utensil_recipe_step_id_fk_idx on kitchen.recipe_step_utensil (recipe_step_id);
create index if not exists recipes_kitchen_id_fk_idx on kitchen.recipes (kitchen_id);
create index if not exists step_template_utensil_step_template_id_fk_idx on kitchen.step_template_utensil (step_template_id);
create index if not exists utensil_role_id_fk_idx on kitchen.utensil (role_id);
create index if not exists acquisition_unit_id_fk_idx on procurement.acquisition (unit_id);
create index if not exists procurement_list_unit_id_fk_idx on procurement.procurement_list (unit_id);
create index if not exists procurement_segment_unit_id_fk_idx on procurement.procurement_segment (unit_id);
create index if not exists procurement_segment_rule_segment_id_fk_idx on procurement.procurement_segment_rule (segment_id);
create index if not exists purchase_item_catmat_item_codigo_fk_idx on procurement.purchase_item (catmat_item_codigo);
create index if not exists piece_item_piece_id_fk_idx on rumaer.piece_item (piece_id);
