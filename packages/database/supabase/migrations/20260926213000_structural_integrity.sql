-- Integridade estrutural: achados da auditoria de 2026-09-26 (PR #469).
--
-- Compatível com o código da main anterior a este PR: nada aqui derruba coluna nem tabela
-- (o `db-types-drift.contract.test.ts` da main reprovaria tipo apontando para o que sumiu,
-- e o Drizzle da main seleciona toda coluna do schema em `findFirst` sem `columns`), e nenhuma
-- FK nova recusa um valor que a main ainda grava. O que exigiria isso fica para a fase de
-- contract, listada no fim. Contagens abaixo: banco compartilhado, 2026-09-26.
--
-- As FKs para `auth.users` entram NOT VALID e no FIM deste arquivo; a validação é a migration
-- seguinte (20260926213500_structural_integrity_validate.sql). Motivo: `ADD FOREIGN KEY` pega
-- SHARE ROW EXCLUSIVE na tabela referenciada até o COMMIT, e isso bloqueia toda escrita em
-- `auth.users` (o GoTrue grava `last_sign_in_at` a cada login). NOT VALID não varre o filho,
-- então a trava dura só o resto deste arquivo — milissegundos, já que as FKs são os últimos
-- comandos. O `VALIDATE CONSTRAINT` da migration seguinte pega SHARE UPDATE EXCLUSIVE no filho
-- e ROW SHARE em `auth.users`, que não conflitam com INSERT/UPDATE/DELETE: login e cadastro
-- seguem durante a varredura. Entre os dois arquivos a FK já barra linha nova sem dono; só
-- as antigas ainda não foram conferidas (todas conferidas à mão abaixo: 0 órfãos).
--
-- 1. Unidade de medida sem FK para `core.measure_unit` (13 códigos).
--    Normalização SÓ do inequívoco — caixa/espaço de um código do catálogo, ou a descrição
--    exata de um código ("Unidade" = UN). Mapeamento aplicado, com as linhas que cada regra toca:
--      procurement.purchase_item.purchase_measure_unit
--        'kg' (25), 'Kg' (1)                          → 'KG'
--        'lt' (1, "SUCO ... CONCENTRADO")             → 'LT'
--        'UNIDADE' (4), 'unidade' (2), 'Unidade' (1) → 'UN'
--      kitchen.ingredient.measure_unit                 '' → NULL (8: 3 vivas, 5 apagadas)
--      kitchen.ingredient_item.purchase_measure_unit   '' → NULL (3: 2 vivas, 1 apagada)
--    O resto fica na fila `core.v_measure_unit_review` (782 → 743 pendentes, todas de
--    ingredient_item: "Embalagem", "Cento", "Garrafa", "Lata com 150 g"…): embalagem não é
--    unidade, e escolher o código é decisão de quem conhece o item.
--    Nenhuma FK de unidade entra agora:
--      kitchen.ingredient.measure_unit          100% no catálogo depois do '' → NULL, mas a main
--                                               aceita qualquer texto (`z.string()`) e grava ""
--                                               quando o select fica em "Selecione". Este PR
--                                               normaliza na entrada (schema → `toMeasureUnitCode`:
--                                               código em maiúscula ou NULL); FK no contract.
--      procurement_list_item.measure_unit       588/588 no catálogo, mas é CÓPIA da unidade do
--                                               insumo. FK na cópia antes da FK na origem faz um
--                                               "kg" gravado no insumo (API, rascunho antigo no
--                                               cliente) derrubar o save da ATA inteiro com 23503.
--                                               NOT VALID não ajuda: ela barra justamente o INSERT
--                                               novo. Entra no contract, junto com a da origem.
--      procurement.purchase_item.purchase_measure_unit  100% depois do mapeamento, mas o
--                                               editor é campo livre ("Ex: KG, SACO, CAIXA")
--                                               → sem FK até o campo virar select do catálogo.
--      procurement_list_item.purchase_measure_unit      511/511 não nulos no catálogo, mas é
--                                               cópia do campo livre acima → sem FK.
--      kitchen.ingredient_item.purchase_measure_unit    743 fora do catálogo → sem FK.
--
-- 2. `procurement_list_item.folder_id` text → uuid (588/588 casam com kitchen.folder), com FK
--    ON DELETE SET NULL: o item guarda `folder_description` desnormalizado, então perder a
--    pasta não perde o rótulo, e uma ata antiga não trava a remoção de uma pasta. Pasta é
--    soft delete no app; a FK só age em DELETE físico. A main grava string com uuid (a pasta
--    do insumo) ou NULL; postgres.js e PostgREST mandam o parâmetro sem tipo, e o banco o
--    converte para uuid. A leitura continua string em JS. O faxineiro de fixtures
--    (`apps/sisub/scripts/purge-test-fixtures.ts`) passou a não seguir FK SET NULL.
--
-- 3. FKs com relação clara e 0 órfãos:
--    kitchen.folder.parent_id → folder            155 preenchidos, 0 órfãos. NO ACTION: pasta
--                                                  é soft delete; apagar fisicamente uma pasta
--                                                  com subpastas deve falhar, não órfã-las.
--    kitchen.recipes.base_recipe_id → recipes      2959 preenchidos, 1 órfão (abaixo). NO
--                                                  ACTION: é a raiz da linhagem de versões, e o
--                                                  órfão nasceu justamente de uma raiz apagada.
--    access_control.user_policy_attachment.user_id → auth.users   12/12, 0 órfãos. RESTRICT:
--                                                  o CASCADE revogaria vínculo de política sem
--                                                  linha em `sensitive_operation_log` (o trigger
--                                                  deixaria passar, pg_trigger_depth() > 1). Apagar
--                                                  conta com política anexada passa a exigir a
--                                                  revogação antes, pela função auditada.
--                                                  `user_permissions`, `mcp_api_keys`,
--                                                  `forms.response_viewer` e `questionnaire_editor`
--                                                  já têm CASCADE — o mesmo buraco, pré-existente,
--                                                  fica registrado no PR, não mudado aqui.
--    alpha.chat_thread / chat_message / chat_turn_usage.user_id → auth.users   0 linhas.
--                                                  CASCADE: conversa do assistente do Contrate
--                                                  é conteúdo pessoal que o próprio titular já
--                                                  pode apagar (LGPD.md); o contador do teto
--                                                  diário não tem valor sem a pessoa.
--    documents.official_document / chat_message / writer_profile / ai_generation.owner_id
--                                                  → auth.users   0 linhas. CASCADE: redação em
--                                                  andamento que só o dono lê (nenhum papel nem
--                                                  compartilhamento); o expediente oficial vive
--                                                  no SIGADAER. `ai_generation` guarda o rascunho
--                                                  enviado ao modelo e a resposta — conteúdo do
--                                                  titular. SET NULL conservaria esse texto de uma
--                                                  conta apagada, contra o pedido de exclusão, e
--                                                  sem o documento (que cai por CASCADE e zera
--                                                  `ai_generation.document_id`) a trilha não
--                                                  reconstitui mais nada. RESTRICT travaria a
--                                                  exclusão manual (prazo de 7 dias) sem runbook.
--    Órfão: 2f91fd72-fd2c-4dce-bd00-3c98d28199e0 "Arroz - Baião de Dois", cozinha 1, v1,
--    criada em 2026-01-28, apontando para e7b23f6d-762c-4f60-8cb0-1999a01a8f4e, que não existe.
--    A raiz não é dedutível: as duas receitas globais homônimas nasceram na importação de
--    2026-03-17 (legacy_id), depois dela, e toda linhagem do banco fica numa cozinha só.
--    Vira NULL (raiz de si mesma); nenhuma outra linha aponta para a raiz perdida, então a
--    listagem e o histórico dela ficam iguais (família de um).
--    Índice no lado filho de toda FK nova que não tinha um que a cobrisse:
--    procurement_list_item.folder_id, alpha.chat_message.user_id (o parcial `role = 'user'`
--    saiu em 20260922131037, e a resposta do assistente também grava `user_id`),
--    documents.official_document.owner_id (o existente é parcial, `deleted_at is null`) e
--    documents.chat_message.owner_id. As demais já têm índice que começa pela coluna.
--
-- 4. `core.user_military_data."nrOrdem"`: 68.317 linhas, 0 nulos, 0 duplicados, mas SEM
--    UNIQUE. A tabela é espelho do efetivo sincronizado de fora do repo (20260910225309), e o
--    pg_stat desde 2025-07-10 mostra 68.738 inserts, 421 deletes e 0 updates: carga por
--    INSERT, sem upsert, por um carregador que não está aqui (os 421 são fixtures; a linha
--    68.317 é uma fixture vazada, nrOrdem "NOmuf2ta…"). Uma recarga que insira antes de apagar,
--    ou um SARAM que troque de CPF (a PK), derrubaria a sincronização inteira com 23505. Fica o
--    índice simples que já existe. `core.user_data."nrOrdem"`: 1.358/1.430 preenchidos, 3
--    valores duplicados, 87 sem par no efetivo → só índice. A PK por CPF fica para a proposta
--    de LGPD.
--
-- 5. Nomes herdados do rename `user_email` → `user_data`: user_email_pkey, user_email_email_key
--    e user_email_id_fkey. Nenhum código referencia por nome (o upsert usa `target: id`; o
--    reconhecimento da colisão de email procura "email" no nome da constraint).
--
-- 6/7/8. Sem DDL aqui:
--    `alpha.structure_node.title_embedding` (0/8.707) e `kitchen.recipes.upstream_version_snapshot`
--    (0/5.170) não têm uso fora dos tipos gerados; o drop vai no contract. `siloms_siafi_balance
--    .difference` já é GENERATED ALWAYS AS (abs(siafi_value - siloms_value)) STORED — nada a
--    mudar. `kitchen.kitchen.kitchen_id` tem propósito (cozinha de produção que abastece esta,
--    editável no gerenciador de locais): ganha comentário, não drop.
--    `procurement.compras_amostra.esfera` (0/121.758): LACUNA documentada, sem correção aqui.
--    A API 1_consultarMaterial devolve "F"/"E"/"M"; o sisub descarta o campo (o `SampleSchema`
--    da server fn não o declara e `persistSamples` grava NULL fixo). Passar a gravá-lo agora
--    quebraria a deduplicação: `fingerprint` inclui `esfera`, então toda compra já catalogada
--    com NULL voltaria como linha nova. Preencher exige antes tirar `esfera` do fingerprint
--    (ou recalculá-lo junto com um backfill da esfera pela API).
--
-- Tipos (`generated.ts`, `drizzle/schema.ts`, `relations.ts`) são regerados depois de aplicada,
-- pelo mantenedor: `folder_id` passa a uuid, as FKs viram relations, os nomes renomeados mudam.
--
-- Contract (PR seguinte, depois deste mergeado, deployado e com os tipos regerados):
--    alter table kitchen.ingredient add constraint ingredient_measure_unit_fkey
--      foreign key (measure_unit) references core.measure_unit (code);
--    alter table procurement.procurement_list_item add constraint procurement_list_item_measure_unit_fkey
--      foreign key (measure_unit) references core.measure_unit (code);
--    (com índices no lado filho), e os drops de `alpha.structure_node.title_embedding` e
--    `kitchen.recipes.upstream_version_snapshot`, que exigem antes tirá-las do Drizzle.

-- ── 1. Unidade de medida ─────────────────────────────────────────────────────

update procurement.purchase_item p
   set purchase_measure_unit = m.code
  from (values ('kg', 'KG'), ('Kg', 'KG'), ('lt', 'LT'), ('UNIDADE', 'UN'), ('unidade', 'UN'), ('Unidade', 'UN')) as m (raw, code)
 where p.purchase_measure_unit = m.raw;

update kitchen.ingredient set measure_unit = null where btrim(measure_unit) = '';

update kitchen.ingredient_item set purchase_measure_unit = null where btrim(purchase_measure_unit) = '';

-- ── 2. procurement_list_item.folder_id: text → uuid + FK ─────────────────────

do $$
begin
	if (select data_type from information_schema.columns
	     where table_schema = 'procurement' and table_name = 'procurement_list_item' and column_name = 'folder_id') = 'text' then
		-- Valor que não for uuid derruba a migration em vez de sumir calado.
		alter table procurement.procurement_list_item
			alter column folder_id type uuid using nullif(btrim(folder_id), '')::uuid;
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'procurement.procurement_list_item'::regclass and conname = 'procurement_list_item_folder_id_fkey') then
		alter table procurement.procurement_list_item
			add constraint procurement_list_item_folder_id_fkey foreign key (folder_id) references kitchen.folder (id) on delete set null;
	end if;
