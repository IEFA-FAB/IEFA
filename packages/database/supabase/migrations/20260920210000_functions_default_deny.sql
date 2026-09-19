-- ============================================================================
-- Funções dos schemas expostos: EXECUTE só para quem precisa (default deny)
-- ============================================================================
--
-- O problema: o Postgres dá EXECUTE a PUBLIC em toda função nova, e `anon` e
-- `authenticated` — os papéis de quem chama a API com a chave publicável, que é
-- pública e vai no bundle de todo app — herdam de PUBLIC. As migrations do repo
-- escreviam `revoke all on function X from anon, authenticated`, que parece
-- fechar e não tira nada: o grant está em PUBLIC. Medido em 2026-09-19: dezenas
-- de funções dos 20 schemas de `pgrst.db_schemas` executáveis por `anon`.
--
-- Nada era explorável — as de schema acessível eram de gatilho, utilitárias ou
-- paravam na permissão da tabela —, mas a proteção de cada uma dependia da
-- ÚLTIMA porta que sobrou: uma função SECURITY DEFINER nova com o `revoke` de
-- sempre, ou um `grant` de tabela a `authenticated`, abriria um endpoint
-- `/rest/v1/rpc/<nome>` sem ninguém perceber.
--
-- Quem chama função hoje (levantado no código de todos os apps, 2026-09-19):
--   • servidor, via supabase-js com a chave secreta → `service_role`;
--   • ORM (Drizzle), scripts e pg_cron → `postgres`, o DONO das funções;
--   • `supabase_auth_admin` → `public.handle_new_user` (grant explícito, mantido);
--   • navegador (`anon`/`authenticated`) → NENHUMA função. Ele só usa auth,
--     upload por URL assinada e Realtime de tabelas com policy `using (true)`.
--
-- Por isso a ordem abaixo: primeiro garante o `service_role` EXPLICITAMENTE (ele
-- também dependia de PUBLIC em `sisub.catmat_match_candidates` e nas funções que
-- ela chama por dentro), depois tira PUBLIC/anon/authenticated. Funções de
-- extensão (`pg_trgm`, `unaccent`, do dono `supabase_admin`) ficam como estão:
-- são puras e gerenciadas pela plataforma.
--
-- E o default passa a ser NEGAR. `alter default privileges … in schema X revoke
-- … from public` NÃO gruda — o default por schema só ACRESCENTA ao global —, e a
-- 20260920200000 usou exatamente essa forma: no `inventory`, função nova seguia
-- nascendo executável por `anon`. O que gruda é o default GLOBAL do dono. Os
-- defaults por schema passam a conceder só ao `service_role`.
-- ============================================================================

do $$
declare
  v_schemas text[] := array[
    'public', 'sisub', 'iefa', 'journal', 'forms', 'rumaer', 'core', 'access_control',
    'kitchen', 'procurement', 'finance', 'compras_gov_integration', 'inventory',
    'siafi_integration', 'gs1_integration', 'nutrition_reference', 'assignment_selection',
    'sucont', 'alpha', 'documents'
  ];
  v_routine record;
  v_schema text;
begin
  for v_routine in
    select p.oid::regprocedure as signature, p.prokind
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = any (v_schemas)
       and p.proowner = 'postgres'::regrole
       and p.prokind in ('f', 'p')
       -- função membro de extensão é da extensão, não nossa
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    -- (1) o servidor, explícito — ANTES de tirar PUBLIC
    execute format('grant execute on %s %s to service_role',
                   case v_routine.prokind when 'p' then 'procedure' else 'function' end, v_routine.signature);
    -- (2) ninguém mais por herança
    execute format('revoke execute on %s %s from public, anon, authenticated',
                   case v_routine.prokind when 'p' then 'procedure' else 'function' end, v_routine.signature);
  end loop;

  -- (3) o que for criado daqui em diante já nasce fechado
  foreach v_schema in array v_schemas loop
    execute format('alter default privileges for role postgres in schema %I grant execute on routines to service_role', v_schema);
    execute format('alter default privileges for role postgres in schema %I revoke execute on routines from anon, authenticated', v_schema);
  end loop;
end;
$$;

-- o default GLOBAL do dono: é ele que decide o que PUBLIC recebe
alter default privileges for role postgres revoke execute on routines from public;
