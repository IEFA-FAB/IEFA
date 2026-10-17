/**
 * Números do cabeçalho do `TaskDetailSheet` (porções planejadas, tempo de preparo, rendimento).
 *
 * No JSX, `{valor && <span/>}` com valor 0 rende o próprio 0: aparecia um "0" solto no
 * cabeçalho e ao lado de "Ingredientes". Aqui cada número já sai nulo quando não há o que mostrar.
 */

/** Número que a ficha mostra: só positivo. Zero, negativo ou ausente vira nulo. */
export function toShownCount(value: number | null | undefined): number | null {
	return value != null && value > 0 ? value : null
}

export type TaskSheetFacts = {
	plannedPortions: number | null
	preparationMinutes: number | null
	portionYield: number | null
	/** Há porções ou tempo de preparo para a linha de descrição do cabeçalho. */
	hasDescription: boolean
	/** As quantidades dos ingredientes estão escaladas para as porções planejadas. */
	isScaled: boolean
}

export function describeTaskSheetFacts(input: {
	plannedPortions: number | null | undefined
	preparationMinutes: number | null | undefined
	portionYield: number | null | undefined
}): TaskSheetFacts {
	const plannedPortions = toShownCount(input.plannedPortions)
	const preparationMinutes = toShownCount(input.preparationMinutes)
	const portionYield = toShownCount(input.portionYield)
	return {
		plannedPortions,
		preparationMinutes,
		portionYield,
		hasDescription: plannedPortions != null || preparationMinutes != null,
		isScaled: plannedPortions != null && portionYield != null,
	}
}

function formatQty(value: number): string {
	return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)
}

/**
 * Quantidade líquida do ingrediente para as porções planejadas:
 * net_quantity × (planned_portions / portion_yield). Escala pelo MESMO predicado do rótulo
 * "quantidades para N porções" (`isScaled`): com truthiness à parte, um valor negativo escalava
 * a tabela sem o rótulo dizer.
 */
export function scaleIngredientQty(netQty: number | null, facts: Pick<TaskSheetFacts, "isScaled" | "plannedPortions" | "portionYield">): string {
	if (netQty == null) return "—"
	if (!facts.isScaled || facts.plannedPortions == null || facts.portionYield == null) return formatQty(netQty)
	return formatQty(netQty * (facts.plannedPortions / facts.portionYield))
}
