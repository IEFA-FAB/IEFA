import { describe, expect, test } from "bun:test"
import { runCrossChecks } from "../compliance/cross-checks.ts"
import { GOLDEN_CASES } from "./golden/cases.ts"
import { evaluate } from "./metrics.ts"

describe("evaluate", () => {
	test("acerto perfeito", () => {
		const report = evaluate([{ id: "a", produced: ["r1"], expectation: { expected: ["r1"] } }])

		expect(report.overall.precision).toBe(1)
		expect(report.overall.recall).toBe(1)
		expect(report.overall.f1).toBe(1)
	})

	test("achado esperado e não produzido conta como falso negativo", () => {
		const report = evaluate([{ id: "a", produced: [], expectation: { expected: ["r1"] } }])

		expect(report.overall.false_negatives).toBe(1)
		expect(report.overall.recall).toBe(0)
		expect(report.cases[0].missing).toEqual(["r1"])
	})

	test("achado proibido e produzido conta como falso positivo", () => {
		const report = evaluate([{ id: "a", produced: ["r2"], expectation: { expected: [], forbidden: ["r2"] } }])

		expect(report.overall.false_positives).toBe(1)
		expect(report.overall.precision).toBe(0)
	})

	test("código fora do universo anotado não penaliza a métrica", () => {
		// Um caso que ainda não anota determinada regra não pode fazer essa regra
		// parecer imprecisa — senão anotar menos melhoraria artificialmente o número.
		const report = evaluate([{ id: "a", produced: ["nao-anotado"], expectation: { expected: [] } }])

		expect(report.overall.false_positives).toBe(0)
		expect(report.cases[0].unexpected).toEqual([])
	})

	test("métrica por código é independente do agregado", () => {
		const report = evaluate([
			{ id: "a", produced: ["r1"], expectation: { expected: ["r1", "r2"] } },
			{ id: "b", produced: ["r2"], expectation: { expected: ["r2"] } },
		])

		expect(report.by_code.r1.recall).toBe(1)
		expect(report.by_code.r2.recall).toBeCloseTo(0.5, 6)
		expect(report.overall.recall).toBeCloseTo(2 / 3, 6)
	})

	test("conjunto vazio não gera divisão por zero", () => {
		const report = evaluate([])
		expect(report.overall.precision).toBe(1)
		expect(report.overall.f1).toBe(1)
	})
})

describe("golden set das checagens cruzadas", () => {
	test("todo caso produz exatamente os achados anotados", () => {
		const outcomes = GOLDEN_CASES.map((testCase) => ({
			id: testCase.id,
			produced: runCrossChecks(testCase.payload)
				.filter((check) => check.status === "INCONFORME")
				.map((check) => check.code),
			expectation: testCase.expectation,
		}))

		const report = evaluate(outcomes)

		expect(report.cases.filter((testCase) => testCase.missing.length > 0)).toEqual([])
		expect(report.cases.filter((testCase) => testCase.unexpected.length > 0)).toEqual([])
	})

	test("documento completo não produz achado", () => {
		const completo = GOLDEN_CASES.find((testCase) => testCase.id === "tr-servicos-completo")
		const findings = runCrossChecks(completo?.payload ?? ({} as never)).filter((check) => check.status === "INCONFORME")

		expect(findings).toEqual([])
	})

	test("prazo não declarado não é dado como conforme", () => {
		const caso = GOLDEN_CASES.find((testCase) => testCase.id === "tr-prazo-nao-declarado")
		const vigencia = runCrossChecks(caso?.payload ?? ({} as never)).find((check) => check.code === "cruzada:vigencia-limite")

		expect(vigencia?.status).toBe("NAO_AVALIADA")
	})
})
