import { ALLERGEN_LABELS, normalizeAllergens, type RecipeIngredientDigest } from "@iefa/sisub-domain"

/**
 * Regras do cardápio semanal impresso (tela, PDF e DOCX), fora do componente para serem
 * testáveis: o que sai em negrito e o que entra na lista de preparações.
 */

/**
 * Grupos que saem em negrito na grade impressa — o prato que dá nome à refeição.
 *
 * São dois porque nem toda refeição tem "prato principal": no conjunto da ceia o
 * item que faz esse papel é o `lanche` (salgado assado, pão com frios). Sem ele
 * a folha da ceia sairia inteira em peso normal.
 */
const MAIN_DISH_GROUPS = new Set(["prato_principal", "lanche"])

/** O prato principal sai em negrito na grade; os demais grupos, em peso normal. */
export function isMainDish(group: string | null | undefined): boolean {
	return group != null && MAIN_DISH_GROUPS.has(group)
}

/**
 * Ingredientes na lista de preparações. Nunca com quantidade — a folha é para o comensal
 * saber o que come, não para a cozinha produzir.
 */
export const INGREDIENTS_MODES = ["none", "allergens", "all"] as const
export type IngredientsMode = (typeof INGREDIENTS_MODES)[number]

export const INGREDIENTS_MODE_LABELS: Record<IngredientsMode, string> = {
	none: "Não mostrar ingredientes",
	allergens: "Somente alergênicos",
	all: "Todos os ingredientes (sem quantidade)",
}

export type CardapioPrintOptions = { showMethod: boolean; ingredients: IngredientsMode }

/** Padrão = a folha de antes das opções: modo de preparo, sem ingredientes. */
export const DEFAULT_PRINT_OPTIONS: CardapioPrintOptions = { showMethod: true, ingredients: "none" }

/** Uma ficha distinta do cardápio, antes das opções de impressão. */
export type PreparationSource = { id: string; name: string; version: string; prePreparation: string | null; method: string | null }

export type PreparationEntry = {
	id: string
	name: string
	version: string
	/** `null` quando o modo de preparo está desligado ou a ficha não tem o texto. */
	prePreparation: string | null
	method: string | null
	/** Modo "todos": nomes dos ingredientes. `null` fora desse modo. */
	ingredients: string[] | null
	/** Modo "alergênicos": rótulos dos grupos presentes (pode ser vazio). `null` fora desse modo. */
	allergens: string[] | null
	/** Preparações dentro da ficha cujos alergênicos ninguém consegue afirmar. */
	unverified: string[]
}

/**
 * Monta a lista de preparações conforme as opções. Uma ficha entra quando tem algo a mostrar:
 * texto de preparo (com o modo ligado) ou ingredientes (com o modo de ingredientes ligado).
 * Ficha sem ingrediente nenhum não ganha "nenhum alergênico" — seria afirmar o que não se sabe.
 */
export function buildPreparationEntries(
	sources: readonly PreparationSource[],
	digests: ReadonlyMap<string, RecipeIngredientDigest> | undefined,
	options: CardapioPrintOptions
): PreparationEntry[] {
	const entries: PreparationEntry[] = []
	for (const source of sources) {
		const prePreparation = options.showMethod ? source.prePreparation : null
		const method = options.showMethod ? source.method : null
		const digest = options.ingredients === "none" ? undefined : digests?.get(source.id)
		const hasIngredients = (digest?.ingredients.length ?? 0) > 0

		let ingredients: string[] | null = null
		let allergens: string[] | null = null
		if (digest && hasIngredients && options.ingredients === "all") ingredients = digest.ingredients.map((i) => i.name)
		if (digest && hasIngredients && options.ingredients === "allergens")
			allergens = normalizeAllergens(digest.ingredients.flatMap((i) => i.allergens)).map((a) => ALLERGEN_LABELS[a])

		if (!prePreparation && !method && ingredients == null && allergens == null) continue
		entries.push({
			id: source.id,
			name: source.name,
			version: source.version,
			prePreparation,
			method,
			ingredients,
			allergens,
			unverified: allergens != null ? (digest?.unresolved ?? []) : [],
		})
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Texto da linha de alergênicos, igual na tela, no PDF e no DOCX. */
export function describeAllergens(entry: Pick<PreparationEntry, "allergens" | "unverified">): string | null {
	if (entry.allergens == null) return null
	const listed = entry.allergens.length > 0 ? entry.allergens.join(", ") : "nenhum marcado nos insumos"
	const unverified = entry.unverified.length > 0 ? ` (não conferido: ${entry.unverified.join(", ")})` : ""
	return `${listed}${unverified}`
}
