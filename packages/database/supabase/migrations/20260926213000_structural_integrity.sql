-- Integridade estrutural: achados da auditoria de 2026-09-26.
--
-- Compatível com o código da main anterior a este PR: nada aqui derruba coluna nem tabela
-- (o `db-types-drift.contract.test.ts` da main reprovaria tipo apontando para o que sumiu,
-- e o Drizzle da main seleciona toda coluna do schema em `findFirst` sem `columns`), e nenhuma
-- FK nova recusa um valor que a main ainda grava. O que exigiria isso fica para a fase de
-- contract, listada no fim. Contagens abaixo: banco compartilhado, 2026-09-26.
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
--    FK só onde a coluna fica 100% no catálogo E a main não grava valor fora dele:
--      procurement_list_item.measure_unit       588/588 no catálogo; copiado da unidade do
--                                               insumo (select de 5 códigos), "" vira NULL
--                                               em `buildItemPayload` → FK agora.
--      kitchen.ingredient.measure_unit          100% depois do '' → NULL, mas a main grava ""
--                                               quando o select fica em "Selecione" (e a
--                                               restauração de versão devolve o "" de 18
--                                               snapshots) → código corrigido neste PR
--                                               (`blankMeasureUnitToNull`); FK no contract.
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
--    converte para uuid. A leitura continua string em JS.
--
-- 3. FKs com relação clara e 0 órfãos:
--    kitchen.folder.parent_id → folder            155 preenchidos, 0 órfãos. NO ACTION: pasta
--                                                  é soft delete; apagar fisicamente uma pasta
--                                                  com subpastas deve falhar, não órfã-las.
--    access_control.user_policy_attachment.user_id → auth.users   12/12, 0 órfãos. CASCADE,
--                                                  o mesmo de user_permissions, mcp_api_keys,
--                                                  forms.response_viewer e questionnaire_editor.
--                                                  Tabela vigiada: ALTER de constraint não
--                                                  dispara o trigger de linha; o DELETE em
--                                                  cascata passa (pg_trigger_depth() > 1), como
--                                                  `.claude/rules/database.md` prevê. Conta
--                                                  apagada não tem acesso a revogar.
--    alpha.chat_thread / chat_message / chat_turn_usage.user_id → auth.users   0 linhas.
--                                                  CASCADE: conversa do assistente do Contrate
--                                                  é conteúdo pessoal que o próprio titular já
--                                                  pode apagar (LGPD.md); o contador do teto
--                                                  diário não tem valor sem a pessoa.
--    documents.official_document / chat_message / writer_profile.owner_id → auth.users
--                                                  0 linhas. CASCADE: redação em andamento, só
--                                                  o dono lê (nenhum papel nem compartilhamento);
--                                                  o expediente oficial vive no SIGADAER.
--    documents.ai_generation.owner_id → auth.users  0 linhas. RESTRICT: é a trilha de
--                                                  auditoria do que foi enviado ao modelo (prova
--                                                  de que documento classificado não saiu); como
--                                                  `sensitive_operation_log`, apagar a conta exige
--                                                  decidir antes o destino da trilha.
--    kitchen.recipes.base_recipe_id → recipes      2959 preenchidos, 1 órfão (abaixo). NO
--                                                  ACTION: é a raiz da linhagem de versões, e o
--                                                  órfão nasceu justamente de uma raiz apagada.
--    Órfão: 2f91fd72-fd2c-4dce-bd00-3c98d28199e0 "Arroz - Baião de Dois", cozinha 1, v1,
--    criada em 2026-01-28, apontando para e7b23f6d-762c-4f60-8cb0-1999a01a8f4e, que não existe.
--    A raiz não é dedutível: as duas receitas globais homônimas nasceram na importação de
--    2026-03-17 (legacy_id), depois dela, e toda linhagem do banco fica numa cozinha só.
--    Vira NULL (raiz de si mesma); nenhuma outra linha aponta para a raiz perdida, então a
--    listagem e o histórico dela ficam iguais (família de um).
--
-- 4. `core.user_military_data."nrOrdem"`: 68.317 linhas, 0 nulos, 0 duplicados → UNIQUE, que
--    substitui o índice simples. Carga estática (dataAtualizacao de 2025-09-29, sem carregador
--    no repo). `core.user_data."nrOrdem"`: 1.358/1.430 preenchidos, 3 valores duplicados, 87 sem
--    par no efetivo → só índice. A PK por CPF fica para a proposta de LGPD.
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
-- Contract (PR seguinte, depois deste mergeado e com os tipos regerados):
--    alter table kitchen.ingredient add constraint ingredient_measure_unit_fkey
--      foreign key (measure_unit) references core.measure_unit (code);
--    alter table alpha.structure_node drop column title_embedding;
--    alter table kitchen.recipes drop column upstream_version_snapshot;
--    (os drops exigem antes tirar as colunas do Drizzle — ver o relatório do PR.)

