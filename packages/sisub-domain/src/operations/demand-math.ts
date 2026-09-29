/**
 * Matemática compartilhada demanda → quantidade de ingrediente.
 *
 * Os DOIS motores de procurement do sisub usam a MESMA fórmula, com papéis distintos
 * (decisão de arquitetura: ambos existem, cada um cobre um horizonte):
 *
 *  • calculateQuantityEstimateNeeds (aquisição / planejamento de longo prazo): projeta o cardápio
 *    semanal N vezes. demand = headcount_override do item ?? efetivo base da refeição;
 *    repetitions = repetições da seleção do anexo.
 *
 *  • fetchProcurementNeeds (ajuste fino datado): agrega o calendário de produção real
 *    (daily_menu → menu_items). demand = planned_portion_quantity (nº de comensais do
 *    item); repetitions = 1 (cada data já é uma ocorrência concreta).
 *
 * Ambos convergem em: quantidade = net_quantity × (demanda / rendimento) × repetições.
 * `portionYield` (rendimento-base de porções da receita) 0/nulo cai para 1 (não divide
 * por zero). `demand` é sempre um número de comensais.
 */
export function scaleIngredientQuantity(netQuantity: number, demand: number, portionYield: number, repetitions = 1): number {
	const yieldSafe = portionYield || 1
	return netQuantity * (demand / yieldSafe) * repetitions
}

/**
 * Comensais de UM item do cardápio.
 *
 * As três formas de dimensionar um item são excludentes, nesta precedência:
 *   1. `headcountOverride` — quantidade direta de pessoas daquela preparação;
 *   2. `recommendedProportion` — percentual do efetivo da refeição (ex.: 30% de 800 = 240),
 *      que é como se diz "só parte da tropa come esta opção";
 *   3. o próprio efetivo base da refeição, quando o item não diz nada.
 *
 * A porcentagem era só informativa (aparecia ao comensal e na impressão) enquanto a compra
 * usava o efetivo cheio: um item marcado com 30% entrava na aquisição como se todos
 * comessem dele. Ou seja, quem preenchia os dois campos via a porcentagem ser ignorada.
 */
export function resolveItemDemand({
	headcountOverride,
	baseHeadcount,
	recommendedProportion,
	rounding = "nearest",
}: {
	headcountOverride?: number | null
	baseHeadcount?: number | null
	recommendedProportion?: number | null
	/**
	 * Arredondamento da porcentagem. `nearest` no semanal e no evento (número de anexo já montado
	 * não muda); `up` no apoio, onde a proporção é porções por kit: 3 kits × 0,5 café = 2, porque
	 * faltar porção custa mais que sobrar meia.
	 */
	rounding?: DemandRounding
}): number | null {
	if (headcountOverride != null) return headcountOverride
	if (baseHeadcount == null) return null
	if (recommendedProportion == null) return baseHeadcount
	const exact = (baseHeadcount * recommendedProportion) / 100
	// O epsilon absorve erro de ponto flutuante logo acima de um inteiro (7,000000000000001 → 7).
	return rounding === "up" ? Math.ceil(exact - 1e-9) : Math.round(exact)
}

export type DemandRounding = "nearest" | "up"

/** Arredondamento da demanda pelo regime do cardápio ({@link resolveItemDemand}). */
export function demandRoundingFor(templateType: string | null | undefined): DemandRounding {
	return templateType === "apoio" ? "up" : "nearest"
}
