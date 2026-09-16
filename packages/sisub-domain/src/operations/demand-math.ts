/**
 * Matemática compartilhada demanda → quantidade de ingrediente.
 *
 * Os DOIS motores de procurement do sisub usam a MESMA fórmula, com papéis distintos
 * (decisão de arquitetura: ambos existem, cada um cobre um horizonte):
 *
 *  • calculateAtaNeeds (aquisição / planejamento de longo prazo): projeta o cardápio
 *    semanal N vezes. demand = headcount_override do item ?? efetivo base da refeição;
 *    repetitions = repetições da seleção da ATA.
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
}: {
	headcountOverride?: number | null
	baseHeadcount?: number | null
	recommendedProportion?: number | null
}): number | null {
	if (headcountOverride != null) return headcountOverride
	if (baseHeadcount == null) return null
	if (recommendedProportion == null) return baseHeadcount
	return Math.round((baseHeadcount * recommendedProportion) / 100)
}
