/**
 * Pareto das UGs, com um critério só para as ferramentas que o mostram (conta genérica e
 * monitoramento).
 *
 * O grupo são as UGs, da maior contagem para a menor, até a soma alcançar 80% do total
 * ("os poucos vitais"). As duas porcentagens são sobre ESSE grupo: quantas UGs ele tem
 * (sobre o total de UGs) e quantas ocorrências ele soma (sobre o total). A lista exibida
 * é o próprio grupo, na mesma ordem. Assim a frase "X% das UGs concentram Y% das
 * inconsistências" e a lista abaixo dela falam do mesmo conjunto.
 *
 * Antes cada tela misturava recortes: a conta genérica media as UGs até 80% e somava as
 * ocorrências de outro corte (mínimo 3, máximo 10 UGs); o monitoramento fixava 20% das
 * UGs pela contagem e listava as primeiras pela prioridade.
 *
 * Empate na fronteira segue a ordem estável da lista recebida.
 */

/** Fração do total que fecha o grupo. */
export const PARETO_SHARE = 0.8

export interface ParetoGroup<T> {
	/** UGs do grupo, na ordem recebida (contagem decrescente). */
	group: T[]
	/** Tamanho do grupo sobre o total de UGs, em % arredondado. */
	ugPercentage: number
	/** Ocorrências do grupo sobre o total, em % arredondado. */
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
		ugPercentage: Math.round((group.length / sortedByCount.length) * 100),
		issuePercentage: Math.round((running / total) * 100),
	}
}
