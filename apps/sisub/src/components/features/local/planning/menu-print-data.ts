import type { PrintScope } from "@/components/features/local/planning/MenuPrintParts"
import type { PreparationSource } from "@/lib/cardapio-print"
import { describeRecipeVersion, type OutdatedRecipe } from "@/lib/recipe-versions"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * Derivações comuns às folhas impressas de cardápio (semanal, evento e apoio), fora dos
 * componentes para serem testáveis.
 */

type TemplateItem = MenuTemplateWithItems["items"][number]

/** Cozinha do escopo; `null` no catálogo global. */
export function scopeKitchenId(scope: PrintScope): number | null {
	return scope.kind === "kitchen" ? scope.kitchenId : null
}

/**
 * Fichas distintas (por origem) dos itens, na ordem em que aparecem; a primeira ocorrência de cada
 * origem decide. `buildPreparationEntries` decide depois, pelas opções, o que cada uma mostra.
 * Não filtra por preparo aqui: o porquê está no chamador do semanal.
 */
export function collectPreparationSources(
	items: readonly Pick<TemplateItem, "recipe_origin">[],
	outdatedById: ReadonlyMap<string, OutdatedRecipe>
): PreparationSource[] {
	const prepMap = new Map<string, PreparationSource>()
	for (const item of items) {
		const r = item.recipe_origin
		if (!r || prepMap.has(r.id)) continue
		prepMap.set(r.id, {
			id: r.id,
			name: r.name?.trim() || "Preparação sem nome",
			version: describeRecipeVersion(r.version ?? 1, outdatedById.get(r.id)),
			prePreparation: r.pre_preparation_method?.trim() || null,
			method: r.preparation_method?.trim() || null,
		})
	}
	return [...prepMap.values()]
}
