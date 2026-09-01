-- ============================================================================
-- Promoção do `core` a núcleo real
-- ============================================================================
-- `core` foi criado no split de domínios do sisub e virou, na prática, "o
-- schema onde ficou o que não era claramente de um módulo". Hoje ele mistura
-- duas coisas de naturezas diferentes:
--
--   • o que é da FORÇA e existe independentemente de subsistência —
--     core.units (OM, com UASG, endereço e hierarquia), core.user_data,
--     core.user_military_data, core.measure_unit e agora core.item;
--   • o que é de SUBSISTÊNCIA — cozinha, refeitório, rancho, avaliação de
--     refeição, chat dos módulos, lookups da migração do SISUBWEB.
--
-- A consequência do amálgama já é visível no banco: nenhum outro app
-- consegue referenciar o núcleo (as 57 FKs que apontam para `core` vêm todas
-- de schemas do sisub), então os outros o reimplementaram —
-- `forms.om_option` tem 29 linhas contra as 31 de `core.units`, e
-- `journal.user_profiles` tem 1.418 contra as 1.421 de `core.user_data`.
-- Duas listas de OM e dois cadastros de pessoa, mantidos à mão.
--
-- Esta migration separa as duas naturezas. É fase EXPAND: cada tabela movida
-- deixa uma VIEW de compatibilidade no lugar antigo, auto-atualizável, para
-- que nenhum consumidor via PostgREST precise mudar agora. As views saem no
-- contract, uma a uma, conforme os leitores migram.
--
-- O dado não se move: ALTER TABLE ... SET SCHEMA preserva FKs, índices,
-- constraints, triggers e policies. Verificado antes de escrever: nenhuma
-- função e nenhuma view do banco cita essas tabelas por nome qualificado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Subsistência sai de core → kitchen
-- ----------------------------------------------------------------------------
-- `workforce_*` é o caso ambíguo, e vai junto: a matriz de efetivo é hoje
-- respondida POR RANCHO (workforce_submission tem FK para core.rancho), logo
-- o grão é de subsistência. O CONCEITO — efetivo por OM, por quadro, em série
-- histórica — é da Força e é candidato ao núcleo. Promover depois é barato;
-- despromover, não. Fica em kitchen até existir o segundo consumidor.
alter table core.kitchen                  set schema kitchen;
alter table core.mess_halls               set schema kitchen;
alter table core.rancho                   set schema kitchen;
alter table core.opinions                 set schema kitchen;
alter table core.analytics_chat_session   set schema kitchen;
alter table core.analytics_chat_message   set schema kitchen;
alter table core.module_chat_session      set schema kitchen;
alter table core.module_chat_message      set schema kitchen;
alter table core.training_reset_log       set schema kitchen;
alter table core.changelog                set schema kitchen;
alter table core.super_admin_controller   set schema kitchen;
alter table core.workforce_category       set schema kitchen;
alter table core.workforce_survey         set schema kitchen;
alter table core.workforce_submission     set schema kitchen;
alter table core.workforce_headcount      set schema kitchen;
alter table core.workforce_note           set schema kitchen;
alter table core.migration_folder_lookup  set schema kitchen;
alter table core.migration_product_lookup set schema kitchen;
alter table core.migration_recipe_lookup  set schema kitchen;
alter table core.migration_nutrient_lookup set schema kitchen;

comment on table kitchen.kitchen is
  'Ponto de produção da subsistência. Saiu de core na promoção do núcleo: cozinha é de subsistência, OM não. O nome kitchen.kitchen é feio de propósito — renomear para `site` mexeria em 26 FKs e em todo .from("kitchen") do PostgREST, e é mudança de nome, não de modelo.';

-- ----------------------------------------------------------------------------
-- 2. Compatibilidade: views auto-atualizáveis no lugar antigo
-- ----------------------------------------------------------------------------
-- `select * from` uma única tabela, sem expressão, junção ou agregação: o
-- Postgres trata como auto-atualizável, então SELECT/INSERT/UPDATE/DELETE via
-- PostgREST continuam funcionando exatamente como antes.
--
-- LIMITE CONHECIDO: ON CONFLICT não funciona em view. Nenhum caminho de
-- escrita atual usa upsert nestas tabelas — o Drizzle, que é quem faz upsert,
-- passa a apontar direto para a tabela real (packages/database/drizzle).
-- Escrita nova deve mirar `kitchen.*`, nunca estas views.
do $$
declare
  t text;
begin
  foreach t in array array[
    'kitchen', 'mess_halls', 'rancho', 'opinions',
    'analytics_chat_session', 'analytics_chat_message',
    'module_chat_session', 'module_chat_message',
    'training_reset_log', 'changelog', 'super_admin_controller',
    'workforce_category', 'workforce_survey', 'workforce_submission',
    'workforce_headcount', 'workforce_note',
    'migration_folder_lookup', 'migration_product_lookup',
    'migration_recipe_lookup', 'migration_nutrient_lookup'
  ]
  loop
    execute format(
      'create view core.%I with (security_invoker = true) as select * from kitchen.%I', t, t);
    execute format(
      'comment on view core.%I is %L', t,
      'Compatibilidade da promoção do núcleo (20260901120400). A tabela vive em kitchen.' || t ||
      '. Esta view sai no contract — escrita nova deve mirar a tabela.');
    execute format(
      'grant select, insert, update, delete on core.%I to authenticated', t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Dívida registrada, não resolvida
-- ----------------------------------------------------------------------------
-- core.user_data.mess_hall_id aponta para kitchen.mess_halls: o núcleo passou
-- a depender do domínio, que é a direção errada. A FK segue a tabela e
-- continua íntegra, mas isso é wart, não desenho — "qual refeitório este
-- usuário frequenta" é preferência de subsistência e pertence a um perfil do
-- lado do kitchen, não ao cadastro de pessoa da Força.
--
-- Não é resolvido aqui de propósito: mover a coluna significa criar a tabela
-- de perfil, migrar 1.421 linhas e reescrever os leitores, e isso não tem
-- relação com acondicionamento de insumo. Fica explícito para não virar
-- decisão implícita.
comment on column core.user_data.mess_hall_id is
  'DÍVIDA: núcleo apontando para domínio. Deve migrar para um perfil de subsistência do lado kitchen — ver 20260901120400_core_promotion.sql.';

-- ----------------------------------------------------------------------------
-- 4. O que fica no núcleo
-- ----------------------------------------------------------------------------
comment on schema core is
  'Núcleo compartilhado: identidade de item (item), organização militar (units), pessoa (user_data, user_military_data) e unidades de medida (measure_unit). Nada aqui pode depender de subsistência. Tabela nova em core precisa passar no teste: outro app da suíte usaria isto?';
comment on schema kitchen is
  'Domínio de subsistência — a linha de produção de alimentação. Rendimento, fator de correção, nutrientes, ficha técnica, cozinha, refeitório e rancho. Não é catálogo genérico: catálogo genérico é core.item.';
