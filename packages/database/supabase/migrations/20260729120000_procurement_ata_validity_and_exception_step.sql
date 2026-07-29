-- Ata de Registro de Preços: vigência explícita + passo próprio para exceções
--
-- Contexto. São TRÊS regimes de produção (kitchen.menu_template.template_type):
-- weekly (rotina), event (evento pontual) e exception (não-rotina previsível —
-- lanche de bordo, café de reunião). O wizard da ATA tratava event e exception
-- como um passo só, e `repetitions` acumulava três unidades diferentes na mesma
-- coluna: semanas (weekly), ocorrências no período (event) e — por causa do
-- pré-preenchimento com expected_monthly_occurrences — ocorrências por MÊS
-- (exception). Numa ARP de 12 meses isso subdimensionava a exceção em 12×.
--
-- 1. validity_months passa a ser o período da ata. A seleção de exceção deriva
--    suas repetições de expected_monthly_occurrences × validity_months, então
--    `repetitions` volta a ter um único significado em toda a tabela: quantas
--    vezes aquele cardápio é produzido dentro da ata.
-- 2. O wizard ganha um quinto passo (Cardápios → Eventos → Exceções → Resumo →
--    Itens); os rascunhos existentes têm os passos finais deslocados.

-- ── 1. Vigência da ata ────────────────────────────────────────────────────────

alter table procurement.procurement_list
  add column if not exists validity_months smallint;

comment on column procurement.procurement_list.validity_months is
  'Período de vigência da ata em meses. Multiplica as ocorrências mensais das seleções de exceção. Nulo em atas anteriores a esta migration (tratado como 1).';

alter table procurement.procurement_list
  drop constraint if exists procurement_list_validity_months_check;

alter table procurement.procurement_list
  add constraint procurement_list_validity_months_check
  check (validity_months is null or (validity_months > 0 and validity_months <= 120));

-- ── 2. Wizard de 4 para 5 passos ──────────────────────────────────────────────
-- Ordem importa: o CHECK antigo (<= 4) precisa cair ANTES do update que
-- promove os rascunhos parados em "Resumo"/"Itens" para as novas posições.

alter table procurement.procurement_list
  drop constraint if exists procurement_list_wizard_step_check;

-- 3 (Resumo) → 4 e 4 (Itens) → 5; 1 e 2 seguem apontando para os mesmos passos.
update procurement.procurement_list
  set wizard_step = wizard_step + 1
  where wizard_step >= 3;

alter table procurement.procurement_list
  add constraint procurement_list_wizard_step_check
  check (wizard_step >= 1 and wizard_step <= 5);
