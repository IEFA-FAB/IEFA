/**
 * Pareto das UGs por contagem de ocorrências, com um critério só para as ferramentas que
 * o mostram (conta genérica, monitoramento e subitens genéricos).
 *
 * O grupo são as UGs, da maior contagem para a menor, até a soma alcançar 80% do total
 * ("os poucos vitais"). As duas porcentagens são sobre ESSE grupo: quantas UGs ele tem
 * (sobre o total de UGs) e quantas ocorrências ele soma (sobre o total). A lista exibida
 * é o próprio grupo, na mesma ordem. Assim a frase "X% das UGs concentram Y% das
 * inconsistências" e a lista abaixo dela falam do mesmo conjunto.
 *
 * Antes cada tela misturava recortes: a conta genérica media as UGs até 80% e somava as
 * ocorrências de outro corte (mínimo 3, máximo 10 UGs); o monitoramento fixava 20% das
 * UGs pela contagem e listava as primeiras pela prioridade; o subitens fixava 20% das UGs.
 *
 * Fora deste critério, de propósito, ficam os Pareto por VALOR: o saldo alongado
 * (`AnalyticalPanel`, UGs até 85% do saldo acumulado, parâmetro do upstream
 * Analistasaldoalongado, "critical mass") e a curva do auditor (opacidade até 80% da
 * diferença acumulada). Medem saldo, não ocorrência, e não dizem "X% das UGs".
 *
 * Empate na fronteira segue a ordem estável da lista recebida.
 */

/** Fração do total que fecha o grupo. */
export const PARETO_SHARE = 0.8

export interface ParetoGroup<T> {
	/** UGs do grupo, na ordem recebida (contagem decrescente). */
	group: T[]
	/** Tamanho do grupo sobre o total de UGs, em %, sem arredondar (exiba com `formatParetoShare`). */
	ugPercentage: number
	/** Ocorrências do grupo sobre o total, em %, sem arredondar (exiba com `formatParetoShare`). */
	issuePercentage: number
}

/** `sortedByCount` em ordem decrescente de `count`. Sem UG ou sem ocorrência, grupo vazio e 0%. */
export function computeParetoGroup<T extends { count: number }>(sortedByCount: readonly T[]): ParetoGroup<T> {
	const total = sortedByCount.reduce((sum, item) => sum + item.count, 0)
	if (sortedByCount.length === 0 || total === 0) return { group: [], ugPercentage: 0, issuePercentage: 0 }
	const group: T[] = []
	let running = 0
	for (const item of sortedByCount) {
		if (running >= total * PARETO_SHARE) break
		group.push(item)
		running += item.count
	}
	return {
		group,
		ugPercentage: (group.length / sortedByCount.length) * 100,
		issuePercentage: (running / total) * 100,
	}
}

/**
 * Porcentagem do Pareto para exibir. Arredonda ao inteiro, mas não deixa o arredondamento
 * apagar o extremo: 1 UG em 250 (0,4%) sai "<1%", não "0%"; 249 em 250 sai ">99%", não
 * "100%".
 */
export function formatParetoShare(percent: number): string {
	if (percent > 0 && percent < 1) return "<1%"
	if (percent > 99 && percent < 100) return ">99%"
	return `${Math.round(percent)}%`
}

/** "1 UG", "3 UGs". */
export function formatUgCount(count: number): string {
	return count === 1 ? "1 UG" : `${count} UGs`
}

/** Frase do Pareto, para o chat e o contexto do oráculo: "X% das UGs (N UGs) concentram Y% das inconsistências". */
export function describeParetoConcentration(pareto: { ugPercentage: number; issuePercentage: number; groupSize: number }): string {
	return `${formatParetoShare(pareto.ugPercentage)} das UGs (${formatUgCount(pareto.groupSize)}) concentram ${formatParetoShare(pareto.issuePercentage)} das inconsistências`
}

/** Quantas UGs do grupo a tela lista; o resto vira "e mais K UGs". */
export const PARETO_LIST_LIMIT = 10

/** As primeiras `limit` UGs do grupo e quantas ficaram de fora da lista. */
export function splitParetoList<T>(group: readonly T[], limit = PARETO_LIST_LIMIT): { shown: T[]; hiddenCount: number } {
	return { shown: group.slice(0, limit), hiddenCount: Math.max(0, group.length - limit) }
}

/** "e mais 1 UG", "e mais 5 UGs"; vazio quando nada ficou de fora. */
export function describeHiddenUgs(hiddenCount: number): string {
	return hiddenCount > 0 ? `e mais ${formatUgCount(hiddenCount)}` : ""
}
