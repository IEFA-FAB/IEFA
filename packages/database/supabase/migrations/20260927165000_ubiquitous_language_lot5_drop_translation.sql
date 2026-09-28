-- Linguagem ubíqua do sisub, lote 5 — tarefa 5.5: saem os triggers que traduziam, na gravação, o
-- valor de domínio antigo para o do glossário.
--
-- O contract 20260927110000 criou `core.translate_legacy_domain_value()` e um trigger por coluna
-- para a janela entre aplicar o contract e o deploy do código dele (#507), que grava só o valor
-- novo. Conferido nos logs do Postgres (o `raise log` de cada tradução) em 2026-09-27: depois do
-- deploy do #507, as únicas traduções vieram do caso de integração que grava o valor antigo de
-- propósito (`domain-values.operations.test.ts`, em transação desfeita), quatro por execução. A
-- partir daqui o CHECK recusa o valor antigo, como recusa qualquer valor fora do vocabulário.

drop trigger contract_designation_translate_legacy_role on procurement.contract_designation;
drop trigger inventory_count_translate_legacy_type on inventory.inventory_count;
drop trigger policy_rule_translate_legacy_target on procurement.policy_rule;
drop trigger menu_template_translate_legacy_type on kitchen.menu_template;
drop trigger menu_items_translate_legacy_origin_type on kitchen.menu_items;

drop function core.translate_legacy_domain_value();
