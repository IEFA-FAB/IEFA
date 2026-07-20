-- Fluxo de exceções previsíveis (lanches de bordo, cafés de reunião).
-- Adiciona o terceiro template_type 'exception' e a recorrência mensal usada
-- no custeio da Ata de Registro de Preços.
--
-- A tabela menu_template foi movida de sisub -> kitchen em 20260624150000,
-- então o CHECK original (criado inline em 20260407_procurement_ata.sql como
-- menu_template_template_type_check) vive agora em kitchen.menu_template.
-- Esta migration apenas AMPLIA o conjunto permitido — não invalida linhas
-- existentes e não requer backfill.

-- 1. Amplia o CHECK de template_type para incluir 'exception'
alter table kitchen.menu_template
  drop constraint if exists menu_template_template_type_check;

alter table kitchen.menu_template
  add constraint menu_template_template_type_check
  check (template_type in ('weekly', 'event', 'exception'));

-- 2. Recorrência mensal esperada (só faz sentido para exception; nulo em
--    weekly/event). Nulo no custeio é tratado como 1 ocorrência.
alter table kitchen.menu_template
  add column if not exists expected_monthly_occurrences smallint;

alter table kitchen.menu_template
  drop constraint if exists menu_template_expected_monthly_occurrences_check;

alter table kitchen.menu_template
  add constraint menu_template_expected_monthly_occurrences_check
  check (expected_monthly_occurrences is null or expected_monthly_occurrences > 0);
