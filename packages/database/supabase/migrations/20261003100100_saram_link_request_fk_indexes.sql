-- saram_link_request_fk_indexes — índices completos nas FKs de core.saram_link_request.
--
-- 20261003100000 criou `holder_user_id` e `decided_by` (ambas → auth.users, `on delete set null`)
-- sem índice no lado filho. O `audit:rls` (`fk_without_full_index`) reprovou depois do apply:
-- apagar uma conta em auth.users varreria a tabela de pedidos para anular as duas colunas.
-- `user_id` já tem índice completo (`saram_link_request_user_created_idx`, coluna líder).
--
-- Índices simples, não parciais: a checagem de FK não usa índice parcial. Reaplicável.

create index if not exists saram_link_request_holder_user_idx on core.saram_link_request (holder_user_id);
create index if not exists saram_link_request_decided_by_idx on core.saram_link_request (decided_by);
