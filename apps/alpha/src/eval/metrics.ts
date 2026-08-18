/**
 * Métricas de avaliação da verificação de conformidade.
 *
 * Sem isto não há como saber se um ajuste de prompt ou de limiar melhorou ou
 * piorou o sistema — a impressão de que "ficou melhor" é exatamente o que a
 * calibração de um verificador jurídico não pode usar como critério.
 */

export interface CaseExpectation {
	/** Códigos de achado que o caso deve produzir. */
	expected: string[]
	/** Códigos que o caso NÃO pode produzir (falso positivo conhecido). */
	forbidden?: string[]
}

export interface CaseOutcome {
	id: string
	produced: string[]
	expectation: CaseExpectation
}

export interface Metrics {
	true_positives: number
	false_positives: number
	false_negatives: number
	precision: number
	recall: number
	f1: number
}

export interface EvaluationReport {
	overall: Metrics
	by_code: Record<string, Metrics>
	cases: Array<{ id: string; missing: string[]; unexpected: string[] }>
}

function metricsFrom(tp: number, fp: number, fn: number): Metrics {
	const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
	const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
	const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

	return { true_positives: tp, false_positives: fp, false_negatives: fn, precision, recall, f1 }
}

/**
 * Compara o que a verificação produziu com o que o caso anotado esperava.
 *
 * Um achado produzido e não esperado só conta como falso positivo se o caso o
 * declarar proibido **ou** se o código estiver no universo anotado — assim um
 * caso que ainda não anota determinada regra não penaliza injustamente essa
 * regra.
 */
export function evaluate(outcomes: CaseOutcome[]): EvaluationReport {
	const annotatedCodes = new Set<string>()
	for (const outcome of outcomes) {
		for (const code of outcome.expectation.expected) annotatedCodes.add(code)
		for (const code of outcome.expectation.forbidden ?? []) annotatedCodes.add(code)
	}

	const counts = new Map<string, { tp: number; fp: number; fn: number }>()
	const bump = (code: string, key: "tp" | "fp" | "fn") => {
		const current = counts.get(code) ?? { tp: 0, fp: 0, fn: 0 }
		current[key] += 1
		counts.set(code, current)
	}

	const cases: EvaluationReport["cases"] = []
	let tp = 0
	let fp = 0
	let fn = 0

	for (const outcome of outcomes) {
		const produced = new Set(outcome.produced)
		const expected = new Set(outcome.expectation.expected)

		const missing = [...expected].filter((code) => !produced.has(code))
		const unexpected = [...produced].filter((code) => !expected.has(code) && annotatedCodes.has(code))

		for (const code of expected) {
			if (produced.has(code)) {
				tp += 1
				bump(code, "tp")
			} else {
				fn += 1
				bump(code, "fn")
			}
		}

		for (const code of unexpected) {
			fp += 1
			bump(code, "fp")
		}

		cases.push({ id: outcome.id, missing, unexpected })
	}

	const byCode: Record<string, Metrics> = {}
	for (const [code, value] of counts) byCode[code] = metricsFrom(value.tp, value.fp, value.fn)

	return { overall: metricsFrom(tp, fp, fn), by_code: byCode, cases }
}
