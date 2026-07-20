-- Registro do REAL na produção (produzido vs planejado).
--
-- production_task só guardava status + timestamps: nenhum vestígio do que de
-- fato saiu da cozinha. Passa a registrar, por preparação do dia:
--   produced_quantity → porções efetivamente produzidas
--   leftover_quantity → sobras (porções) após o serviço
-- O desvio vs planned_portion_quantity (menu_items) e o motivo ficam legíveis
-- via notes (coluna já existente, agora exposta na UI do painel).

alter table kitchen.production_task
  add column produced_quantity numeric check (produced_quantity >= 0),
  add column leftover_quantity numeric check (leftover_quantity >= 0);
