/**
 * CSV da listagem de preparações — o mesmo recorte que a tela mostra depois dos filtros
 * (origem, busca, plano semanal, revisão, excluídas), com as pastas recolhidas incluídas.
 *
 * As linhas saem dos nós de uma árvore montada por `buildRecipeTree` com tudo aberto: a
 * ordem, a direção (A-Z/Z-A), o agrupamento por pasta e o destino da preparação órfã são
 * os da tela, decididos num lugar só.
 *
 * A ficha técnica (ingredientes) fica de fora de propósito: o catálogo tem ~2.000 preparações
 * e a listagem com ficha passava de 10 MB (ver `listRecipeSummaries`). Quem precisa da ficha
 * de uma preparação abre a preparação.
 *
 * Função pura, para ter teste — o download fica em `downloadCsv`.
 */

import type { RecipeSummary } from "@iefa/sisub-domain"
import { type CsvValue, csvDocument } from "@/lib/csv"
import { formatShortDate } from "@/lib/flows/model"
import type { RecipeTreeNode } from "@/lib/recipe-tree"

export const RECIPES_CSV_HEADER = [
	"Pasta",
	"Preparação",
	"Origem",
	"Versão",
	"Rendimento (porções)",
	"Tempo de preparo (min)",
	"Código SISUBWEB",
	"Em plano semanal",
	"Revisada em",
	"Excluída em",
] as const

export interface RecipesCsvInput {
	/** Nós de uma árvore montada com todas as pastas abertas (`autoExpand`). */
	nodes: readonly RecipeTreeNode<RecipeSummary>[]
	menuUsageIds: ReadonlySet<string>
	reviewedAtById: ReadonlyMap<string, string>
}

export function buildRecipesCsv({ nodes, menuUsageIds, reviewedAtById }: RecipesCsvInput): string {
	const rows: CsvValue[][] = []
	let folderLabel = ""
	for (const node of nodes) {
		if (node.type === "folder") {
			folderLabel = node.label
			continue
		}
		const recipe = node.data
		rows.push([
			folderLabel,
			recipe.name,
			recipe.kitchen_id == null ? "Global" : "Local",
			recipe.version,
			recipe.portion_yield,
			recipe.preparation_time_minutes,
			recipe.rational_id,
			menuUsageIds.has(recipe.id) ? "Sim" : "Não",
			formatShortDate(reviewedAtById.get(recipe.id)),
			formatShortDate(recipe.deleted_at),
		])
	}
	return csvDocument(RECIPES_CSV_HEADER, rows)
}
