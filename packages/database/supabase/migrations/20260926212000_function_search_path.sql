-- Fixa o search_path das 75 funções de negócio que o advisor acusa
-- (`function_search_path_mutable`). Hoje elas resolvem nomes pelo search_path de quem chama:
-- `"$user", public` no service_role, `public, extensions` no postgres, o schema do perfil
-- mais `public, extensions` no PostgREST, e o do statement que dispara o trigger.
--
-- Critério: `pg_get_functiondef` de cada uma, sem comentários e literais, cruzado com o
-- catálogo (tabelas, views, tipos, funções e operadores fora de `pg_catalog`). Nenhuma tem
-- referência não qualificada a objeto fora de `pg_catalog`: tabela, tipo e função vêm com
-- schema; o resto é built-in (`now`, `coalesce`, `set_config`, `gen_random_uuid`, `sum`,
-- `collate "C"`...), e `pg_catalog` é sempre buscado primeiro. Nenhuma usa operador de
-- `pg_trgm`/`unaccent`/`vector` (a `sisub.catmat_similarity` chama `extensions.`/`public.`
-- qualificado) nem SQL dinâmico. Por isso todas levam `search_path = ''`, que preserva a
-- resolução atual e tira dela o caminho de quem chama.
--
-- Efeitos colaterais medidos:
-- * `set_config(..., true)` dentro da função continua valendo depois dela (só o próprio
--   search_path volta ao sair), então `inventory.mark_module_transaction` e as RPCs que ligam
--   `inventory.via_rpc` seguem iguais. Mesmo padrão de `inventory.finalize_goods_receipt`.
-- * Função com SET não é inlinada. Só perdem inlining `sisub.compras_amostra_fingerprint`
--   (coluna gerada `procurement.compras_amostra.fingerprint`: custo de uma troca de GUC por
--   linha gravada), `inventory.reason_always_requires_approval`,
--   `inventory.mark_module_transaction`, `inventory.count_lines` e
--   `inventory.receipt_line_live_events` (SRF chamadas por RPC, uma vez por documento).
--   Nenhuma aparece em índice. `inventory.expiry_alert_days` (view `inventory.v_lot_expiry`)
--   e `inventory.lot_short_code` (default de `inventory.stock_lot.short_code`, plpgsql) já
--   não eram inlináveis: ganham só a troca de GUC por chamada.
--
-- Fora daqui: as funções que `20260926210000_database_cleanup.sql` dropa, e a mudança de
-- `pg_trgm`/`unaccent` de `public` para `extensions` (advisor `extension_in_public`, dívida).

-- compras_gov_integration
alter function compras_gov_integration.compras_material_item_preserve_deactivation() set search_path = '';
alter function compras_gov_integration.compras_material_item_set_deactivation_on_insert() set search_path = '';
alter function compras_gov_integration.compras_servico_item_preserve_deactivation() set search_path = '';
alter function compras_gov_integration.compras_servico_item_set_deactivation_on_insert() set search_path = '';
alter function compras_gov_integration.integration_sync_step_failure(p_sync_id bigint) set search_path = '';
alter function compras_gov_integration.integration_sync_step_success(p_sync_id bigint, p_upserted integer) set search_path = '';

-- finance
alter function finance.check_empenho_event_floor() set search_path = '';
alter function finance.check_liquidacao_within_empenho() set search_path = '';
alter function finance.check_pagamento_within_liquidacao() set search_path = '';

-- forms
alter function forms.set_updated_at() set search_path = '';

-- iefa
alter function iefa.set_updated_at() set search_path = '';