end $$;

create index if not exists procurement_list_item_folder_id_fk_idx on procurement.procurement_list_item (folder_id) where folder_id is not null;

-- ── 3. FKs entre tabelas do app ──────────────────────────────────────────────

update kitchen.recipes
   set base_recipe_id = null
 where id = '2f91fd72-fd2c-4dce-bd00-3c98d28199e0'
   and base_recipe_id = 'e7b23f6d-762c-4f60-8cb0-1999a01a8f4e'
   and not exists (select 1 from kitchen.recipes where id = 'e7b23f6d-762c-4f60-8cb0-1999a01a8f4e');

-- Já indexadas: folder_parent_id_idx e recipes_base_recipe_idx (parcial `is not null`, que cobre
-- a busca `= $1` da FK).
do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'kitchen.folder'::regclass and conname = 'folder_parent_id_fkey') then
		alter table kitchen.folder add constraint folder_parent_id_fkey foreign key (parent_id) references kitchen.folder (id) on delete no action;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'kitchen.recipes'::regclass and conname = 'recipes_base_recipe_id_fkey') then
		alter table kitchen.recipes add constraint recipes_base_recipe_id_fkey foreign key (base_recipe_id) references kitchen.recipes (id) on delete no action;
	end if;
end $$;

-- ── 4. nrOrdem ───────────────────────────────────────────────────────────────

