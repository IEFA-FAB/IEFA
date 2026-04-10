-- Policy Rules
-- Regras de política para revisão de insumos (products) e preparações (recipes).
-- Usadas para gerar prompts de revisão assistida por IA que avaliam cada item
-- contra as diretivas da SDAB/FAB.

CREATE TABLE sisub.policy_rule (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target        text        NOT NULL CHECK (target IN ('product', 'recipe')),
  title         text        NOT NULL,
  description   text        NOT NULL,
  display_order integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX ON sisub.policy_rule (target, display_order) WHERE deleted_at IS NULL;

-- ============================================================================
-- Seed: Regras de Insumos (target = 'product')
-- ============================================================================

INSERT INTO sisub.policy_rule (target, title, description, display_order) VALUES
(
  'product',
  'Sem marca ou fabricante',
  'O insumo deve ser genérico e não conter nome de marca, fabricante ou fornecedor específico. Ex. correto: "arroz branco tipo 1". Ex. incorreto: "arroz Tio João tipo 1 grão polido" ou "leite Parmalat UHT integral".',
  1
),
(
  'product',
  'Sem especificação de embalagem',
  'O insumo não deve conter especificações de embalagem (tamanho, peso de embalagem, quantidade por caixa ou pacote). Essas são características do item de produto (product_item), não do insumo. Ex. incorreto: "arroz branco tipo 1 5kg", "óleo de soja 900ml".',
  2
),
(
  'product',
  'Sem duplicidade',
  'Não deve existir mais de um insumo cadastrado para o mesmo item genérico. Ao avaliar um insumo, considere todos os outros insumos listados neste prompt e identifique se há outro com descrição equivalente ou muito semelhante.',
  3
),
(
  'product',
  'Descrição clara e objetiva',
  'A descrição deve identificar o insumo de forma inequívoca usando terminologia técnica culinária ou nutricional padrão, sem ser excessivamente detalhada nem genérica demais. Deve ser suficiente para distingui-lo de outros insumos sem ambiguidade.',
  4
),
(
  'product',
  'Unidade de medida coerente',
  'A unidade de medida (measure_unit) deve ser coerente com o uso culinário do insumo: "kg" ou "g" para sólidos a granel, "L" ou "mL" para líquidos, "un" para itens contados individualmente (ovos, limões, laranjas, etc.).',
  5
),
(
  'product',
  'Fator de correção adequado',
  'O fator de correção (correction_factor) deve estar preenchido e ser maior que 1,0 quando o insumo passa por processo de descasque, limpeza ou aparamento antes do uso (ex.: batata, frango inteiro, peixe, laranja). Insumos já prontos para uso podem ter fator 1,0 ou nulo.',
  6
),
(
  'product',
  'Sem localização de unidade FAB',
  'O insumo não deve conter referência a localidade, organização militar, base aérea ou unidade da Força Aérea Brasileira em sua descrição. Ex. incorretos: "item da BASM", "produto do GAP-SP", "insumo da 1ª COMAR", "feijão do PAMA-GL". Insumos são globais e não pertencem a nenhuma unidade específica.',
  7
),
(
  'product',
  'Sem itens impróprios para rancho militar FAB',
  'O insumo não deve ser um item impróprio para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas (cerveja, cachaça, vinho, destilados), itens de uso recreativo, produtos não alimentares ou de higiene pessoal que não tenham função culinária.',
  8
);

-- ============================================================================
-- Seed: Regras de Preparações (target = 'recipe')
-- ============================================================================

INSERT INTO sisub.policy_rule (target, title, description, display_order) VALUES
(
  'recipe',
  'Nome único e descritivo',
  'A preparação deve ter um nome único e descritivo que identifique claramente o prato ou item produzido. Não deve ser genérico demais (ex.: "sopa", "carne", "legumes") nem repetir o nome de outra preparação já existente no sistema. Ao avaliar, considere todas as preparações listadas neste prompt.',
  1
),
(
  'recipe',
  'Método de preparo preenchido',
  'O campo preparation_method deve estar preenchido com as etapas de produção em linguagem técnica culinária adequada. Preparações com método de preparo ausente ou vazio estão incompletas e não devem ser usadas no planejamento de cardápio.',
  2
),
(
  'recipe',
  'Ao menos um ingrediente',
  'A preparação deve ter ao menos um ingrediente (insumo) associado. Preparações sem ingredientes estão incompletas, não permitem estimativa de custo nem planejamento de compras.',
  3
),
(
  'recipe',
  'Apenas insumos como ingredientes',
  'Os ingredientes devem referenciar apenas insumos genéricos (products), nunca itens de produto (product_items). Itens de produto são variantes de compra com marca, embalagem ou código de barras específicos e não devem aparecer como ingredientes de preparações.',
  4
),
(
  'recipe',
  'Rendimento de porções preenchido',
  'O campo portion_yield deve estar preenchido com o número de porções que a preparação produz a partir da receita base. É indispensável para o planejamento de cardápio, cálculo de quantidades e estimativa de custo por comensal.',
  5
),
(
  'recipe',
  'Tempo de preparo preenchido',
  'O campo preparation_time_minutes deve estar preenchido com o tempo estimado de preparo (em minutos). É necessário para a organização da produção diária e para evitar conflitos de horário na cozinha.',
  6
),
(
  'recipe',
  'Sem duplicidade',
  'Não deve existir mais de uma preparação para o mesmo prato ou item do cardápio. Ao avaliar, considere todas as preparações listadas neste prompt e identifique se há outra com nome equivalente ou muito semelhante.',
  7
),
(
  'recipe',
  'Sem itens impróprios para rancho militar FAB',
  'A preparação não deve conter ingredientes impróprios para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas como cerveja, cachaça, vinho ou qualquer destilado como ingrediente; ingredientes de uso recreativo; ou itens que não tenham função culinária em preparações de alimentação coletiva militar.',
  8
),
(
  'recipe',
  'Sem localização de unidade FAB',
  'O nome ou o método de preparo da preparação não deve conter referência a localidade, organização militar, base aérea ou unidade da Força Aérea Brasileira. Ex. incorretos: "receita da BASM", "prato típico do GAP-SP", "preparação da 1ª COMAR". Preparações globais pertencem ao catálogo da SDAB e não a nenhuma unidade específica.',
  9
);
