-- ─── RENOMEAR: procurement_ata → procurement_list ────────────────────────────
--
-- Motivo: "ata" era confuso com "ATA de Registro de Preços" (procurement_arp).
-- procurement_list é o documento interno de planejamento de quantitativos.
--
-- Também remove total_value dos itens — valor derivado (qty × unit_price),
-- calculado no cliente para evitar dados redundantes e inconsistências.

-- 1. Renomear tabelas
ALTER TABLE sisub.procurement_ata RENAME TO procurement_list;
ALTER TABLE sisub.procurement_ata_kitchen RENAME TO procurement_list_kitchen;
ALTER TABLE sisub.procurement_ata_selection RENAME TO procurement_list_selection;
ALTER TABLE sisub.procurement_ata_item RENAME TO procurement_list_item;

-- 2. Renomear colunas FK para consistência com o novo nome
ALTER TABLE sisub.procurement_list_kitchen RENAME COLUMN ata_id TO list_id;
ALTER TABLE sisub.procurement_list_selection RENAME COLUMN ata_kitchen_id TO list_kitchen_id;
ALTER TABLE sisub.procurement_list_item RENAME COLUMN ata_id TO list_id;

-- 3. Remover coluna derivada (total_value = total_quantity × unit_price)
ALTER TABLE sisub.procurement_list_item DROP COLUMN IF EXISTS total_value;

-- 4. Índices de performance
CREATE INDEX IF NOT EXISTS idx_procurement_list_unit_status
  ON sisub.procurement_list(unit_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_list_item_list_id
  ON sisub.procurement_list_item(list_id);

CREATE INDEX IF NOT EXISTS idx_procurement_list_kitchen_list_id
  ON sisub.procurement_list_kitchen(list_id);
