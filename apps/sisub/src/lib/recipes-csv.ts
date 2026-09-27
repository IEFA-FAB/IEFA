/**
 * CSV da listagem de preparações — o mesmo recorte que a tela mostra depois dos filtros
 * (origem, busca, plano semanal, revisão, excluídas), com as pastas recolhidas incluídas.
 *
 * A ficha técnica (ingredientes) fica de fora de propósito: o catálogo tem ~2.000 preparações
 * e a listagem com ficha passava de 10 MB (ver `listRecipeSummaries`). Quem precisa da ficha
 * de uma preparação abre a preparação.
 *
 * Função pura, para ter teste — o download fica em `downloadCsv`.
 */

import type { RecipeSummary } from "@iefa/sisub-domain"
import { csvDocument } from "@/lib/csv"
import { UNFILED_FOLDER_LABEL } from "@/lib/recipe-tree"

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
	recipes: readonly RecipeSummary[]
	folderNameById: ReadonlyMap<string, string>
	menuUsageIds: ReadonlySet<string>
	reviewedAtById: ReadonlyMap<string, string>
}

/** "2026-09-14T13:02:00Z" → "14/09/2026"; vazio quando não há data ou ela não é válida. */
function formatDate(iso: string | null | undefined): string {
	if (!iso) return ""
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export function buildRecipesCsv({ recipes, folderNameById, menuUsageIds, reviewedAtById }: RecipesCsvInput): string {
	const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
	// Pasta apagada do catálogo mas ainda referenciada cai em "Sem pasta", como na árvore.
	const folderOf = (recipe: RecipeSummary) => (recipe.folder_id ? folderNameById.get(recipe.folder_id) : undefined)

	// Mesma ordem da tela: pastas em ordem alfabética, "Sem pasta" por último, preparações A-Z.
	const sorted = [...recipes].sort((a, b) => {
		const folderA = folderOf(a)
		const folderB = folderOf(b)
		if (folderA === undefined && folderB !== undefined) return 1
		if (folderB === undefined && folderA !== undefined) return -1
		return collator.compare(folderA ?? "", folderB ?? "") || collator.compare(a.name, b.name)
	})

	const rows = sorted.map((recipe) => [
		folderOf(recipe) ?? UNFILED_FOLDER_LABEL,
		recipe.name,
		recipe.kitchen_id == null ? "Global" : "Local",
		recipe.version,
		recipe.portion_yield,
		recipe.preparation_time_minutes,
		recipe.rational_id,
		menuUsageIds.has(recipe.id) ? "Sim" : "Não",
		formatDate(reviewedAtById.get(recipe.id)),
		formatDate(recipe.deleted_at),
	])

	return csvDocument(RECIPES_CSV_HEADER, rows)
}
