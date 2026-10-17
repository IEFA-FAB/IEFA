import { describe, expect, it } from "bun:test"
import { computeParetoGroup, describeHiddenUgs, describeParetoConcentration, formatParetoShare, formatUgCount, splitParetoList } from "#/lib/analysis/pareto"

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
		expect(formatParetoShare(result.issuePercentage)).toBe("87%")
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

describe("formatParetoShare", () => {
	it("arredonda ao inteiro sem apagar os extremos", () => {
		// 1 UG em 250: o arredondamento dava "0% das UGs".
		expect(formatParetoShare((1 / 250) * 100)).toBe("<1%")
		expect(formatParetoShare((249 / 250) * 100)).toBe(">99%")
		expect(formatParetoShare(0)).toBe("0%")
		expect(formatParetoShare(100)).toBe("100%")
		expect(formatParetoShare((20 / 23) * 100)).toBe("87%")
	})
})

describe("textos do Pareto", () => {
	it("singular e plural de UG", () => {
		expect(formatUgCount(1)).toBe("1 UG")
		expect(formatUgCount(3)).toBe("3 UGs")
		expect(describeParetoConcentration({ ugPercentage: (1 / 250) * 100, issuePercentage: 85, groupSize: 1 })).toBe(
			"<1% das UGs (1 UG) concentram 85% das inconsistências"
		)
	})

	it("lista as 10 primeiras e conta o resto", () => {
		const group = ugs(...Array<number>(12).fill(1))
		const { shown, hiddenCount } = splitParetoList(group)
		expect(shown).toHaveLength(10)
		expect(hiddenCount).toBe(2)
		expect(describeHiddenUgs(hiddenCount)).toBe("e mais 2 UGs")
		expect(describeHiddenUgs(1)).toBe("e mais 1 UG")
		expect(describeHiddenUgs(0)).toBe("")
		expect(splitParetoList(ugs(1, 1)).hiddenCount).toBe(0)
	})
})
