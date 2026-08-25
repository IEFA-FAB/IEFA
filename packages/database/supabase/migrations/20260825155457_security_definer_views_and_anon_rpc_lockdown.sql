-- Fecha os dois vetores que a auditoria de RLS de 2026-08-25 confirmou EXPLORÁVEIS em
-- produção, executando de verdade como `anon`/`authenticated` (`set local role`).
--
-- Nenhuma tabela com RLS desligada estava alcançável — o furo não era RLS ausente, era
-- passar POR CIMA dela:
--
-- 1) VIEW `SECURITY DEFINER`. View sem `security_invoker` executa com os privilégios do
--    dono (`postgres`, que tem BYPASSRLS), então a RLS das tabelas base simplesmente não
--    é avaliada. Com GRANT para `anon`, a view vira um túnel pela publishable key — que é
--    pública por definição, vai no bundle do cliente. Medido como `anon`:
--
--      kitchen.ingredient_last_review     1702 linhas   (`select` direto na tabela: 0)
--      kitchen.v_ingredient_kg_lt_items     30 linhas   (idem)
--      iefa.legal_documents_current          6 linhas   (idem)
--      journal.editorial_dashboard           1 linha    (idem)
--
--    Pior que a leitura: `journal.published_articles` é auto-updatable e tinha
--    INSERT/UPDATE/DELETE para `authenticated`. Qualquer usuário logado em QUALQUER app
--    do monorepo (sisub, portal, rumaer, forms…) podia UPDATE/DELETE em `journal.articles`
--    pela view, ignorando RLS. Confirmado: o UPDATE como `authenticated` roda sem
--    `permission denied` (afetou 0 linhas só porque ainda não há artigo publicado).
--
-- 2) FUNÇÃO `SECURITY DEFINER` executável por `anon` via `/rest/v1/rpc/<nome>`. Mesma
--    mecânica, exposta como endpoint:
--
--      journal.get_article_details(uuid)          devolve artigo + autores + versões +
--                                                 REVIEWS. Com os `id` vazando por
--                                                 editorial_dashboard, a cadeia dá o
--                                                 peer review cego inteiro a um anônimo.
--                                                 Confirmado: li status "accepted" e 2
--                                                 autores de um artigo cujo `select`
--                                                 direto devolve 0 linhas.
--      procurement.upsert_compras_amostras(jsonb) INSERE em procurement.compras_amostra —
--                                                 anônimo injetando preço na base que
--                                                 sustenta decisão de compra. Confirmado
--                                                 (chamada com `[]`, nada inserido).
--      forms.lookup_user_id_by_email(text)        lê auth.users → enumeração de contas.
--                                                 Hoje barrada porque `forms` não tem
--                                                 USAGE para anon, mas o schema ESTÁ em
--                                                 `pgrst.db_schemas`: um `grant usage`
--                                                 futuro liga a falha sem ninguém ver.
--
-- Este é o "PR próprio" que 20260722120000 deixou pendente. Aquela migration presumiu que
-- as views eram "lidas por anon nas páginas públicas (journal, documentos legais)" e que
-- ligar o invoker quebraria esses fluxos. A premissa não se sustenta: TODO consumidor foi
-- verificado e usa service role (`getJournalServerClient`, `createLegalClient` e o client
-- do sisub-domain são service-role; o único client de browser do portal, em
-- `apps/portal/src/lib/supabase.ts`, só toca auth e storage, nunca PostgREST nessas views).
-- `service_role` tem BYPASSRLS, então com `security_invoker = on` ele continua lendo tudo
-- e nenhuma policy nova é necessária.

-- ── 1. Views: submeter à RLS de quem chama ────────────────────────────────────

alter view journal.published_articles       set (security_invoker = on);
alter view journal.editorial_dashboard      set (security_invoker = on);
alter view iefa.legal_documents_current     set (security_invoker = on);
alter view kitchen.ingredient_last_review   set (security_invoker = on);
alter view kitchen.recipe_last_review       set (security_invoker = on);
alter view kitchen.v_ingredient_kg_lt_items set (security_invoker = on);

-- ── 2. Views: tirar o GRANT de cliente ────────────────────────────────────────
--
-- `security_invoker` sozinho já nega (as tabelas base têm RLS ligada e zero policy), mas
-- GRANT que ninguém usa é bomba armada: basta alguém criar uma policy permissiva depois
-- para a view voltar a ser um caminho de leitura/escrita fora das server functions.
-- `recipe_last_review` já não tinha grant para cliente e por isso não aparece aqui.

revoke all on journal.published_articles       from anon, authenticated;
revoke all on journal.editorial_dashboard      from anon, authenticated;
revoke all on iefa.legal_documents_current     from anon, authenticated;
revoke all on kitchen.ingredient_last_review   from anon, authenticated;
revoke all on kitchen.v_ingredient_kg_lt_items from anon, authenticated;

comment on view journal.published_articles is
	'Artigos publicados. security_invoker = on e sem grant para anon/authenticated: leitura exclusiva via service key. Era auto-updatable com GRANT de escrita para authenticated — caminho de UPDATE/DELETE em journal.articles por cima da RLS.';
comment on view journal.editorial_dashboard is
	'Painel editorial. security_invoker = on e sem grant para anon/authenticated: vazava id/status/submitter de submissão em avaliação para anônimo, e os id alimentavam journal.get_article_details.';
comment on view iefa.legal_documents_current is
	'Versão vigente de cada documento legal. security_invoker = on: o acesso público continua existindo pela camada de app (@iefa/legal-kit usa service role), não por GRANT direto a anon.';

-- ── 3. RPC SECURITY DEFINER: fechar o EXECUTE ─────────────────────────────────
--
-- As seis já tinham `search_path` fixo (20260722120000), o que fecha o sequestro de
-- resolução de nome — mas não o acesso: quatro estavam com EXECUTE para PUBLIC (o ACL
-- default do Postgres), e `anon`/`authenticated` herdam de PUBLIC. Como o REVOKE de
-- PUBLIC materializa o ACL, `service_role` perderia o acesso implícito junto — daí o
-- GRANT explícito logo abaixo de cada REVOKE.

revoke execute on function journal.get_article_details(uuid) from public, anon, authenticated;
grant execute on function journal.get_article_details(uuid) to service_role;

revoke execute on function journal.is_editor(uuid) from public, anon, authenticated;
grant execute on function journal.is_editor(uuid) to service_role;

revoke execute on function procurement.upsert_compras_amostras(jsonb) from public, anon, authenticated;
grant execute on function procurement.upsert_compras_amostras(jsonb) to service_role;

revoke execute on function forms.lookup_user_id_by_email(text) from public, anon, authenticated;
grant execute on function forms.lookup_user_id_by_email(text) to service_role;

revoke execute on function public.match_documents_fts(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.match_documents_fts(text, integer, jsonb) to service_role;

-- `handle_new_user` é função de gatilho (`returns trigger`): o PostgREST recusa expor, e o
-- Postgres só checa EXECUTE no CREATE TRIGGER, não a cada disparo. O GRANT para
-- `supabase_auth_admin` (dono de auth.users, onde vive on_auth_user_created) é cinto e
-- suspensório: o caminho de signup não pode quebrar por causa de um REVOKE de higiene.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role, supabase_auth_admin;
