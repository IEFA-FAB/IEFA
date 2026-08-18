/**
 * Escopo de catálogo dentro de `kitchen.folder`: gêneros de alimentação × itens auxiliares.
 *
 * O import do SISUBWEB pendurou os grupos de material NÃO alimentar (EPI, limpeza,
 * embalagem, copa e cozinha, gás, combustíveis) na mesma árvore de pastas dos gêneros.
 * São 168 itens que precisam continuar existindo — são comprados, estocados, e alguns
 * entram em preparação (copo descartável, palito, fósforo, álcool) — mas não são insumo
 * de alimentação e atrapalham quem monta ficha técnica.
 *
 * A classificação é a COLUNA `kitchen.folder.catalog_scope` (migration
 * 20260818120000), não um casamento de nome de pasta: renomear "Material de Limpeza"
 * não pode devolver 58 itens ao catálogo em silêncio. Mesma lição de
 * `preparation-scope.ts`, e as duas dimensões são independentes — preparação do
 * SISUBWEB não tem pasta, item auxiliar não tem grupo de preparação.
 *
 * O default é `include`: o recorte existe para as ABAS de /global/ingredients, não para
 * o seletor de insumo da ficha técnica nem para as tools de IA. Estreitar o default
 * esconderia as 29 linhas de `recipe_ingredients` que hoje apontam para item auxiliar.
 */

import { folderInKitchen, ingredientInKitchen } from "@iefa/database/drizzle/sisub"
import { eq, ne, type SQL, sql } from "drizzle-orm"

/** Valores válidos da coluna. Espelha o CHECK `folder_catalog_scope_check`. */
export const CATALOG_SCOPE_VALUES = ["alimentacao", "auxiliar"] as const
export type CatalogScopeValue = (typeof CATALOG_SCOPE_VALUES)[number]

/**
 * Escopo de leitura pedido por quem consulta:
 * - `include` (padrão): tudo, sem distinção.
 * - `exclude`: só gêneros de alimentação (aba "Insumos").
 * - `only`: só itens auxiliares (aba "Itens auxiliares").
 */
export type CatalogScope = "include" | "exclude" | "only"

/** Predicado para `kitchen.folder`, ou `undefined` quando não há o que filtrar. */
export function folderCatalogFilter(scope: CatalogScope | undefined): SQL | undefined {
	if (scope === "exclude") return ne(folderInKitchen.catalogScope, "auxiliar")
	if (scope === "only") return eq(folderInKitchen.catalogScope, "auxiliar")
	return undefined
}

/**
 * Predicado para `kitchen.ingredient`, derivado da pasta em que o insumo está.
 *
 * `not exists` cobre `folder_id IS NULL` de graça, e é a resposta certa: depois da fase
 * CONTRACT das preparações (20260811170000) um insumo sem pasta ou é preparação do
 * SISUBWEB — que já sai pelo filtro de `preparation-scope.ts` — ou nasceu fora de
 * qualquer pasta. Nos dois casos o lugar dele é o catálogo, não a aba auxiliar.
 */
export function ingredientCatalogFilter(scope: CatalogScope | undefined): SQL | undefined {
	if (scope === "exclude")
		return sql`not exists (select 1 from ${folderInKitchen} f where f.id = ${ingredientInKitchen.folderId} and f.catalog_scope = 'auxiliar')`
	if (scope === "only") return sql`exists (select 1 from ${folderInKitchen} f where f.id = ${ingredientInKitchen.folderId} and f.catalog_scope = 'auxiliar')`
	return undefined
}
