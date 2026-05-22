-- ─── PESQUISA DE PREÇOS: REGISTROS PENDENTES (ANTES DE SALVAR ATA) ───────────
--
-- Permite criar registros de auditoria de pesquisa de preços sem um ata_id,
-- para suportar o fluxo de nova ATA (pesquisa acontece antes do save).
-- O link ata_id / ata_item_id é preenchido no momento em que a ATA é criada.

-- 1. ata_id passa a ser nullable (registros pendentes de vínculo)
ALTER TABLE sisub.procurement_pesquisa_preco
  ALTER COLUMN ata_id DROP NOT NULL;

-- 2. Colunas do pipeline automatizado que não se aplicam ao fluxo manual da UI
ALTER TABLE sisub.procurement_pesquisa_preco
  ALTER COLUMN similarity_threshold DROP NOT NULL;

ALTER TABLE sisub.procurement_pesquisa_preco
  ALTER COLUMN period_months DROP NOT NULL;

-- 3. Índice para localizar registros pendentes (ata_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_pesquisa_preco_pending
  ON sisub.procurement_pesquisa_preco (ata_id)
  WHERE ata_id IS NULL;
