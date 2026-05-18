export const EVALUATION_TYPES = [
	{ value: "interna", label: "Auditoria Interna" },
	{ value: "externa", label: "Auditoria Externa" },
	{ value: "preparatoria", label: "Preparatória" },
] as const

export type EvaluationType = (typeof EVALUATION_TYPES)[number]["value"]
