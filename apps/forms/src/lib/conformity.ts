export type ConformityAnswer = "A" | "AP" | "NA" | "NO"

export type ConformityOptions = {
	weight: 1 | 3 | 5
	weightLabel: string
}

export const CONFORMITY_OPTIONS: { value: ConformityAnswer; label: string; multiplier: number | null }[] = [
	{ value: "A", label: "Atende", multiplier: 1.0 },
	{ value: "AP", label: "Atende Parcialmente", multiplier: 0.5 },
	{ value: "NA", label: "Não Atende", multiplier: 0.0 },
	{ value: "NO", label: "Não Observado", multiplier: null },
]

export const CONFORMITY_WEIGHTS: { value: 1 | 3 | 5; label: string }[] = [
	{ value: 1, label: "Desejável" },
	{ value: 3, label: "Necessário" },
	{ value: 5, label: "Essencial" },
]

export function formatConformityAnswer(val: unknown): string {
	const opt = CONFORMITY_OPTIONS.find((o) => o.value === val)
	return opt ? `${opt.value} — ${opt.label}` : String(val ?? "—")
}

type AnswerInput = {
	value: unknown
	options: unknown
}

type ScoreResult = {
	earned: number
	possible: number
	scorePct: number
	counts: Record<ConformityAnswer, number>
}

export function calculateConformityScore(answers: AnswerInput[]): ScoreResult {
	let earned = 0
	let possible = 0
	const counts: Record<ConformityAnswer, number> = { A: 0, AP: 0, NA: 0, NO: 0 }

	for (const a of answers) {
		const val = a.value as ConformityAnswer
		if (val && val in counts) counts[val]++

		const opts = a.options as ConformityOptions | null
		const weight = opts?.weight ?? 1
		const opt = CONFORMITY_OPTIONS.find((o) => o.value === val)

		if (opt && opt.multiplier !== null) {
			possible += weight
			earned += weight * opt.multiplier
		}
	}

	const scorePct = possible > 0 ? (earned / possible) * 100 : 0
	return { earned, possible, scorePct, counts }
}

export function getScoreColor(pct: number): string {
	if (pct >= 80) return "text-green-600"
	if (pct >= 50) return "text-yellow-600"
	return "text-red-600"
}

export function getScoreBgColor(pct: number): string {
	if (pct >= 80) return "bg-green-500"
	if (pct >= 50) return "bg-yellow-500"
	return "bg-red-500"
}
