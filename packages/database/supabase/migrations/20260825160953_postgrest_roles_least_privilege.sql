-- Segunda etapa da auditoria de RLS de 2026-08-25 (a primeira, 20260825155457, fechou as
-- views e RPCs SECURITY DEFINER). Aqui o alvo é o excesso de privilégio dos roles do
-- PostgREST: policy permissiva que nenhum app usa, e GRANT herdado do default da Supabase.
--
-- A postura real do monorepo é: TODO acesso a dado passa por server function com service
-- key (que ignora RLS; a autorização mora no PBAC). Os roles `anon`/`authenticated` só
-- precisam de leitura em três lugares observáveis, verificados um a um no código:
--
--   1. telão da escolha de vagas (`assignment_selection`) — página pública sem sessão, e o
--      realtime do quadro só entrega payload se `anon` passar na RLS da tabela;
--   2. catálogo do rumaer — `public read` deliberado do catálogo de uniformes;
--   3. realtime do sisub (`kitchen.daily_menu`/`menu_items`/`recipes`) — mesma mecânica do
--      item 1, para `authenticated` (ver 20260526000000);
--   4. `core.measure_unit` — catálogo de referência, leitura aberta por desenho.
--
-- Tudo o mais que estava concedido era herança do default da Supabase ou cópia de padrão.
--
-- ── Por que cada bloco não muda comportamento ────────────────────────────────
--
-- Bloco 1 (policies): as 16 policies removidas cobrem tabelas que NENHUM client de browser
-- lê. Confirmado por inspeção de todos os clients de browser do monorepo: sucont, portal,
-- rumaer e forms só usam `supabase.auth` (e storage, no portal/rumaer); sisub só usa
-- `supabase.channel` (realtime); assignment-selection só usa `supabase.channel`. Os
-- exports `rumaerDb()`/`assignmentDb()` existem e não são chamados em lugar nenhum.
-- As duas policies `realtime_select` de `kitchen.menu_template_meal` e
-- `kitchen.frozen_preparation` são cópia do padrão de `kitchen.recipes` — mas essas duas
-- tabelas NÃO estão na publicação `supabase_realtime`, então nunca houve realtime nelas
-- para sustentar. As 10 de `sucont` davam a qualquer usuário logado de QUALQUER app
-- (sisub, portal, rumaer…) leitura de documento, notice, análise do DGC e saldo SIAFI —
-- driblando o módulo PBAC `sucont` inteiro.
--
-- Bloco 2 (privilégios de escrita): não existe UMA policy de INSERT/UPDATE/DELETE em
-- nenhum dos 19 schemas expostos — conferido no catálogo (`pg_policy where polcmd <> 'r'`
-- devolve zero linhas). Com RLS ligada e nenhuma policy de escrita, todo INSERT/UPDATE/
-- DELETE de anon/authenticated já era negado pela RLS; o GRANT era inerte.
--
-- A exceção é TRUNCATE, e ela importa: **RLS não se aplica a TRUNCATE**. Quem tem o
-- privilégio esvazia a tabela inteira, policy nenhuma no caminho. `anon` tinha TRUNCATE em
-- ~20 tabelas (todo o `public` legado, `core.user_data`, `core.user_military_data`,
-- `kitchen.meal_presences`…) por causa do `GRANT ALL` default. Não era alcançável pela API
-- (o PostgREST só emite SELECT/INSERT/UPDATE/DELETE/RPC, e `anon` é NOLOGIN, sem conexão
-- direta possível), mas é privilégio que não deveria existir.
--
-- Bloco 3 (SELECT): revoga tudo e devolve só a lista acima. Nas demais tabelas a RLS está
-- ligada sem nenhuma policy, então `anon`/`authenticated` já liam ZERO linha — a diferença
-- passa a ser receber `permission denied` em vez de lista vazia, num caminho que nenhum
-- app percorre. De quebra fecha a enumeração de schema: o `/rest/v1/` do PostgREST lista
-- para o portador da publishable key toda tabela em que ele tenha privilégio, e hoje isso
-- é o desenho inteiro do banco.
--
-- Dois limites conhecidos deste bloco 4, medidos neste banco e deixados por escrito para
-- ninguém reabrir a discussão sem dado:
--
--   a) `alter default privileges` sem `for role` só edita as entradas cujo GRANTOR é o
--      usuário corrente (`postgres`). Sobram as entradas com grantor `supabase_admin` no
--      schema `public`, que ainda concedem `arwdDxtm` a anon/authenticated. Não dá para
--      corrigir daqui: `pg_has_role('postgres','supabase_admin','MEMBER')` é falso. Elas só
--      valem para tabela criada PELO `supabase_admin` — objeto gerenciado pela Supabase,
--      nunca uma migration nossa.
--   b) Para FUNÇÃO o revoke não gruda de jeito nenhum. O Postgres mescla o default embutido
--      (que concede EXECUTE a PUBLIC) com o que está em `pg_default_acl`, então função nova
--      nasce com `=X/postgres` mesmo depois de
--      `alter default privileges … revoke execute on functions from public`. Testado criando
--      uma função depois do revoke: o ACL sai com PUBLIC do mesmo jeito. Revogar as entradas
--      explícitas `anon=X`/`authenticated=X` de `public` seria cosmético — anon continua
--      herdando de PUBLIC. Quem guarda esse flanco é o lint `secdef_client_execute` do
--      `audit:rls`, não o banco.
--
-- Bloco 4 (default privileges): é a causa raiz. `alter default privileges` da Supabase
-- devolve os GRANTs a cada tabela NOVA — `public` com `arwdDxtm` (ALL, TRUNCATE incluso)
-- para `anon`, `sisub` e `iefa` com `arwd`, `journal` com `arwd` para `authenticated`.
-- Sem mexer aqui, este PR se desfaz sozinho na próxima migration que criar tabela. Depois
-- disto, tabela que precisar de leitura de cliente declara o `grant select` explicitamente
-- — que é o que as migrations do rumaer e do assignment_selection já fazem.

