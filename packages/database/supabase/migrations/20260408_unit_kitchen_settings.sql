-- ─── DADOS DE LICITAÇÃO E ENDEREÇO ───────────────────────────────────────────
--
-- Adiciona campos necessários para geração de ATAs de Registro de Preços:
--   • units: UASG (código ComprasNet) + endereço completo
--   • kitchen: endereço de entrega dos suprimentos

-- ─── UNIDADE (units) ─────────────────────────────────────────────────────────

ALTER TABLE sisub.units
  -- Código UASG no ComprasNet (6 dígitos, ex: '160074')
  ADD COLUMN IF NOT EXISTS uasg                text,
  -- Endereço completo da unidade
  ADD COLUMN IF NOT EXISTS address_logradouro  text,
  ADD COLUMN IF NOT EXISTS address_numero      text,
  ADD COLUMN IF NOT EXISTS address_complemento text,
  ADD COLUMN IF NOT EXISTS address_bairro      text,
  ADD COLUMN IF NOT EXISTS address_municipio   text,
  ADD COLUMN IF NOT EXISTS address_uf          text,
  ADD COLUMN IF NOT EXISTS address_cep         text;

-- ─── COZINHA (kitchen) ───────────────────────────────────────────────────────

ALTER TABLE sisub.kitchen
  -- Endereço do local de entrega dos suprimentos da cozinha
  ADD COLUMN IF NOT EXISTS address_logradouro  text,
  ADD COLUMN IF NOT EXISTS address_numero      text,
  ADD COLUMN IF NOT EXISTS address_complemento text,
  ADD COLUMN IF NOT EXISTS address_bairro      text,
  ADD COLUMN IF NOT EXISTS address_municipio   text,
  ADD COLUMN IF NOT EXISTS address_uf          text,
  ADD COLUMN IF NOT EXISTS address_cep         text;