-- inventory
alter function inventory.add_found_item(p_count_id uuid, p_ingredient_id uuid, p_frozen_preparation_id uuid) set search_path = '';
alter function inventory.adjustment_requires_approval(p_adjustment_id uuid) set search_path = '';
alter function inventory.adjustment_value(p_adjustment_id uuid) set search_path = '';
alter function inventory.approve_inventory_count(p_count_id uuid, p_actor uuid, p_exception_reason text) set search_path = '';
alter function inventory.balance_at(p_kitchen_id bigint, p_lot_id uuid, p_ingredient_id uuid, p_frozen_preparation_id uuid, p_instant timestamp with time zone) set search_path = '';
alter function inventory.bulk_confirm_receipt(p_receipt_id uuid, p_client_event_id text, p_user uuid) set search_path = '';
alter function inventory.cancel_opening_balance(p_opening_balance_id uuid, p_actor uuid) set search_path = '';
alter function inventory.close_issue_request(p_request_id uuid, p_user uuid, p_seen_movements integer, p_seen_suggestions text) set search_path = '';
alter function inventory.close_month(p_kitchen_id bigint, p_competencia date, p_user uuid) set search_path = '';
alter function inventory.confirm_inventory_count(p_count_id uuid, p_user uuid) set search_path = '';
alter function inventory.count_entry_requires_counting() set search_path = '';
alter function inventory.count_lines(p_count_id uuid) set search_path = '';
alter function inventory.count_round_same_kitchen() set search_path = '';
alter function inventory.count_scope_acceptance_requires_open() set search_path = '';
alter function inventory.expiry_alert_days(p_kitchen_id bigint, p_ingredient_id uuid, p_conservation_class text) set search_path = '';
alter function inventory.find_designation(p_person uuid, p_unit_id bigint, p_empenho_id uuid, p_roles text[]) set search_path = '';
alter function inventory.issue_item_requires_open_request() set search_path = '';
alter function inventory.issue_stock(p_request_id uuid, p_ingredient_id uuid, p_quantity numeric, p_user uuid, p_emission_id text, p_override_lot_id uuid, p_justification text, p_production_task_id uuid) set search_path = '';
alter function inventory.issue_suggestion_fingerprint(p_request_id uuid) set search_path = '';
alter function inventory.kitchen_settings(p_kitchen_id bigint) set search_path = '';
alter function inventory.lot_short_code() set search_path = '';
alter function inventory.mark_module_transaction() set search_path = '';
alter function inventory.open_inventory_count(p_kitchen_id bigint, p_type text, p_scope text, p_scope_params jsonb, p_blind boolean, p_blind_waiver_reason text, p_user uuid) set search_path = '';
alter function inventory.open_recount(p_count_id uuid, p_ingredient_ids uuid[], p_frozen_preparation_ids uuid[], p_user uuid) set search_path = '';
alter function inventory.opening_balance_item_require_draft() set search_path = '';
alter function inventory.opening_balance_posted_immutable() set search_path = '';
alter function inventory.post_opening_balance(p_opening_balance_id uuid, p_actor uuid) set search_path = '';
alter function inventory.post_stock_adjustment(p_adjustment_id uuid, p_actor uuid, p_approval_exception_reason text) set search_path = '';
alter function inventory.reason_always_requires_approval(p_reason text) set search_path = '';
alter function inventory.receipt_line_live_events(p_receipt_item_id uuid) set search_path = '';
alter function inventory.receipt_must_be_open() set search_path = '';
alter function inventory.receipt_scan_event_immutable() set search_path = '';
alter function inventory.record_receipt_event(p_receipt_id uuid, p_receipt_item_id uuid, p_client_event_id text, p_method text, p_quantity numeric, p_user uuid, p_raw_code text, p_gtin text, p_lot_code text, p_expiry_date date, p_package_factor numeric, p_reversed_event_id uuid, p_divergence_reason text, p_expected_total numeric) set search_path = '';
alter function inventory.refresh_issue_suggestion(p_request_id uuid, p_lines jsonb) set search_path = '';
alter function inventory.register_leftover(p_kitchen_id bigint, p_frozen_preparation_id uuid, p_lot_code text, p_expiry_date date, p_quantity numeric, p_task_id uuid, p_discard boolean, p_reason text, p_user uuid) set search_path = '';
alter function inventory.register_production_issue(p_task_id uuid, p_lines jsonb, p_user uuid) set search_path = '';
alter function inventory.reject_inventory_count(p_count_id uuid, p_actor uuid, p_reason text) set search_path = '';
alter function inventory.return_issue(p_request_id uuid, p_lot_id uuid, p_quantity numeric, p_user uuid, p_emission_id text) set search_path = '';
alter function inventory.save_opening_balance_draft(p_kitchen_id bigint, p_actor uuid, p_source text, p_source_filename text, p_items jsonb, p_rejections jsonb) set search_path = '';
alter function inventory.set_not_counted_accepted(p_count_id uuid, p_ingredient_id uuid, p_frozen_preparation_id uuid, p_accepted boolean) set search_path = '';
alter function inventory.set_opening_balance_costs(p_opening_balance_id uuid, p_actor uuid, p_costs jsonb) set search_path = '';
alter function inventory.split_lot(p_lot_id uuid, p_quantity numeric, p_derivation text, p_user uuid, p_expiry_date date, p_location text) set search_path = '';
alter function inventory.stock_movement_costing_after() set search_path = '';
alter function inventory.stock_movement_costing_before() set search_path = '';
alter function inventory.stock_movement_immutable() set search_path = '';
alter function inventory.stock_movement_occurred_at_guard() set search_path = '';
alter function inventory.stock_movement_period_lock() set search_path = '';
alter function inventory.stock_movement_require_module() set search_path = '';
alter function inventory.sync_count_scope_open() set search_path = '';
alter function inventory.sync_receipt_line(p_receipt_item_id uuid) set search_path = '';
alter function inventory.transfer_stock(p_lot_id uuid, p_to_kitchen bigint, p_quantity numeric, p_user uuid) set search_path = '';

-- journal
alter function journal.generate_submission_number() set search_path = '';
alter function journal.log_article_status_change() set search_path = '';
alter function journal.set_version_number() set search_path = '';
alter function journal.update_updated_at() set search_path = '';

-- procurement
alter function procurement.supply_order_check_empenho() set search_path = '';

-- rumaer
alter function rumaer.set_updated_at() set search_path = '';

-- siafi_integration
alter function siafi_integration.claim_import_batch(p_batch_id uuid) set search_path = '';

-- sisub
alter function sisub.catmat_similarity(p_left text, p_right text) set search_path = '';
alter function sisub.compras_amostra_fingerprint(p_id_compra text, p_id_item_compra integer, p_descricao_item text, p_preco_unitario numeric, p_capacidade_unidade_fornecimento numeric, p_sigla_unidade_fornecimento text, p_sigla_unidade_medida text, p_quantidade numeric, p_codigo_uasg text, p_nome_uasg text, p_municipio text, p_estado text, p_esfera text, p_marca text, p_normalized_price numeric, p_reference_date date) set search_path = '';
alter function sisub.set_updated_at() set search_path = '';
alter function sisub.touch_chat_session_updated_at() set search_path = '';
alter function sisub.touch_module_chat_session() set search_path = '';

-- sucont
alter function sucont.set_updated_at() set search_path = '';
