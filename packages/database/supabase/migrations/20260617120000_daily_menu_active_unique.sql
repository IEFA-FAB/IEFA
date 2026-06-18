-- Corrige upsertDailyMenu (sisub-domain): a operation usa
--   ON CONFLICT (service_date, meal_type_id, kitchen_id)
-- mas sisub.daily_menu só tinha PK em id → toda chamada rejeitava com
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Índice unique PARCIAL (apenas linhas ATIVAS): no máximo um cardápio não
-- soft-deletado por (data, refeição, cozinha). É parcial de propósito —
-- applyTemplate soft-deleta os menus existentes e re-insere os mesmos trios,
-- então um unique total quebraria essa rotação. O histórico soft-deletado
-- pode coexistir livremente.
--
-- NB: PostgREST/supabase-js NÃO consegue inferir um índice parcial via
-- ON CONFLICT (não há WHERE no INSERT). Por isso a operation upsertDailyMenu
-- foi reescrita para "select-then-insert" ciente de soft-delete; este índice
-- passa a ser a garantia de integridade contra corrida.

create unique index if not exists daily_menu_active_unique
  on sisub.daily_menu (service_date, meal_type_id, kitchen_id)
  where deleted_at is null;
