-- Alergênicos do insumo, pelos grupos da RDC ANVISA 26/2015.
--
-- O cardápio impresso passa a poder listar os alergênicos de cada preparação. Até aqui o
-- insumo não tinha onde guardar isso: o único vestígio era `public.insumo.contem_gluten`,
-- do SISUBWEB, e ele NÃO serve de fonte — marca fécula de mandioca, fubá, iogurte e queijo
-- camembert como "contém glúten". Por isso esta migration não herda nada de lá.
--
-- `text[]` com vocabulário fechado, e não uma tabela de junção: são nove grupos fixos da
-- norma, lidos sempre junto do insumo. Lista vazia = nenhum alergênico marcado — que não é o
-- mesmo que "isento": a folha impressa diz isso ao leitor.
--
-- O vocabulário é espelhado em `ALLERGENS` (`@iefa/sisub-domain`) e conferido por
-- `allergens.sql-contract.test.ts`. Valor de domínio fica em português (vocabulário da norma).

alter table kitchen.ingredient
	add column if not exists allergens text[] not null default '{}';

alter table kitchen.ingredient
	drop constraint if exists ingredient_allergens_check,
	add constraint ingredient_allergens_check
		check (allergens <@ array['gluten', 'crustaceos', 'ovos', 'peixes', 'amendoim', 'soja', 'leite', 'castanhas', 'latex_natural']::text[]);

comment on column kitchen.ingredient.allergens is
	'Grupos de alergênicos da RDC ANVISA 26/2015 presentes no insumo. Vazio = nenhum marcado (não significa isento). Impresso no cardápio semanal.';
