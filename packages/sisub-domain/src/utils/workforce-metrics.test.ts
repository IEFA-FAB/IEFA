/**
 * Indicadores da matriz de efetivo.
 *
 * Os casos aqui são os que a planilha errava ou não conseguia expressar: branco somado como
 * zero, total declarado divergindo das parcelas, afastado contado como disponível, e divisão
 * por rancho que não registra presença.
 */

import { describe, expect, test } from "bun:test"
import {
	computeRanchoMetrics,
	coverageGaps,
	dinersPerWorker,
	groupWorkforceBy,
	type RanchoWorkforceInput,
	summarizeWorkforce,
	type WorkforceCategoryRef,
} from "./workforce-metrics.ts"

const CATEGORIES: WorkforceCategoryRef[] = [
	{ code: "nut_qocon", name: "Nutricionista (QOCON)", sort_order: 10, is_career: false, is_technical: true },
	{ code: "tnd_qscon", name: "Técnico em Nutrição e Dietética", sort_order: 20, is_career: false, is_technical: true },
	{ code: "qta", name: "QTA e demais quadros de carreira", sort_order: 30, is_career: true, is_technical: false },
	{ code: "qscon", name: "QSCON", sort_order: 40, is_career: false, is_technical: false },
	{ code: "qcbcon", name: "QCBCON", sort_order: 50, is_career: false, is_technical: false },
	{ code: "qsd", name: "QSD", sort_order: 60, is_career: false, is_technical: false },
]

function rancho(over: Partial<RanchoWorkforceInput> = {}): RanchoWorkforceInput {
	return {
		ranchoId: 1,
		code: "basc",
		displayName: "BASC",
		eloCode: "BASC",
		unitId: 8,
		messHallId: 8,
		headcounts: {},
		declaredTotal: null,
		notes: [],
		answered: true,
		...over,
	}
}

describe("computeRanchoMetrics", () => {
	test("soma as parcelas preenchidas — caso BASC da coleta de agosto/2026", () => {
		const m = computeRanchoMetrics(rancho({ headcounts: { nut_qocon: 1, tnd_qscon: 1, qta: 30, qscon: 0, qcbcon: 0, qsd: 24 }, declaredTotal: 56 }), CATEGORIES)
		expect(m.total).toBe(56)
		expect(m.declaredTotalDiverges).toBe(false)
		expect(m.careerStaff).toBe(30)
		expect(m.temporaryStaff).toBe(26)
		expect(m.technicalStaff).toBe(2)
		expect(m.hasNutritionist).toBe(true)
	})

	test("total declarado que diverge da soma é sinalizado, e a soma prevalece — caso HFAG", () => {
		const m = computeRanchoMetrics(
			rancho({ code: "hfag", headcounts: { nut_qocon: 1, tnd_qscon: 0, qta: 14, qscon: 0, qcbcon: 1, qsd: 6 }, declaredTotal: 20 }),
			CATEGORIES
		)
		expect(m.total).toBe(22)
		expect(m.declaredTotal).toBe(20)
		expect(m.declaredTotalDiverges).toBe(true)
	})

	test("rancho que não respondeu tem total null, nunca zero", () => {
		const m = computeRanchoMetrics(rancho({ answered: false }), CATEGORIES)
		expect(m.total).toBeNull()
		expect(m.availableTotal).toBeNull()
		expect(m.careerRatio).toBeNull()
	})

	test("zero declarado é diferente de campo em branco", () => {
		const blank = computeRanchoMetrics(rancho({ headcounts: { qta: 5 } }), CATEGORIES)
		const zeroed = computeRanchoMetrics(rancho({ headcounts: { qta: 5, nut_qocon: 0 } }), CATEGORIES)
		expect(blank.total).toBe(5)
		expect(zeroed.total).toBe(5)
		expect(blank.hasNutritionist).toBe(false)
		expect(zeroed.hasNutritionist).toBe(false)
		// A distinção sobrevive no mapa de origem, que é o que a tela precisa para mostrar
		// "—" (não informado) em vez de "0" (informado como zero).
		expect(blank.filledCategories).toEqual(["qta"])
		expect(zeroed.filledCategories).toEqual(["nut_qocon", "qta"])
	})

	test("afastado e desviado saem do disponível, mas continuam no nominal — caso GAP-CO Leste", () => {
		const m = computeRanchoMetrics(
			rancho({
				code: "gap-co-leste",
				headcounts: { nut_qocon: 0, tnd_qscon: 1, qta: 24, qscon: 1, qcbcon: 6, qsd: 23 },
				declaredTotal: 55,
				notes: [
					{ kind: "leave", quantity: 2 },
					{ kind: "counting", quantity: 2 },
					{ kind: "scope", quantity: null },
				],
			}),
			CATEGORIES
		)
		expect(m.total).toBe(55)
		expect(m.unavailable).toBe(2)
		expect(m.availableTotal).toBe(53)
		// `counting` é critério de contagem, não indisponibilidade: não pode entrar na conta.
		expect(m.hasNutritionist).toBe(false)
		expect(m.hasTechnicalStaff).toBe(true)
	})

	test("terceirizado é contado à parte, nunca somado ao efetivo militar — caso HFAG", () => {
		const m = computeRanchoMetrics(rancho({ code: "hfag", headcounts: { qta: 14, qsd: 6 }, notes: [{ kind: "outsourced", quantity: 9 }] }), CATEGORIES)
		expect(m.total).toBe(20)
		expect(m.outsourced).toBe(9)
		expect(m.availableTotal).toBe(20)
	})

	test("mais afastados do que o nominal não produz disponível negativo", () => {
		const m = computeRanchoMetrics(rancho({ headcounts: { qta: 2 }, notes: [{ kind: "leave", quantity: 5 }] }), CATEGORIES)
		expect(m.availableTotal).toBe(0)
	})

	test("categoria desconhecida é ignorada em vez de contaminar o total", () => {
		const m = computeRanchoMetrics(rancho({ headcounts: { qta: 10, quadro_inventado: 99 } }), CATEGORIES)
		expect(m.total).toBe(10)
	})
})

