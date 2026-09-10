/**
 * @module checklist
 * Recorrência do cronograma da seção.
 *
 * A recorrência é COLUNA (`recurrence` + `business_day`), não texto livre. Antes a
 * tela extraía o número do rótulo com `/(\d+)/` e lia o "1" de "1x por semana"
 * como "1º dia útil do mês" — uma tarefa semanal anunciava a data do começo do
 * mês. O rótulo segue existindo porque é o que o operador reconhece, mas quem
 * manda na data é a coluna, e o rótulo é DERIVADO dela.
 */

export const CHECKLIST_RECURRENCES = ["monthly_business_day", "monthly", "weekly"] as const

export type ChecklistRecurrence = (typeof CHECKLIST_RECURRENCES)[number]

/** Maior valor aceito em `business_day` — espelha o CHECK da coluna. */
export const MAX_BUSINESS_DAY = 23

export const RECURRENCE_LABELS: Record<ChecklistRecurrence, string> = {
	monthly_business_day: "Nº dia útil do mês",
	monthly: "Mensal",
	weekly: "1x por semana",
}

/**
 * Rótulo humano de uma recorrência — o texto do badge e o valor gravado em
 * `deadline`.
 *
 * O ordinal usa `º` (indicador ordinal masculino), não `°` (grau). O seed tinha os
 * dois, e um deles quebraria qualquer leitura que voltasse a depender do texto.
 */
export function deadlineLabel(recurrence: ChecklistRecurrence, businessDay: number | null): string {
	if (recurrence === "monthly_business_day" && businessDay) return `${businessDay}º dia útil do mês`
	return RECURRENCE_LABELS[recurrence]
}

/** Como o prazo se relaciona com hoje. Governa a cor do item no cronograma. */
export type DeadlineStatus = "done" | "overdue" | "today" | "upcoming" | "scheduled"

/** Quantos dias à frente um prazo ainda conta como "próximo" no sino. */
export const UPCOMING_WINDOW_DAYS = 7

export function deadlineStatus(dueOn: string, doneAt: string | null, today: string, upcomingUntil: string): DeadlineStatus {
	if (doneAt) return "done"
	if (dueOn < today) return "overdue"
	if (dueOn === today) return "today"
	return dueOn <= upcomingUntil ? "upcoming" : "scheduled"
}

/** Um responsável já resolvido pela view — o par (id, melhor rótulo). */
export type Assignee = { id: string; label: string }

/**
 * Lê a coluna `assignees` da view, que é `jsonb`.
 *
 * O tipo gerado a partir de uma coluna jsonb é `Json`, ou seja, "qualquer coisa":
 * o compilador não sabe o formato e não protege contra ele mudar. A checagem aqui
 * é a fronteira — descartar o que não tem a forma esperada mantém a tela viva se
 * a view for alterada, em vez de derrubá-la num `.map` de `undefined`.
 */
export function parseAssignees(value: unknown): Assignee[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((entry) =>
		entry && typeof entry === "object" && typeof (entry as Assignee).id === "string" && typeof (entry as Assignee).label === "string"
			? [{ id: (entry as Assignee).id, label: (entry as Assignee).label }]
			: []
	)
}
