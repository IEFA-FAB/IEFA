-- Índice nas FKs criadas pelas migrations de 2026-09-26 (execução flexível da despesa, execução
-- do dia, finanças). A limpeza (20260926219500) indexou as 199 FKs que existiam na auditoria; estas
-- 13 nasceram depois, nos PRs do mesmo dia, sem índice no lado filho (advisor
-- `unindexed_foreign_keys`). Sem ele, apagar a linha referenciada — quase sempre um usuário do Auth
-- (`*_by`) — varre a tabela filha.

create index if not exists credit_note_created_by_fk_idx on finance.credit_note (created_by);
create index if not exists credit_note_import_batch_id_fk_idx on finance.credit_note (import_batch_id);
create index if not exists empenho_item_purchase_item_id_fk_idx on finance.empenho_item (purchase_item_id);
create index if not exists empenho_rp_inscription_created_by_fk_idx on finance.empenho_rp_inscription (created_by);
create index if not exists empenho_rp_inscription_superseded_by_fk_idx on finance.empenho_rp_inscription (superseded_by);
create index if not exists liquidacao_deduction_created_by_fk_idx on finance.liquidacao_deduction (created_by);
create index if not exists stock_issue_request_explained_by_fk_idx on inventory.stock_issue_request (explained_by);
create index if not exists frozen_preparation_provisional_by_fk_idx on kitchen.frozen_preparation (provisional_by);
create index if not exists frozen_preparation_provisional_reviewed_by_fk_idx on kitchen.frozen_preparation (provisional_reviewed_by);
create index if not exists menu_items_added_in_execution_by_fk_idx on kitchen.menu_items (added_in_execution_by);
create index if not exists menu_items_execution_reviewed_by_fk_idx on kitchen.menu_items (execution_reviewed_by);
create index if not exists recipes_provisional_by_fk_idx on kitchen.recipes (provisional_by);
create index if not exists acquisition_created_by_fk_idx on procurement.acquisition (created_by);