describe("summarizeWorkforce", () => {
	const metrics = [
		computeRanchoMetrics(rancho({ ranchoId: 1, code: "a", headcounts: { nut_qocon: 1, qta: 10 } }), CATEGORIES),
		computeRanchoMetrics(rancho({ ranchoId: 2, code: "b", headcounts: { qta: 20, qsd: 5 } }), CATEGORIES),
		computeRanchoMetrics(rancho({ ranchoId: 3, code: "c", answered: false }), CATEGORIES),
	]

	test("agrega só quem respondeu e expõe a taxa de resposta", () => {
		const s = summarizeWorkforce(metrics, "rede")
		expect(s.ranchos).toBe(3)
		expect(s.answeredRanchos).toBe(2)
		expect(s.responseRate).toBeCloseTo(2 / 3)
		expect(s.total).toBe(36)
	})

	test("rancho sem resposta não conta como rancho sem nutricionista", () => {
		const s = summarizeWorkforce(metrics, "rede")
		// Só o rancho "b" respondeu e não declarou nutricionista; o "c" ficou em silêncio.
		expect(s.ranchosWithoutNutritionist).toBe(1)
	})

	test("grupo vazio não divide por zero", () => {
		expect(summarizeWorkforce([], "vazio").responseRate).toBe(0)
	})
})

describe("groupWorkforceBy", () => {
	test("agrupa por ELO e ordena pelo maior efetivo", () => {
		const groups = groupWorkforceBy(
			[
				computeRanchoMetrics(rancho({ ranchoId: 1, eloCode: "EEAR", headcounts: { qta: 44 } }), CATEGORIES),
				computeRanchoMetrics(rancho({ ranchoId: 2, eloCode: "EEAR", headcounts: { qta: 7 } }), CATEGORIES),
				computeRanchoMetrics(rancho({ ranchoId: 3, eloCode: "BASC", headcounts: { qta: 30 } }), CATEGORIES),
			],
			(m) => m.eloCode
		)
		expect(groups.map((g) => g.key)).toEqual(["EEAR", "BASC"])
		expect(groups[0]?.total).toBe(51)
		expect(groups[0]?.ranchos).toBe(2)
	})
})

describe("coverageGaps", () => {
	test("lista quem respondeu sem cobertura técnica, do maior efetivo ao menor", () => {
		const gaps = coverageGaps([
			computeRanchoMetrics(rancho({ ranchoId: 1, code: "pequeno", headcounts: { qta: 9 } }), CATEGORIES),
			computeRanchoMetrics(rancho({ ranchoId: 2, code: "grande", headcounts: { qta: 55 } }), CATEGORIES),
			computeRanchoMetrics(rancho({ ranchoId: 3, code: "coberto", headcounts: { nut_qocon: 1, qta: 80 } }), CATEGORIES),
			computeRanchoMetrics(rancho({ ranchoId: 4, code: "mudo", answered: false }), CATEGORIES),
		])
		expect(gaps.map((g) => g.code)).toEqual(["grande", "pequeno"])
	})

	test("só TND, sem nutricionista, já conta como coberto tecnicamente", () => {
		const gaps = coverageGaps([computeRanchoMetrics(rancho({ headcounts: { tnd_qscon: 1, qta: 20 } }), CATEGORIES)])
		expect(gaps).toEqual([])
	})
})

describe("dinersPerWorker", () => {
	const m = computeRanchoMetrics(rancho({ headcounts: { qta: 10 } }), CATEGORIES)

	test("comensais por dia divididos pelo efetivo disponível", () => {
		expect(dinersPerWorker(m, { presences: 6000, activeDays: 20 })).toBe(30)
	})

	test("sem refeitório vinculado devolve null, não zero", () => {
		expect(dinersPerWorker(m, null)).toBeNull()
	})

	test("rancho que não registra presença devolve null, não zero", () => {
		expect(dinersPerWorker(m, { presences: 0, activeDays: 0 })).toBeNull()
	})

	test("efetivo não declarado devolve null", () => {
		const mudo = computeRanchoMetrics(rancho({ answered: false }), CATEGORIES)
		expect(dinersPerWorker(mudo, { presences: 100, activeDays: 10 })).toBeNull()
	})

	test("efetivo inteiramente indisponível devolve null em vez de dividir por zero", () => {
		const zerado = computeRanchoMetrics(rancho({ headcounts: { qta: 2 }, notes: [{ kind: "leave", quantity: 2 }] }), CATEGORIES)
		expect(dinersPerWorker(zerado, { presences: 100, activeDays: 10 })).toBeNull()
	})
})
