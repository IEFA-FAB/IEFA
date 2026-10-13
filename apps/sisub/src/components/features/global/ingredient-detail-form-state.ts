import type { Folder } from "@iefa/database/sisub"
import { computeIngredientDiff, type IngredientDiff } from "@/lib/ingredient-diff"
import type { IngredientVersion } from "@/types/domain/ingredient-versions"

// Tabs do formulário — estado persistido na URL (?tab=) para navegação e links compartilháveis.
// Espelha a estrutura de abas do RecipeForm (preparação).
/**
 * "substituicoes" saiu daqui: a substituição é decisão de PREPARAÇÃO ("nesta receita, o
 * que entra no lugar deste item"), não de cadastro do insumo, e é onde ela morava no
 * SISUBWEB. A aba passou para o editor da preparação (`RecipeForm`); os dados continuam
 * em `kitchen.ingredient_substitution`, que não mudou. Um `?tab=substituicoes` antigo cai
 * no fallback "detalhes".
 */
export const INGREDIENT_FORM_TABS = ["detalhes", "nutricao", "compra", "produto"] as const
export type IngredientFormTab = (typeof INGREDIENT_FORM_TABS)[number]

/** Aba ativa a partir do `?tab=` da URL; o fallback "detalhes" cobre valores fora do enum. */
export function resolveIngredientFormTab(tab: unknown): IngredientFormTab {
	return INGREDIENT_FORM_TABS.includes(tab as IngredientFormTab) ? (tab as IngredientFormTab) : "detalhes"
}

export interface FolderOption {
	id: string
	name: string
	path: string
}

/**
 * Caminho hierárquico de cada pasta (ex.: "Hortifruti / Frutas / Cítricas") — usado para
 * exibir a estrutura e permitir busca por qualquer parte do caminho no combobox.
 */
export function buildFolderOptions(folders: Folder[]): FolderOption[] {
	const byId = new Map(folders.map((f) => [f.id, f]))
	const pathOf = (f: Folder): string => {
		const parts: string[] = []
		let cur: Folder | undefined = f
		const seen = new Set<string>()
		while (cur && !seen.has(cur.id)) {
			seen.add(cur.id)
			parts.unshift(cur.description ?? "Sem Nome")
			cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
		}
		return parts.join(" / ")
	}
	return folders.map((f) => ({ id: f.id, name: f.description ?? "Sem Nome", path: pathOf(f) })).sort((a, b) => a.path.localeCompare(b.path, "pt-BR"))
}

/** Valores iniciais da tabela nutricional a partir do servidor; as edições do usuário vão por cima, como overrides. */
export function buildBaseNutrientValues(
	nutrients: ReadonlyArray<{ id: string }> | null | undefined,
	ingredientNutrients: ReadonlyArray<{ nutrient_id: string; nutrient_value: unknown }> | null | undefined
): Record<string, string> {
	if (!nutrients || !ingredientNutrients) return {}
	const map = Object.fromEntries(ingredientNutrients.map((pn) => [pn.nutrient_id, pn.nutrient_value]))
	return Object.fromEntries(nutrients.map((n) => [n.id, map[n.id] != null ? String(map[n.id]) : ""]))
}

/** Tabela alimentar em vigor na tela: a escolhida pelo usuário (inclusive `null` = desvincular) ou a do servidor. */
export function resolveNutritionReference<T>(override: T | null | undefined, server: T | null): T | null {
	return override !== undefined ? override : server
}

export interface VersionPreview {
	versionList: IngredientVersion[]
	selectedIndex: number
	selectedVersion: IngredientVersion | null
	previousVersion: IngredientVersion | undefined
	isPreviewing: boolean
	previewDiff: IngredientDiff | null
}

/** Estado derivado do histórico/preview: a versão aberta, a anterior a ela (base do diff) e o diff. */
export function selectVersionPreview(versions: IngredientVersion[] | null | undefined, selectedVersionId: string | null): VersionPreview {
	const versionList = versions ?? []
	const selectedIndex = selectedVersionId ? versionList.findIndex((v) => v.id === selectedVersionId) : -1
	const selectedVersion = selectedIndex >= 0 ? versionList[selectedIndex] : null
	const previousVersion = selectedIndex >= 0 ? versionList[selectedIndex + 1] : undefined
	const isPreviewing = selectedVersion != null
	const previewDiff = selectedVersion ? computeIngredientDiff(previousVersion?.snapshot ?? null, selectedVersion.snapshot) : null
	return { versionList, selectedIndex, selectedVersion, previousVersion, isPreviewing, previewDiff }
}
