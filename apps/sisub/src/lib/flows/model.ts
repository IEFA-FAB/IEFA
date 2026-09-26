/**
 * Modelo dos fluxos guiados (change `sisub-procurement-planning-flows`, D1/D2).
 *
 * Um fluxo é uma lista de etapas sobre telas que já existem. O status de cada etapa sai dos dados
 * a cada leitura; ninguém marca etapa como feita. Cada pendência diz quem resolve e, quando é o
 * próprio usuário, leva à tela que resolve. Pendência de outro módulo não tem link: quem abre a
 * Gestão Unidade em geral não abre a Gestão Cozinha, e vice-versa.
 */

export type StepStatus = "done" | "attention" | "blocked" | "todo"
export type IssueSeverity = "blocking" | "warning" | "info"

export interface FlowAction {
	label: string
	/** Caminho concreto (params já interpolados). */
	href: string
}

export interface FlowIssue {
	severity: IssueSeverity
	message: string
	action?: FlowAction
}

export interface FlowStep {
	id: string
	title: string
	/** O objetivo da etapa, numa frase, do ponto de vista de quem usa. */
	objective: string
	status: StepStatus
	/** Resumo do que já está feito ("3 contratações, 0 conflitos"). */
	summary?: string
	issues: FlowIssue[]
	action?: FlowAction
}

/** Status da etapa pelas pendências: bloqueio vence aviso, que vence o "a fazer" da própria etapa. */
export function deriveStatusFromIssues(issues: readonly FlowIssue[], fallback: StepStatus = "done"): StepStatus {
	if (issues.some((i) => i.severity === "blocking")) return "blocked"
	if (issues.some((i) => i.severity === "warning")) return "attention"
	return fallback
}

/** O pior status entre as etapas: é o que o índice de fluxos mostra no card. */
export function computeOverallStatus(steps: readonly FlowStep[]): StepStatus {
	const order: StepStatus[] = ["blocked", "attention", "todo", "done"]
	for (const status of order) if (steps.some((s) => s.status === status)) return status
	return "done"
}

export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/** "2027-03-01" → "março/2027". */
export function formatMonthYear(isoDate: string): string {
	const [year, month] = isoDate.split("-").map(Number) as [number, number]
	return `${MONTHS[month - 1]}/${year}`
}

/** "2026-11-20T13:00:00Z" → "20/11/2026". Data civil de Brasília. */
export function formatShortDate(value: string | null | undefined): string {
	if (!value) return ""
	return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export const pluralize = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
