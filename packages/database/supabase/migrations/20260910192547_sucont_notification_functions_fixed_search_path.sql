-- sucont_notification_functions_fixed_search_path
-- As doze funções do sino nasceram com `search_path` mutável (lint
-- `function_search_path_mutable` do Supabase; a família `secdef_search_path` do
-- `audit:rls` deste repo).
--
-- Nenhuma delas é SECURITY DEFINER, então o risco não é o clássico de escalar
-- privilégio por uma definer. O que importa aqui é OUTRO caminho: o
-- `run_notification_tick` é executado pelo pg_cron como `postgres`, e ele chama
-- `notify_section` → `notification_audience` → `access_control.user_permissions`.
-- Uma função dessa cadeia que resolva nome por `search_path` do papel é resolvida
-- com os privilégios do superusuário do banco.
--
-- Os corpos já qualificam tudo com o schema, então `set search_path = ''` não muda
-- comportamento nenhum: só tira do papel a decisão de qual `holiday` é a
-- `holiday`. `pg_catalog` segue implícito, que é o que mantém `now()`,
-- `generate_series` e `to_char` funcionando com a lista vazia.

alter function sucont.today() set search_path = '';
alter function sucont.business_days(date) set search_path = '';
alter function sucont.nth_business_day(date, integer) set search_path = '';
alter function sucont.last_business_day(date) set search_path = '';
alter function sucont.checklist_period(text, integer, date) set search_path = '';
alter function sucont.notification_audience() set search_path = '';
alter function sucont.notify_section(text, text, text, text, uuid, date) set search_path = '';
alter function sucont.purge_notifications() set search_path = '';
alter function sucont.run_notification_tick() set search_path = '';
alter function sucont.notice_notify() set search_path = '';
alter function sucont.notice_resolve() set search_path = '';
alter function sucont.occurrence_resolve() set search_path = '';
