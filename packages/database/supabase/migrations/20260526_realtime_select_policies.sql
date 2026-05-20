-- Re-enable SELECT for authenticated users on tables used by Supabase Realtime.
-- The 20260522 migration closed RLS entirely (service-role only), which silently
-- broke Realtime postgres_changes delivery — the WS connects but payloads are
-- never sent because the anon-key JWT fails the RLS check.
--
-- These SELECT-only policies restore Realtime event delivery while keeping
-- INSERT/UPDATE/DELETE locked to service role.
--
-- Also adds the tables to the supabase_realtime publication, which is required
-- for postgres_changes to receive WAL events at all.

-- RLS policies
CREATE POLICY "realtime_select" ON sisub.daily_menu
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "realtime_select" ON sisub.recipes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "realtime_select" ON sisub.menu_items
  FOR SELECT TO authenticated USING (true);

-- Publication (required for postgres_changes to work)
ALTER PUBLICATION supabase_realtime ADD TABLE sisub.daily_menu, sisub.recipes, sisub.menu_items;

-- supabase_realtime_admin must have USAGE on the schema and SELECT on published tables
-- for the Realtime service to deliver WAL events. Without these grants, channel
-- subscriptions silently time out even though the publication is configured.
GRANT USAGE ON SCHEMA sisub TO supabase_realtime_admin;
GRANT SELECT ON sisub.daily_menu, sisub.recipes, sisub.menu_items TO supabase_realtime_admin;
