import type { Ingredient } from "@/types/domain/ingredients"
import type { RecipeAlternativeFormRow } from "@/types/domain/recipes"

/** O que o seletor de substitutos precisa da linha da ficha. */
interface SubstituteHost {
	ingredient_id: string | null
	net_quantity: number | null
	alternatives: RecipeAlternativeFormRow[]
}

/**
 * Insumos que o seletor de substitutos não oferece. O insumo da própria linha não substitui
 * a si mesmo, e o mesmo substituto não entra duas vezes: o índice único da tabela rejeitaria
 * o segundo com um 23505 sem mensagem, já depois de o usuário ter clicado em salvar.
 */
export function buildSubstituteExclusions(row: SubstituteHost): Map<string, { label: string; checked?: boolean }> {
	return new Map<string, { label: string; checked?: boolean }>([
		...(row.ingredient_id ? [[row.ingredient_id, { label: "Insumo principal" }] as const] : []),
		...row.alternatives.map((alt) => [alt.ingredient_id, { label: "Já adicionado", checked: true }] as const),
	])
}

/** Substitutos da linha depois de acrescentar os escolhidos (sem repetir o principal nem um já cadastrado). */
export function appendPickedAlternatives(row: SubstituteHost, picked: Ingredient[]): RecipeAlternativeFormRow[] {
	const taken = new Set([row.ingredient_id, ...row.alternatives.map((alt) => alt.ingredient_id)])
	return [
		...row.alternatives,
		...picked
			.filter((ingredient) => !taken.has(ingredient.id))
			.map((ingredient) => ({
				ingredient_id: ingredient.id,
				ingredient_name: ingredient.description ?? "",
				measure_unit: ingredient.measure_unit ?? "UN",
				// Só serve para a promoção a principal não perder a pasta do insumo.
				folder_id: ingredient.folder_id ?? null,
				// Nasce com a quantidade do principal: é o palpite certo na maioria dos
				// casos e deixa explícito o que ajustar quando não é.
				net_quantity: row.net_quantity,
			})),
	]
}