-- ── 1. Unidade de medida ─────────────────────────────────────────────────────

update procurement.purchase_item p
   set purchase_measure_unit = m.code
  from (values ('kg', 'KG'), ('Kg', 'KG'), ('lt', 'LT'), ('UNIDADE', 'UN'), ('unidade', 'UN'), ('Unidade', 'UN')) as m (raw, code)
 where p.purchase_measure_unit = m.raw;

update kitchen.ingredient set measure_unit = null where btrim(measure_unit) = '';

update kitchen.ingredient_item set purchase_measure_unit = null where btrim(purchase_measure_unit) = '';

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'procurement.procurement_list_item'::regclass and conname = 'procurement_list_item_measure_unit_fkey') then
		alter table procurement.procurement_list_item
			add constraint procurement_list_item_measure_unit_fkey foreign key (measure_unit) references core.measure_unit (code);
	end if;
end $$;

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

-- ── 3. FKs faltando ──────────────────────────────────────────────────────────

update kitchen.recipes
   set base_recipe_id = null
 where id = '2f91fd72-fd2c-4dce-bd00-3c98d28199e0'
   and base_recipe_id = 'e7b23f6d-762c-4f60-8cb0-1999a01a8f4e'
   and not exists (select 1 from kitchen.recipes where id = 'e7b23f6d-762c-4f60-8cb0-1999a01a8f4e');

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

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'access_control.user_policy_attachment'::regclass and conname = 'user_policy_attachment_user_id_fkey') then
		alter table access_control.user_policy_attachment add constraint user_policy_attachment_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_thread'::regclass and conname = 'chat_thread_user_id_fkey') then
		alter table alpha.chat_thread add constraint chat_thread_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_message'::regclass and conname = 'chat_message_user_id_fkey') then
		alter table alpha.chat_message add constraint chat_message_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'alpha.chat_turn_usage'::regclass and conname = 'chat_turn_usage_user_id_fkey') then
		alter table alpha.chat_turn_usage add constraint chat_turn_usage_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.official_document'::regclass and conname = 'official_document_owner_id_fkey') then
		alter table documents.official_document add constraint official_document_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.chat_message'::regclass and conname = 'chat_message_owner_id_fkey') then
		alter table documents.chat_message add constraint chat_message_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.writer_profile'::regclass and conname = 'writer_profile_owner_id_fkey') then
		alter table documents.writer_profile add constraint writer_profile_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'documents.ai_generation'::regclass and conname = 'ai_generation_owner_id_fkey') then
		alter table documents.ai_generation add constraint ai_generation_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete restrict;
	end if;
end $$;

-- ── 4. nrOrdem ───────────────────────────────────────────────────────────────

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'core.user_military_data'::regclass and conname = 'user_military_data_nrOrdem_key') then
		alter table core.user_military_data add constraint "user_military_data_nrOrdem_key" unique ("nrOrdem");
	end if;
end $$;

-- O UNIQUE já indexa a coluna; o índice simples virou redundante.
drop index if exists core."user_military_data_nrOrdem_idx";

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
