-- Migration: drop FKs de referências cruzadas com dados externos inconsistentes (v2)
-- Motivo: API Compras retorna filhos que referenciam pais inexistentes nos
-- endpoints pai. Integridade referencial não pode ser garantida com dados externos.
-- Os índices existentes são suficientes para joins.

-- Material: item → pdm
ALTER TABLE sisub.compras_material_item
  DROP CONSTRAINT IF EXISTS compras_material_item_codigo_pdm_fkey;

-- Material: natureza_despesa → pdm
ALTER TABLE sisub.compras_material_natureza_despesa
  DROP CONSTRAINT IF EXISTS compras_material_natureza_despesa_codigo_pdm_fkey;

-- Material: unidade_fornecimento → pdm
ALTER TABLE sisub.compras_material_unidade_fornecimento
  DROP CONSTRAINT IF EXISTS compras_material_unidade_fornecimento_codigo_pdm_fkey;

-- Material: caracteristica → item
ALTER TABLE sisub.compras_material_caracteristica
  DROP CONSTRAINT IF EXISTS compras_material_caracteristica_codigo_item_fkey;

-- Serviço: subclasse → classe
ALTER TABLE sisub.compras_servico_subclasse
  DROP CONSTRAINT IF EXISTS compras_servico_subclasse_codigo_classe_fkey;

-- Serviço: item → subclasse
ALTER TABLE sisub.compras_servico_item
  DROP CONSTRAINT IF EXISTS compras_servico_item_codigo_subclasse_fkey;

-- Serviço: unidade_medida → servico_item
ALTER TABLE sisub.compras_servico_unidade_medida
  DROP CONSTRAINT IF EXISTS compras_servico_unidade_medida_codigo_servico_fkey;

-- Serviço: natureza_despesa → servico_item
ALTER TABLE sisub.compras_servico_natureza_despesa
  DROP CONSTRAINT IF EXISTS compras_servico_natureza_despesa_codigo_servico_fkey;
