-- Fork copy-on-write de preparações globais.
--
-- Ao salvar a edição de uma receita global a partir do contexto de uma cozinha, o
-- servidor procura um fork vivo daquela cozinha na mesma linhagem antes de decidir entre
-- versionar o fork existente e criar um novo. Essa busca entra no caminho de ESCRITA, e
-- sem índice varre a tabela inteira a cada save.
--
-- Parcial em `base_recipe_id IS NOT NULL`: linhas raiz (base nula) nunca são alvo dessa
-- busca, e mantê-las fora reduz o índice ao subconjunto de versões/forks.
create index if not exists recipes_kitchen_lineage_idx
	on kitchen.recipes (kitchen_id, base_recipe_id)
	where base_recipe_id is not null;

-- A dedup por família na listagem resolve a raiz por `base_recipe_id ?? id` e a
-- `listRecipeVersions` busca `id = raiz OR base_recipe_id = raiz`. Ambas leem a linhagem
-- inteira a partir da raiz.
create index if not exists recipes_base_recipe_idx
	on kitchen.recipes (base_recipe_id)
	where base_recipe_id is not null;