-- ── 1. Policies permissivas sem consumidor ───────────────────────────────────

drop policy "auth read unidade_gestora"   on sucont.unidade_gestora;
drop policy "auth read checklist_item"    on sucont.checklist_item;
drop policy "auth read notice"            on sucont.notice;
drop policy "auth read workspace_note"    on sucont.workspace_note;
drop policy "auth read report"            on sucont.report;
drop policy "auth read document"          on sucont.document;
drop policy "auth read analysis_run"      on sucont.analysis_run;
drop policy "auth read generated_message" on sucont.generated_message;
drop policy "auth read dgc_analysis"      on sucont.dgc_analysis;
drop policy "auth read siloms_siafi_balance" on sucont.siloms_siafi_balance;

drop policy "realtime_select" on kitchen.menu_template_meal;
drop policy "realtime_select" on kitchen.frozen_preparation;

drop policy gpc_brick_read           on gs1_integration.gpc_brick;
drop policy gtin_read                on gs1_integration.gtin;
drop policy supplier_product_map_read on gs1_integration.supplier_product_map;

drop policy stock_policy_read on inventory.stock_policy;

-- ── 2 e 3. Zerar e devolver só o necessário ──────────────────────────────────

revoke all on all tables in schema
	public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen,
	procurement, finance, compras_gov_integration, inventory, siafi_integration,
	gs1_integration, nutrition_reference, assignment_selection, sucont, alpha
	from anon, authenticated;

revoke all on all sequences in schema
	public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen,
	procurement, finance, compras_gov_integration, inventory, siafi_integration,
	gs1_integration, nutrition_reference, assignment_selection, sucont, alpha
	from anon, authenticated;

-- Telão público da escolha de vagas: a página roda sem sessão e o realtime do quadro
-- (`useBoardRealtime`) só recebe payload se `anon` passar na RLS de person/vacancy.
grant select on
	assignment_selection.edition,
	assignment_selection.person,
	assignment_selection.vacancy,
	assignment_selection.vacancy_status
	to anon, authenticated;

-- Catálogo público de uniformes (policies `public read` de 20260614160000 em diante).
grant select on
	rumaer.piece,
	rumaer.piece_item,
	rumaer.uniform,
	rumaer.uniform_category,
	rumaer.uniform_variant,
	rumaer.uniform_variant_image,
	rumaer.uniform_variant_piece
	to anon, authenticated;

-- Catálogo de referência de unidades: leitura aberta por desenho (20260729130000).
grant select on core.measure_unit to anon, authenticated;

-- Realtime do sisub: sem SELECT o WS conecta e o payload nunca chega (20260526000000).
grant select on kitchen.daily_menu, kitchen.menu_items, kitchen.recipes to authenticated;

-- ── 4. Default privileges: parar de reconceder a cada tabela nova ────────────

alter default privileges in schema
	public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen,
	procurement, finance, compras_gov_integration, inventory, siafi_integration,
	gs1_integration, nutrition_reference, assignment_selection, sucont, alpha
	revoke all on tables from anon, authenticated;

alter default privileges in schema
	public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen,
	procurement, finance, compras_gov_integration, inventory, siafi_integration,
	gs1_integration, nutrition_reference, assignment_selection, sucont, alpha
	revoke all on sequences from anon, authenticated;

comment on schema sucont is
	'Hub SUCONT-4. Acesso exclusivo via service key (server functions + PBAC do módulo `sucont`): anon/authenticated não têm GRANT nem policy. As policies `auth read *` de 20260705180000 davam leitura a qualquer usuário logado de qualquer app do monorepo e foram removidas em 2026-08-25.';