create index if not exists "user_data_nrOrdem_idx" on core.user_data ("nrOrdem");

-- ── 5. Nomes do rename antigo ────────────────────────────────────────────────

do $$
declare
	r record;
begin
	for r in
		select * from (values
			('user_email_pkey', 'user_data_pkey'),
			('user_email_email_key', 'user_data_email_key'),
			('user_email_id_fkey', 'user_data_id_fkey')
		) as t (old_name, new_name)
	loop
		if exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = r.old_name)
		   and not exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = r.new_name) then
			execute format('alter table core.user_data rename constraint %I to %I', r.old_name, r.new_name);
		end if;
	end loop;
end $$;

-- ── 8. kitchen.kitchen.kitchen_id ────────────────────────────────────────────

comment on column kitchen.kitchen.kitchen_id is
	'Cozinha de produção que abastece esta (cozinha de consumo / pista quente). Editada no gerenciador de locais (places-graph, aresta kitchen.kitchen_id). Vazia em todas as cozinhas em 2026-09-26.';

-- ── 3 (cont.). Índices do lado filho das FKs para auth.users ─────────────────
-- Antes das FKs: `create index` trava só a tabela filha, não `auth.users`.

create index if not exists chat_message_user_id_fk_idx on alpha.chat_message (user_id);
create index if not exists official_document_owner_id_fk_idx on documents.official_document (owner_id);
create index if not exists chat_message_owner_id_fk_idx on documents.chat_message (owner_id);

