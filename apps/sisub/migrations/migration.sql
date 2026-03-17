-- Criar tabelas de mapeamento para rastrear IDs antigos → novos
CREATE TABLE IF NOT EXISTS sisub.migration_folder_lookup (
  legacy_id_grupo_produto INTEGER PRIMARY KEY,
  new_folder_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sisub.migration_product_lookup (
  legacy_id_insumo BIGINT PRIMARY KEY,
  new_product_id UUID NOT NULL UNIQUE,
  legacy_descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sisub.migration_recipe_lookup (
  legacy_id_preparacao BIGINT PRIMARY KEY,
  new_recipe_id UUID NOT NULL UNIQUE,
  legacy_rendimento NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_migration_product_lookup_new_id 
  ON sisub.migration_product_lookup(new_product_id);
  
CREATE INDEX IF NOT EXISTS idx_migration_recipe_lookup_new_id 
  ON sisub.migration_recipe_lookup(new_recipe_id);

  -- Verificar se tabelas foram criadas
SELECT 
  table_name, 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'sisub') as colunas
FROM information_schema.tables t
WHERE table_schema = 'sisub' 
  AND table_name LIKE 'migration_%'
ORDER BY table_name;

-- Inserir folders únicos baseados em grupos de produtos
WITH unique_grupos AS (
  SELECT DISTINCT id_grupo_produto
  FROM public.insumo
  WHERE id_grupo_produto IS NOT NULL
)
INSERT INTO sisub.folder (id, parent_id, created_at)
SELECT 
  gen_random_uuid(),
  NULL,
  NOW()
FROM unique_grupos;

-- Mapear IDs antigos para novos (via timestamp de criação)
WITH numbered_legacy AS (
  SELECT DISTINCT 
    id_grupo_produto,
    ROW_NUMBER() OVER (ORDER BY id_grupo_produto) as rn
  FROM public.insumo
  WHERE id_grupo_produto IS NOT NULL
),
numbered_new AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
  FROM sisub.folder
  WHERE created_at > (NOW() - interval '5 minutes')
)
INSERT INTO sisub.migration_folder_lookup (legacy_id_grupo_produto, new_folder_id)
SELECT 
  nl.id_grupo_produto,
  nn.id
FROM numbered_legacy nl
JOIN numbered_new nn ON nn.rn = nl.rn;

-- Verificar mapeamento de folders
SELECT 
  COUNT(*) as folders_criados,
  (SELECT COUNT(DISTINCT id_grupo_produto) FROM public.insumo WHERE id_grupo_produto IS NOT NULL) as grupos_esperados
FROM sisub.migration_folder_lookup;


-- Inserir produtos baseados nos insumos
INSERT INTO sisub.product (
  id,
  description,
  folder_id,
  measure_unit,
  correction_factor,
  created_at
)
SELECT 
  gen_random_uuid(),
  i.descricao,
  COALESCE(fl.new_folder_id, (SELECT id FROM sisub.folder ORDER BY created_at LIMIT 1)), -- fallback para folder default
  COALESCE(um.abreviacao_unidade_medida, 'UN'),
  COALESCE(i.fator_correcao, 1.0),
  NOW()
FROM public.insumo i
LEFT JOIN sisub.migration_folder_lookup fl ON fl.legacy_id_grupo_produto = i.id_grupo_produto
LEFT JOIN public.unidade_medida um ON um.id_unidade_medida = i.id_unidade_medida
WHERE i.descricao IS NOT NULL;

-- Mapear insumos → products
INSERT INTO sisub.migration_product_lookup (legacy_id_insumo, new_product_id, legacy_descricao)
SELECT 
  i.id_insumo,
  p.id,
  i.descricao
FROM public.insumo i
JOIN sisub.product p ON p.description = i.descricao
WHERE p.created_at > (NOW() - interval '10 minutes');

-- Verificar produtos migrados
SELECT 
  (SELECT COUNT(*) FROM sisub.product WHERE created_at > NOW() - interval '15 minutes') as products_criados,
  (SELECT COUNT(*) FROM public.insumo WHERE descricao IS NOT NULL) as insumos_esperados,
  (SELECT COUNT(*) FROM sisub.migration_product_lookup) as mapeados;

  -- Inserir itens de produto específicos
INSERT INTO sisub.product_item (
  id,
  description,
  product_id,
  barcode,
  purchase_measure_unit,
  unit_content_quantity,
  created_at
)
SELECT
  gen_random_uuid(),
  COALESCE(ip.item_produto, 'Item #' || ip.id_item_produto),
  pl.new_product_id,
  ip.codigo_barras,
  e.embalagem,
  e.fator_multiplicativo,
  NOW()
FROM public.item_produto ip
LEFT JOIN sisub.migration_product_lookup pl ON pl.legacy_id_insumo = ip.id_produto
LEFT JOIN public.embalagem e ON e.id_embalagem = ip.id_embalagem
WHERE pl.new_product_id IS NOT NULL; -- apenas itens com product válido

-- Inserir receitas baseadas em preparacao_base
INSERT INTO sisub.recipes (
  id,
  name,
  preparation_method,
  portion_yield,
  kitchen_id,
  version,
  base_recipe_id,
  cooking_factor,
  preparation_time_minutes,
  created_at
)
SELECT
  gen_random_uuid(),
  -- Tentar buscar nome real do insumo_original, senão usar ID
  COALESCE(
    (SELECT io.descricao 
     FROM public.insumo_original io 
     WHERE io.id_insumo = pb.id_preparacao 
     LIMIT 1),
    (SELECT i.descricao 
     FROM public.insumo i 
     WHERE i.id_insumo = pb.id_preparacao 
     LIMIT 1),
    'Receita Legada #' || pb.id_preparacao
  ),
  -- Consolidar metadados no modo de preparo
  CONCAT_WS(E'\n\n',
    NULLIF(TRIM(pb.modo_preparo), ''),
    CASE WHEN NULLIF(TRIM(pb.equipamentos_necessarios), '') IS NOT NULL 
      THEN '🔧 Equipamentos: ' || pb.equipamentos_necessarios 
      ELSE NULL END,
    CASE WHEN NULLIF(TRIM(pb.observacoes), '') IS NOT NULL 
      THEN '📝 Observações: ' || pb.observacoes 
      ELSE NULL END,
    CASE WHEN NULLIF(TRIM(pb.sugestoes_acompanhamento), '') IS NOT NULL 
      THEN '🍽️ Sugestões: ' || pb.sugestoes_acompanhamento 
      ELSE NULL END,
    CASE WHEN pb.modo_convencional = true 
      THEN '✓ Modo Convencional' 
      ELSE NULL END,
    CASE WHEN pb.forno_combinado = true 
      THEN '✓ Forno Combinado' 
      ELSE NULL END
  ),
  COALESCE(pb.rendimento, 1), -- rendimento padrão = 1
  NULL, -- kitchen_id = global
  1, -- versão inicial
  NULL, -- sem receita base
  1.0, -- cooking_factor padrão
  NULL, -- tempo de preparo não disponível no schema antigo
  NOW()
FROM public.preparacao_base pb
WHERE pb.id_preparacao IS NOT NULL;

-- PASSO 2.2 CORRIGIDO: Popular Lookup de Recipes
-- Mapear preparacao → recipes usando ordem de criação
WITH numbered_legacy AS (
  SELECT 
    id_preparacao,
    rendimento,
    ROW_NUMBER() OVER (ORDER BY id_preparacao) as rn
  FROM public.preparacao_base
),
numbered_new AS (
  SELECT 
    id,
    name,
    portion_yield,
    ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
  FROM sisub.recipes
  WHERE created_at > (NOW() - interval '1 hour') -- ajustar se necessário
)
INSERT INTO sisub.migration_recipe_lookup (
  legacy_id_preparacao, 
  new_recipe_id, 
  legacy_rendimento
)
SELECT 
  nl.id_preparacao,
  nn.id,
  nl.rendimento
FROM numbered_legacy nl
JOIN numbered_new nn ON nn.rn = nl.rn;

-- Verificar se o mapeamento funcionou
SELECT 
  (SELECT COUNT(*) FROM sisub.migration_recipe_lookup) as mapeadas,
  (SELECT COUNT(*) FROM public.preparacao_base) as esperadas,
  (SELECT COUNT(*) FROM sisub.recipes WHERE created_at > NOW() - interval '1 hour') as recipes_criadas;

  -- Inserir ingredientes das receitas
INSERT INTO sisub.recipe_ingredients (
  id,
  recipe_id,
  product_id,
  net_quantity,
  is_optional,
  priority_order,
  created_at
)
SELECT
  gen_random_uuid(),
  rl.new_recipe_id,
  pl.new_product_id,
  ip.quantidadeliquida,
  FALSE,
  NULL,
  NOW()
FROM public.ingrediente_preparacao ip
JOIN sisub.migration_recipe_lookup rl ON rl.legacy_id_preparacao = ip.id_preparacao
JOIN sisub.migration_product_lookup pl ON pl.legacy_id_insumo = ip.id_produto
WHERE rl.new_recipe_id IS NOT NULL
  AND pl.new_product_id IS NOT NULL
  AND ip.quantidadeliquida > 0;

  -- Verificar ingredientes migrados
SELECT 
  (SELECT COUNT(*) FROM sisub.recipe_ingredients WHERE created_at > NOW() - interval '1 hour') as ingredients_criados,
  (SELECT COUNT(*) FROM public.ingrediente_preparacao WHERE quantidadeliquida > 0) as ingredients_esperados,
  (SELECT COUNT(*) FROM sisub.recipes r WHERE NOT EXISTS (
    SELECT 1 FROM sisub.recipe_ingredients ri WHERE ri.recipe_id = r.id
  ) AND r.created_at > NOW() - interval '1 hour') as recipes_sem_ingredientes;


  -- Inserir substituições de ingredientes
INSERT INTO sisub.recipe_ingredient_alternatives (
  id,
  recipe_ingredient_id,
  product_id,
  net_quantity,
  priority_order,
  created_at
)
SELECT
  gen_random_uuid(),
  ri.id,
  pl_sub.new_product_id,
  COALESCE(ipo.quantidade_substituto, ipo.quantidadeliquida),
  1,
  NOW()
FROM public.ingrediente_preparacao_original ipo
JOIN sisub.migration_recipe_lookup rl ON rl.legacy_id_preparacao = ipo.id_preparacao
JOIN sisub.migration_product_lookup pl_orig ON pl_orig.legacy_id_insumo = ipo.id_produto
JOIN sisub.migration_product_lookup pl_sub ON pl_sub.legacy_id_insumo = ipo.id_produto_substituto
JOIN sisub.recipe_ingredients ri ON ri.recipe_id = rl.new_recipe_id AND ri.product_id = pl_orig.new_product_id
WHERE ipo.id_produto_substituto IS NOT NULL
  AND pl_sub.new_product_id IS NOT NULL
  AND rl.new_recipe_id IS NOT NULL;


-- Verificar alternativas criadas
SELECT 
  (SELECT COUNT(*) FROM sisub.recipe_ingredient_alternatives WHERE created_at > NOW() - interval '2 hours') as alternatives_criadas,
  (SELECT COUNT(*) FROM public.ingrediente_preparacao_original WHERE id_produto_substituto IS NOT NULL) as substitutos_esperados;


-- Resumo completo da migração
SELECT 
  'Folders' as entidade,
  (SELECT COUNT(*) FROM sisub.folder WHERE created_at > NOW() - interval '24 hours') as migrados,
  (SELECT COUNT(DISTINCT id_grupo_produto) FROM public.insumo WHERE id_grupo_produto IS NOT NULL) as esperados
UNION ALL
SELECT 
  'Products',
  (SELECT COUNT(*) FROM sisub.product WHERE created_at > NOW() - interval '24 hours'),
  (SELECT COUNT(*) FROM public.insumo WHERE descricao IS NOT NULL)
UNION ALL
SELECT 
  'Product Items',
  (SELECT COUNT(*) FROM sisub.product_item WHERE created_at > NOW() - interval '24 hours'),
  (SELECT COUNT(*) FROM public.item_produto)
UNION ALL
SELECT 
  'Recipes',
  (SELECT COUNT(*) FROM sisub.recipes WHERE created_at > NOW() - interval '24 hours'),
  (SELECT COUNT(*) FROM public.preparacao_base)
UNION ALL
SELECT 
  'Recipe Ingredients',
  (SELECT COUNT(*) FROM sisub.recipe_ingredients WHERE created_at > NOW() - interval '24 hours'),
  (SELECT COUNT(*) FROM public.ingrediente_preparacao WHERE quantidadeliquida > 0)
UNION ALL
SELECT 
  'Alternatives',
  (SELECT COUNT(*) FROM sisub.recipe_ingredient_alternatives WHERE created_at > NOW() - interval '24 hours'),
  (SELECT COUNT(*) FROM public.ingrediente_preparacao_original WHERE id_produto_substituto IS NOT NULL);



-- Verificar integridade de foreign keys
SELECT 
  'Products sem Folder' as problema,
  COUNT(*) as total
FROM sisub.product p
LEFT JOIN sisub.folder f ON f.id = p.folder_id
WHERE p.created_at > NOW() - interval '24 hours'
  AND p.folder_id IS NOT NULL
  AND f.id IS NULL
UNION ALL
SELECT 
  'Recipe Ingredients sem Recipe',
  COUNT(*)
FROM sisub.recipe_ingredients ri
LEFT JOIN sisub.recipes r ON r.id = ri.recipe_id
WHERE ri.created_at > NOW() - interval '24 hours'
  AND r.id IS NULL
UNION ALL
SELECT 
  'Recipe Ingredients sem Product',
  COUNT(*)
FROM sisub.recipe_ingredients ri
LEFT JOIN sisub.product p ON p.id = ri.product_id
WHERE ri.created_at > NOW() - interval '24 hours'
  AND p.id IS NULL
UNION ALL
SELECT 
  'Alternatives sem Recipe Ingredient',
  COUNT(*)
FROM sisub.recipe_ingredient_alternatives ria
LEFT JOIN sisub.recipe_ingredients ri ON ri.id = ria.recipe_ingredient_id
WHERE ria.created_at > NOW() - interval '24 hours'
  AND ri.id IS NULL;


-- Análise de qualidade dos dados migrados
SELECT 
  'Receitas sem ingredientes' as metrica,
  COUNT(*) as valor
FROM sisub.recipes r
WHERE r.created_at > NOW() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM sisub.recipe_ingredients ri WHERE ri.recipe_id = r.id
  )
