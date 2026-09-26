import { describe, expect, test } from "bun:test"
import { isLineageWinner, type LineageRank } from "./recipe-lineage.ts"

const buildRank = (version: number, kitchenId: number | null = null): LineageRank => ({ version, kitchenId })

/** A regra como estava em `operations/recipes.ts` antes de mudar de casa (`lineageWinner`). */
function applyPreviousLineageRule(candidate: LineageRank, incumbent: LineageRank): boolean {
	const candidateIsLocal = candidate.kitchenId != null
	if (candidateIsLocal !== (incumbent.kitchenId != null)) return candidateIsLocal
	return candidate.version > incumbent.version
}

describe("isLineageWinner", () => {
	test("maior versão vence dentro do mesmo escopo", () => {
		expect(isLineageWinner(buildRank(2), buildRank(1))).toBe(true)
		expect(isLineageWinner(buildRank(1), buildRank(2))).toBe(false)
	})

	test("empate de versão no mesmo escopo não troca o vencedor", () => {
		expect(isLineageWinner(buildRank(3), buildRank(3))).toBe(false)
		expect(isLineageWinner(buildRank(3, 7), buildRank(3, 7))).toBe(false)
	})

	test("local vence global mesmo com versão menor, e global nunca derruba local", () => {
		expect(isLineageWinner(buildRank(1, 7), buildRank(9))).toBe(true)
		expect(isLineageWinner(buildRank(9), buildRank(1, 7))).toBe(false)
	})

	test("decide igual à regra anterior em todo par de escopo × versão", () => {
		const ranks = [null, 7].flatMap((kitchenId) => [1, 2, 3].map((version) => buildRank(version, kitchenId)))
		for (const candidate of ranks) {
			for (const incumbent of ranks) {
				expect(isLineageWinner(candidate, incumbent)).toBe(applyPreviousLineageRule(candidate, incumbent))
			}
		}
	})
})
