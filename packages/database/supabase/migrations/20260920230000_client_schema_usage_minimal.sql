-- ============================================================================
-- Clientes (anon/authenticated) só alcançam os schemas que o navegador usa
-- ============================================================================
--
-- Depois de 20260920210000 nenhuma função nossa é executável por cliente. Mas a
-- proteção das TABELAS e views dependia de uma porta só: o grant de tabela. Os
-- dois papéis da chave publicável tinham USAGE em 17 dos 20 schemas expostos, e
-- clientes ainda tinham grant em tabelas que ninguém lê pelo navegador —
-- inclusive views de compatibilidade do `core` com INSERT/UPDATE/DELETE para
-- `authenticated`. Um grant de tabela a mais, ou uma policy permissiva, abria o
-- dado de uma vez.
--
-- O que o navegador usa (levantado em todos os apps, 2026-09-19): auth, upload
-- por URL assinada (Storage, sem policy em `storage.objects`) e Realtime de seis
-- tabelas — exatamente as da publicação `supabase_realtime`:
--   • `kitchen.daily_menu`, `kitchen.menu_items`, `kitchen.recipes` — sisub,
--     `authenticated`;
--   • `assignment_selection.edition`, `person`, `vacancy` — telão público (`anon`)
--     e controlador (`authenticated`).
-- As policies delas são `using (true)`: nenhuma consulta outro schema.
--
-- Fica, então:
--   • `kitchen`: USAGE só para `authenticated` (o `anon` não tinha grant de
--     tabela nenhum ali);
--   • `assignment_selection`: USAGE para os dois;
--   • `public`: sem mudança. O USAGE vem de PUBLIC (dono `pg_database_owner`) e
--     papéis internos da plataforma dependem dele; o que sobra lá é extensão,
--     tabela legada com RLS negando tudo e funções já fechadas;
--   • todos os outros: sem USAGE e sem grant de tabela/sequence para cliente.
--
-- O gate (`audit:rls`, lint `client_schema_usage`) impede a volta: USAGE de
-- cliente num schema fora da allowlist é erro.
--
-- E duas funções mortas saem: `public.match_documents` e
-- `public.documents_tsv_update` nasceram fora do versionamento (nenhuma migration
-- as cria), a primeira lê `public.documents`, que não existe, e a segunda não
-- está ligada a gatilho nenhum. As duas tinham EXECUTE explícito para
-- `anon`/`authenticated`. `if exists` porque um banco novo não as tem.
-- ============================================================================

do $$
declare
  v_schema text;
begin
  foreach v_schema in array array[
    'access_control', 'compras_gov_integration', 'core', 'finance', 'gs1_integration',
    'iefa', 'journal', 'nutrition_reference', 'procurement', 'rumaer', 'siafi_integration',
    'sisub', 'sucont'
  ] loop
    execute format('revoke all on all tables in schema %I from anon, authenticated', v_schema);
    execute format('revoke all on all sequences in schema %I from anon, authenticated', v_schema);
    execute format('revoke usage on schema %I from anon, authenticated', v_schema);
  end loop;
end;
$$;

-- kitchen: o Realtime do sisub lê como `authenticated`; o `anon` não tem o que fazer ali
revoke all on all tables in schema kitchen from anon;
revoke usage on schema kitchen from anon;

-- pelo catálogo, e não por assinatura: `match_documents(vector, …)` nem resolve o
-- tipo num banco sem a extensão no search_path, e o `if exists` não evita esse erro
do $$
declare
  v_routine regprocedure;
begin
  for v_routine in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('match_documents', 'documents_tsv_update')
  loop
    execute format('drop function %s', v_routine);
  end loop;
end;
$$;