-- ── 3 (cont.). FKs para auth.users: NOT VALID e por último ───────────────────
-- Validadas em 20260926213500_structural_integrity_validate.sql (ver o cabeçalho).

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'access_control.user_policy_attachment'::regclass and conname = 'user_policy_attachment_user_id_fkey') then
		alter table access_control.user_policy_attachment add constraint user_policy_attachment_user_id_fkey
			foreign key (user_id) references auth.users (id) on delete restrict not valid;
	end if;
end $$;

comment on constraint user_policy_attachment_user_id_fkey on access_control.user_policy_attachment is
	'RESTRICT de propósito: apagar a conta não revoga política em silêncio. Revogue antes pela função auditada (grava sensitive_operation_log) e só então apague o usuário.';

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_thread'::regclass and conname = 'chat_thread_user_id_fkey') then
		alter table alpha.chat_thread add constraint chat_thread_user_id_fkey
			foreign key (user_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_message'::regclass and conname = 'chat_message_user_id_fkey') then
		alter table alpha.chat_message add constraint chat_message_user_id_fkey
			foreign key (user_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_turn_usage'::regclass and conname = 'chat_turn_usage_user_id_fkey') then
		alter table alpha.chat_turn_usage add constraint chat_turn_usage_user_id_fkey
			foreign key (user_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.official_document'::regclass and conname = 'official_document_owner_id_fkey') then
		alter table documents.official_document add constraint official_document_owner_id_fkey
			foreign key (owner_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.chat_message'::regclass and conname = 'chat_message_owner_id_fkey') then
		alter table documents.chat_message add constraint chat_message_owner_id_fkey
			foreign key (owner_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.writer_profile'::regclass and conname = 'writer_profile_owner_id_fkey') then
		alter table documents.writer_profile add constraint writer_profile_owner_id_fkey
			foreign key (owner_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.ai_generation'::regclass and conname = 'ai_generation_owner_id_fkey') then
		alter table documents.ai_generation add constraint ai_generation_owner_id_fkey
			foreign key (owner_id) references auth.users (id) on delete cascade not valid;
	end if;
end $$;
