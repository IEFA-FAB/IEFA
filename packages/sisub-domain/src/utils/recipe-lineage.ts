/**
 * Dedup por família das listagens de receitas: uma linha por linhagem.
 *
 * Versões inserem linhas novas com `base_recipe_id` → raiz; a raiz tem `base_recipe_id` nulo.
 * Função pura, sem banco: `listRecipes` a aplica sobre as colunas leves ANTES de carregar a
 * ficha técnica, e `listRecipeSummaries` sobre o resumo. As duas listagens precisam escolher o
 * mesmo vencedor, então a regra mora num lugar só.
 */

export type LineageCandidate = {
	id: string
	baseRecipeId: string | null
	kitchenId: number | null
	version: number
}

/**
 * Precedência dentro de uma linhagem.
 *
 * A linha LOCAL sombreia a global **incondicionalmente** — semântica de branch de git: o
 * fork da cozinha vence o upstream na visão dela. Entre linhas do mesmo escopo, vence a
 * maior versão.
 *
 * Comparar apenas `version` (comportamento anterior) empatava fork e global quando os dois
 * chegavam ao mesmo número, e o vencedor passava a depender da ordem em que o Postgres
 * devolvia as linhas — não-determinístico. A listagem de uma cozinha só traz o global e as
 * linhas dela própria, então "local" aqui só pode ser a cozinha que consultou.
 */
export function isLineageWinner(
	candidate: Pick<LineageCandidate, "kitchenId" | "version">,
	incumbent: Pick<LineageCandidate, "kitchenId" | "version">
): boolean {
	const candidateIsLocal = candidate.kitchenId != null
	if (candidateIsLocal !== (incumbent.kitchenId != null)) return candidateIsLocal
	return candidate.version > incumbent.version
}

/**
 * Vencedor de cada linhagem, na ordem em que a raiz apareceu pela primeira vez.
 *
 * Empate exato (mesmo escopo, mesma versão) fica com a primeira linha vista — o
 * comportamento de sempre da listagem.
 */
export function pickLineageWinners<T extends LineageCandidate>(rows: readonly T[]): T[] {
	const byRoot = new Map<string, T>()
	for (const row of rows) {
		const rootId = row.baseRecipeId ?? row.id
		const incumbent = byRoot.get(rootId)
		if (!incumbent || isLineageWinner(row, incumbent)) byRoot.set(rootId, row)
	}
	return Array.from(byRoot.values())
}
