import { describe, expect, it } from "bun:test"
import { computeParetoGroup } from "#/lib/analysis/pareto"

const ugs = (...counts: number[]) => counts.map((count, i) => ({ ug: `U${i}`, count }))

describe("computeParetoGroup", () => {
	it("o grupo vai até alcançar 80%, e as duas porcentagens são dele", () => {
		// 10 ocorrências: 4 + 3 + 1 = 8 → três UGs de cinco.
		expect(computeParetoGroup(ugs(4, 3, 1, 1, 1))).toEqual({
			group: ugs(4, 3, 1),
			ugPercentage: 60,
			issuePercentage: 80,
		})
	})

	it("UG dominante: o grupo é só ela", () => {
		const result = computeParetoGroup(ugs(20, 1, 1, 1))
		expect(result.group.map((u) => u.ug)).toEqual(["U0"])
		expect(result.ugPercentage).toBe(25)
		expect(result.issuePercentage).toBe(87)
	})

	it("sem corte artificial de tamanho", () => {
		const result = computeParetoGroup(ugs(...Array<number>(20).fill(1)))
		expect(result.group).toHaveLength(16)
		expect([result.ugPercentage, result.issuePercentage]).toEqual([80, 80])
	})

	it("sem UG ou sem ocorrência: grupo vazio e 0%", () => {
		expect(computeParetoGroup([])).toEqual({ group: [], ugPercentage: 0, issuePercentage: 0 })
		expect(computeParetoGroup(ugs(0, 0))).toEqual({ group: [], ugPercentage: 0, issuePercentage: 0 })
	})
})
