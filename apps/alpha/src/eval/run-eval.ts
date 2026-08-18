#!/usr/bin/env bun
/**
 * Harness de avaliação.
 *
 *   bun run eval           # roda o golden set das checagens determinísticas
 *
 * Mede precisão e recall por código de achado e no agregado. É o instrumento
 * que diz se um ajuste de limiar ou de prompt melhorou ou piorou — sem ele, a
 * calibração vira impressão.
 *
 * Só as checagens cruzadas são exercitadas: elas rodam sem modelo e sem banco,
 * o que torna esta execução determinística e utilizável em CI. As regras
 * julgadas por LLM entram quando houver ETP/TR reais anotados, porque medir
 * modelo contra caso inventado mede concordância com quem inventou o caso.
 */

import { runCrossChecks } from "../compliance/cross-checks.ts"
import { GOLDEN_CASES } from "./golden/cases.ts"
import { type CaseOutcome, evaluate } from "./metrics.ts"

const outcomes: CaseOutcome[] = GOLDEN_CASES.map((testCase) => ({
	id: testCase.id,
	produced: runCrossChecks(testCase.payload)
		.filter((check) => check.status === "INCONFORME")
		.map((check) => check.code),
	expectation: testCase.expectation,
}))

const report = evaluate(outcomes)

const percent = (value: number) => `${(value * 100).toFixed(1)}%`

console.info(`\n📏 Golden set — ${GOLDEN_CASES.length} caso(s) sintético(s)\n`)
console.info(`   precisão: ${percent(report.overall.precision)}  recall: ${percent(report.overall.recall)}  F1: ${percent(report.overall.f1)}`)
console.info(`   TP=${report.overall.true_positives}  FP=${report.overall.false_positives}  FN=${report.overall.false_negatives}\n`)

console.info("   por código:")
for (const [code, metrics] of Object.entries(report.by_code)) {
	console.info(
		`     ${code.padEnd(46)} P=${percent(metrics.precision).padStart(6)}  R=${percent(metrics.recall).padStart(6)}  (TP=${metrics.true_positives} FP=${metrics.false_positives} FN=${metrics.false_negatives})`
	)
}

const failing = report.cases.filter((testCase) => testCase.missing.length > 0 || testCase.unexpected.length > 0)

if (failing.length > 0) {
	console.info("\n   casos com divergência:")
	for (const testCase of failing) {
		console.info(`     ${testCase.id}`)
		if (testCase.missing.length > 0) console.info(`       não produzidos: ${testCase.missing.join(", ")}`)
		if (testCase.unexpected.length > 0) console.info(`       inesperados:    ${testCase.unexpected.join(", ")}`)
	}
}

console.info("\n⚠️  Casos sintéticos — substituir por ETP/TR reais anotados antes de calibrar limiar para produção.\n")

if (report.overall.recall < 1) process.exit(1)
