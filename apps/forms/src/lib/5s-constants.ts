export const EVALUATION_TYPES = [
	{ value: "auditoria_interna", label: "Auditoria Interna" },
	{ value: "auditoria_externa", label: "Auditoria Externa" },
	{ value: "preparatoria", label: "Preparatória" },
] as const

export type EvaluationType = (typeof EVALUATION_TYPES)[number]["value"]
