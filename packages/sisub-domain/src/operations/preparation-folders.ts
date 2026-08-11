/**
 * Escopo "Preparações" dentro do catálogo de insumos (herança do SISUBWEB).
 *
 * O import do sistema legado trouxe o grupo de produto "Preparações" para
 * `kitchen.folder` e seus itens para `kitchen.ingredient`. Eles NÃO são insumos:
 * são preparações, e seus nomes colidem com os das receitas — o que deixava a
 * árvore de insumos, o seletor de insumo da ficha técnica, o CSV e o denominador
 * da conferência ambíguos ("Arroz Carreteiro" aparecia como insumo E como receita).
 *
 * As linhas continuam existindo: receitas antigas apontam para elas por FK, então
 * apagá-las quebraria histórico. O que muda é o escopo de leitura — toda listagem
 * de insumo as exclui por padrão (`preparations: "exclude"`), e a aba dedicada as
 * lista sozinhas (`"only"`).
 *
 * A classificação é pela DESCRIÇÃO da pasta, não por uma coluna: é a mesma regra
 * que a busca rápida da árvore já usava no cliente, agora com uma única definição
 * e aplicada no servidor. Ocultar uma pasta oculta toda a subárvore dela.
 */

import { folderInKitchen, ingredientInKitchen } from "@iefa/database/drizzle/sisub"
import { type SQL, sql } from "drizzle-orm"

/**
 * Regex (POSIX, usada com `~*`) da pasta raiz do grupo legado. As classes trazem
 * maiúscula e minúscula dos acentuados explicitamente porque o case-folding de
 * `~*` sobre não-ASCII depende do collation do banco — `[çÇcC]` não depende.
 */
const PREPARATION_ROOT_PATTERN = "^[[:space:]]*[pP][rR][eE][pP][aA][rR][aA][çÇcC][õÕoO][eE][sS]"

/**
 * IDs da(s) pasta(s) "Preparações" MAIS toda a subárvore abaixo delas.
 *
 * CTE recursiva num subselect não-correlacionado: o Postgres materializa a lista
 * uma vez por query, em vez de reavaliar por linha como faria um `EXISTS`
 * correlacionado.
 */
const preparationFolderIds = sql`(
	with recursive prep_folder as (
		select ${folderInKitchen.id} as id
		from ${folderInKitchen}
		where btrim(${folderInKitchen.description}) ~* ${PREPARATION_ROOT_PATTERN}
		union all
		select child.id
		from ${folderInKitchen} child
		join prep_folder on child.parent_id = prep_folder.id
	)
	select id from prep_folder
)`

/**
 * Insumo FORA do grupo "Preparações". Insumo sem pasta (`folder_id is null`) é um
 * insumo comum e permanece — `not in` sozinho descartaria a linha, porque
 * `null not in (...)` é `null`, não `true`.
 */
export const ingredientOutsidePreparations: SQL = sql`(${ingredientInKitchen.folderId} is null or ${ingredientInKitchen.folderId} not in ${preparationFolderIds})`

/** Insumo DENTRO do grupo "Preparações" — a aba dedicada. */
export const ingredientInsidePreparations: SQL = sql`${ingredientInKitchen.folderId} in ${preparationFolderIds}`

/** Pasta fora do grupo "Preparações" (a própria raiz e as descendentes ficam de fora). */
export const folderOutsidePreparations: SQL = sql`${folderInKitchen.id} not in ${preparationFolderIds}`

/** Pasta dentro do grupo "Preparações" — inclui a raiz, para a aba mostrar o agrupamento. */
export const folderInsidePreparations: SQL = sql`${folderInKitchen.id} in ${preparationFolderIds}`

/**
 * Escopo de leitura do catálogo de insumos.
 * - `exclude` (padrão): só insumos de verdade.
 * - `only`: só o grupo legado "Preparações" (aba dedicada).
 * - `include`: tudo, sem distinção (manutenção/diagnóstico).
 */
export type PreparationScope = "exclude" | "only" | "include"

/** Predicado do escopo para insumos, ou `undefined` quando não há o que filtrar. */
export function ingredientPreparationFilter(scope: PreparationScope | undefined): SQL | undefined {
	if (scope === "only") return ingredientInsidePreparations
	if (scope === "include") return undefined
	return ingredientOutsidePreparations
}

/** Predicado do escopo para pastas, ou `undefined` quando não há o que filtrar. */
export function folderPreparationFilter(scope: PreparationScope | undefined): SQL | undefined {
	if (scope === "only") return folderInsidePreparations
	if (scope === "include") return undefined
	return folderOutsidePreparations
}
