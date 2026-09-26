/**
 * Precedência dentro de uma linhagem de receitas (dedup por família).
 *
 * Versões inserem linhas novas com `base_recipe_id` → raiz; a raiz tem `base_recipe_id` nulo.
 * A regra tem duas encarnações e as duas saem daqui:
 *   - no servidor, o `ORDER BY` do `DISTINCT ON` de `buildLineageWinnerFilter`
 *     (`operations/recipes.ts`), que escolhe a vencedora das listagens no próprio Postgres;
 *   - no navegador, `isSupersededBy` (`apps/sisub/src/lib/recipe-versions.ts`), que decide se
 *     o item do cardápio está numa versão desatualizada.
 * `recipes.list.test.ts` prende a equivalência entre as duas.
 */

export type LineageRank = {
	kitchenId: number | null
	version: number
}

/**
 * `candidate` precede `incumbent` na mesma linhagem?
 *
 * A linha LOCAL sombreia a global **incondicionalmente** — semântica de branch de git: o
 * fork da cozinha vence o upstream na visão dela. Entre linhas do mesmo escopo, vence a
 * maior versão. Empate (mesmo escopo, mesma versão) não troca o vencedor; na listagem, o
 * `id` decide, e o índice único `recipes_lineage_version_unique_idx` impede esse empate em
 * toda linha com `base_recipe_id`.
 *
 * Comparar apenas `version` (comportamento anterior) empatava fork e global quando os dois
 * chegavam ao mesmo número, e o vencedor passava a depender da ordem em que o Postgres
 * devolvia as linhas — não-determinístico. A listagem de uma cozinha só traz o global e as
 * linhas dela própria, então "local" aqui só pode ser a cozinha que consultou.
 */
export function isLineageWinner(candidate: LineageRank, incumbent: LineageRank): boolean {
	const candidateIsLocal = candidate.kitchenId != null
	if (candidateIsLocal !== (incumbent.kitchenId != null)) return candidateIsLocal
	return candidate.version > incumbent.version
}