UNION ALL
SELECT 
  'Receitas com 1 ingrediente',
  COUNT(*)
FROM (
  SELECT r.id
  FROM sisub.recipes r
  WHERE r.created_at > NOW() - interval '24 hours'
  GROUP BY r.id
  HAVING COUNT((SELECT COUNT(*) FROM sisub.recipe_ingredients ri WHERE ri.recipe_id = r.id)) = 1
) sub
UNION ALL
SELECT 
  'Produtos sem description',
  COUNT(*)
FROM sisub.product
WHERE created_at > NOW() - interval '24 hours'
  AND (description IS NULL OR TRIM(description) = '')
UNION ALL
SELECT 
  'Product Items sem barcode',
  COUNT(*)
FROM sisub.product_item
WHERE created_at > NOW() - interval '24 hours'
  AND (barcode IS NULL OR TRIM(barcode) = '');


-- Marcar migração como concluída
COMMENT ON TABLE sisub.migration_folder_lookup IS 
  'Migração concluída em 14/01/2026 21:20:00 - NÃO DELETE (necessário para auditoria)';
COMMENT ON TABLE sisub.migration_product_lookup IS 
  'Migração concluída em 14/01/2026 21:20:00 - NÃO DELETE (necessário para auditoria)';
COMMENT ON TABLE sisub.migration_recipe_lookup IS 
  'Migração concluída em 14/01/2026 21:20:00 - NÃO DELETE (necessário para auditoria)';