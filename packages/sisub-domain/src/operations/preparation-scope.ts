/**
 * Escopo "preparações do SISUBWEB" dentro de `kitchen.ingredient`.
 *
 * O import legado trouxe o grupo de produto "Preparações" para dentro do catálogo de
 * insumos. Não são insumos: são preparações, e seus nomes colidem com os das receitas.
 *
 * A classificação é uma COLUNA — `kitchen.ingredient.preparation_group_id` — e os
 * grupos vivem em `kitchen.preparation_group`, fora da árvore de pastas dos insumos.
 * Antes disso o recorte era feito casando a descrição da pasta por regex, o que
 * desligava em silêncio se alguém renomeasse a pasta: os 1626 itens voltariam para o
 * catálogo sem erro nenhum. Agora é uma FK, e nada depende de texto.
 *
 * As linhas NÃO foram movidas para outra tabela. 90% delas têm dependência viva —
 * 1419 vínculos em `procurement.purchase_item_ingredient`, 766 SKUs em
 * `kitchen.ingredient_item` — porque boa parte dessas preparações é comprada pronta,
 * com CATMAT. Movê-las arrastaria o fluxo de compras e estoque junto.
 */

import { folderInKitchen, ingredientInKitchen, preparationGroupInKitchen } from "@iefa/database/drizzle/sisub"
import { isNotNull, isNull, type SQL, sql } from "drizzle-orm"

/** Insumo de verdade: sem grupo de preparação. */
export const ingredientOutsidePreparations: SQL = isNull(ingredientInKitchen.preparationGroupId)

/** Preparação herdada do SISUBWEB — a aba dedicada. */
export const ingredientInsidePreparations: SQL = isNotNull(ingredientInKitchen.preparationGroupId)

/**
 * Pasta de insumo de verdade.
 *
 * Depois da fase CONTRACT (migration 20260811170000) `kitchen.folder` só contém pastas
 * de insumo e este predicado não exclui nada. Ele existe por duas razões: durante a
 * janela entre EXPAND e CONTRACT as pastas antigas ainda estão lá, e um reimport do
 * SISUBWEB que volte a criá-las não reabriria o problema em silêncio — os ids foram
 * preservados em `preparation_group`.
 */
export const folderOutsidePreparations: SQL = sql`not exists (select 1 from ${preparationGroupInKitchen} pg where pg.id = ${folderInKitchen.id})`

/**
 * Escopo de leitura do catálogo de insumos.
 * - `exclude` (padrão): só insumos de verdade.
 * - `only`: só as preparações herdadas (aba dedicada).
 * - `include`: tudo, sem distinção (manutenção/diagnóstico).
 */
export type PreparationScope = "exclude" | "only" | "include"

/** Predicado do escopo para insumos, ou `undefined` quando não há o que filtrar. */
export function ingredientPreparationFilter(scope: PreparationScope | undefined): SQL | undefined {
	if (scope === "only") return ingredientInsidePreparations
	if (scope === "include") return undefined
	return ingredientOutsidePreparations
}
