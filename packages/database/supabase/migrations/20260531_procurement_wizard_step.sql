-- ─── WIZARD STEP: auto-save do wizard de nova ATA ────────────────────────────
--
-- Adiciona wizard_step em procurement_list para saber onde o usuário está
-- no wizard de preenchimento. NULL = ata completa (não em edição pelo wizard).
-- 1-4 = passo atual do wizard (cardápios, eventos, resumo, itens).
--
-- Permite mostrar rascunhos "em andamento" na lista com botão "Continuar",
-- e restaurar o estado do wizard após recarregamento de página.

ALTER TABLE sisub.procurement_list
  ADD COLUMN IF NOT EXISTS wizard_step smallint
    CHECK (wizard_step BETWEEN 1 AND 4);

COMMENT ON COLUMN sisub.procurement_list.wizard_step IS
  'Passo do wizard em andamento (1-4). NULL = ata fora do wizard (completa ou publicada).';
