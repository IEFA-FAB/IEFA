-- Migration: drop FKs de referências cruzadas com dados externos inconsistentes
-- Motivo: a API Compras retorna dados onde filhos referenciam pais que não
-- existem nos endpoints pai. FKs não podem ser garantidos com dados externos.
-- Os índices existentes são suficientes para joins.
-- Aplicar via Supabase Dashboard > SQL Editor

-- Material: característica → item (item pode não existir no endpoint de itens)
ALTER TABLE sisub.compras_material_caracteristica
  DROP CONSTRAINT IF EXISTS compras_material_caracteristica_codigo_item_fkey;

-- Material: natureza_despesa → pdm
ALTER TABLE sisub.compras_material_natureza_despesa
  DROP CONSTRAINT IF EXISTS compras_material_natureza_despesa_codigo_pdm_fkey;

-- Material: unidade_fornecimento → pdm
ALTER TABLE sisub.compras_material_unidade_fornecimento
  DROP CONSTRAINT IF EXISTS compras_material_unidade_fornecimento_codigo_pdm_fkey;

-- Serviço: item → subclasse (subclasse pode não existir)
ALTER TABLE sisub.compras_servico_item
  DROP CONSTRAINT IF EXISTS compras_servico_item_codigo_subclasse_fkey;

-- Serviço: natureza_despesa → servico_item
ALTER TABLE sisub.compras_servico_natureza_despesa
  DROP CONSTRAINT IF EXISTS compras_servico_natureza_despesa_codigo_servico_fkey;

-- Serviço: unidade_medida → servico_item
ALTER TABLE sisub.compras_servico_unidade_medida
  DROP CONSTRAINT IF EXISTS compras_servico_unidade_medida_codigo_servico_fkey;
