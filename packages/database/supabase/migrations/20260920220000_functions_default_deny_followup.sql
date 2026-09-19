-- ============================================================================
-- Default deny de funções (20260920210000): as duas pontas que ficaram de fora
-- ============================================================================
--
-- 1. O default GLOBAL do dono deixou de dar EXECUTE a PUBLIC em QUALQUER schema,
--    mas o grant ao `service_role` ficou só nos 20 schemas expostos. Uma função
--    auxiliar num schema novo (ex.: `private.norm()`), ou uma função de extensão
--    instalada/atualizada pelo `postgres` (pgcrypto, uuid-ossp, pgmq e
--    pg_stat_statements são dele aqui), nasceria sem EXECUTE para o servidor — e
--    a RPC que a chama falharia com 42501. O `service_role` passa a vir do
--    default global também.
--
-- 2. `supabase_read_only_user` (membro somente-leitura do painel e sessões
--    read-only de MCP) e `dashboard_user` só executavam funções por PUBLIC. Sem
--    ele, ler uma view que chama função (`sucont.checklist_current` →
--    `sucont.today()`, `inventory.v_lot_expiry` → `expiry_alert_days`) falha para
--    eles. Voltam a executar — mas só função de LEITURA (stable/immutable) e
--    INVOKER: função que escreve, ou que roda como dono, não vai para papel
--    somente-leitura.
-- ============================================================================

alter default privileges for role postgres grant execute on routines to service_role;

do $$
declare
  v_routine record;
begin
  for v_routine in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proowner = 'postgres'::regrole
       and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_'
       and p.prokind = 'f'
       and p.provolatile in ('s', 'i')
       and not p.prosecdef
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to supabase_read_only_user, dashboard_user', v_routine.signature);
  end loop;
end;
$$;
