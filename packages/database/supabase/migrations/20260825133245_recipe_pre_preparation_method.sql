-- Pré-preparo como campo próprio da ficha técnica.
--
-- O modelo oficial da SIA (`docs/examples/Modelo_FTP_SIA.pdf`, PARTE 03 — TÉCNICA DE
-- PREPARO) tem DOIS campos de texto: "Pré-preparo" (higienização, dessalgue, corte,
-- descongelamento, marinada — o que acontece ANTES do fogo) e "Modo de preparo" (a
-- cocção em si). A tabela só tinha o segundo, então a folha impressa já imprimia a linha
-- de pré-preparo em BRANCO, para preencher à mão — ver `RecipeTechnicalSheetPrint`.
--
-- Coluna nova, aditiva e nullable: ficha antiga continua válida sem ela. Não há backfill
-- possível nem desejável — separar o que hoje está amontoado num campo só é decisão de
-- quem escreveu a ficha, não de um regex.
--
-- Sem impacto na linhagem de versões: `saveRecipeEdit` insere a linha nova com todas as
-- colunas do formulário, e a coluna entra nesse insert junto das demais.

begin;

alter table kitchen.recipes
	add column if not exists pre_preparation_method text;

comment on column kitchen.recipes.pre_preparation_method is
	'Pré-preparo (PARTE 03 do modelo FTP/SIA): higienização, dessalgue, corte, descongelamento — o que antecede a cocção. `preparation_method` guarda a cocção em si.';

commit;
