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
