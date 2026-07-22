-- Correções apontadas pela auditoria `bun --filter @iefa/database audit:rls`.
--
-- 1) RLS nas tabelas do fluxo de produção (kitchen.recipe_step*, step_template*, utensil)
--
--    Estas sete tabelas nasceram no épico do Fluxo de Produção sem `enable row level
--    security`, enquanto o restante do schema `kitchen` recebeu RLS. Como o schema está
--    em `pgrst.db_schemas` e os roles `anon`/`authenticated` têm GRANT de
--    SELECT/INSERT/UPDATE/DELETE nele, qualquer portador da publishable key — que é
--    pública por definição, ela vai no bundle do cliente — podia ler E ESCREVER nelas
--    pela API REST, sem passar por nenhuma server function.
--
--    Ligar RLS sem criar policy = nega tudo para anon/authenticated, que é a postura
--    correta aqui: nenhum código cliente acessa estas tabelas diretamente (todo o
--    caminho de leitura/escrita passa por server fn com a service key, que ignora RLS).
--
-- 2) search_path fixo nas funções SECURITY DEFINER
--
--    Uma função SECURITY DEFINER sem `search_path` resolve nomes não qualificados usando
--    o search_path de QUEM CHAMA — quem controla um schema no caminho de busca consegue
--    fazer a função executar objetos dele com os privilégios do dono. As quatro funções
--    abaixo já qualificam tudo (journal.*, auth.*), então `search_path = ''` (recomendação
--    da Supabase) é seguro e fecha o vetor.
--
-- Views com security_invoker ausente ficaram DE FORA de propósito: três delas são lidas
-- por anon nas páginas públicas (journal, documentos legais) e ativar o invoker as
-- submeteria à RLS das tabelas base, quebrando esses fluxos. Tratar em PR próprio, com
-- as policies de leitura pública criadas junto.

-- ── 1. RLS ────────────────────────────────────────────────────────────────────

alter table kitchen.recipe_step enable row level security;
alter table kitchen.recipe_step_input enable row level security;
alter table kitchen.recipe_step_output enable row level security;
alter table kitchen.recipe_step_utensil enable row level security;
alter table kitchen.step_template enable row level security;
alter table kitchen.step_template_utensil enable row level security;
alter table kitchen.utensil enable row level security;

comment on table kitchen.recipe_step is
	'Passos do fluxo de produção. RLS ligada sem policy: acesso exclusivo via service key (server functions). Nenhum acesso direto de cliente.';

-- ── 2. SECURITY DEFINER com search_path fixo ─────────────────────────────────

alter function public.handle_new_user() set search_path = '';
alter function journal.get_article_details(uuid) set search_path = '';
alter function journal.is_editor(uuid) set search_path = '';
alter function forms.lookup_user_id_by_email(text) set search_path = '';
