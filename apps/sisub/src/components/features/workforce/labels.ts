import type { WorkforceNoteKind } from "@iefa/sisub-domain"

export const NOTE_KIND_LABELS: Record<WorkforceNoteKind, string> = {
	outsourced: "Terceirizado",
	leave: "Afastamento",
	reassigned: "Desvio de função",
	shared: "Compartilhado",
	scope: "Abrangência",
	change: "Alteração",
	counting: "Critério de contagem",
	other: "Outro",
}

/**
 * Observação que REDUZ o efetivo disponível recebe destaque de atenção; as demais são
 * contexto. A distinção é semântica, não decorativa: é o que o gestor precisa ver primeiro
 * quando olha por que o rancho está com menos gente do que declara.
 */
export const NOTE_KIND_VARIANT: Record<WorkforceNoteKind, "warning" | "secondary" | "outline"> = {
	outsourced: "warning",
	leave: "warning",
	reassigned: "warning",
	shared: "secondary",
	scope: "outline",
	change: "secondary",
	counting: "outline",
	other: "outline",
}

/** "—" para campo não informado, "0" para zero declarado. A matriz distingue os dois. */
export function formatHeadcount(value: number | undefined): string {
	return value === undefined ? "—" : String(value)
}

export function formatRatio(value: number | null): string {
	return value === null ? "—" : `${Math.round(value * 100)}%`
}

export function formatDinerLoad(value: number | null): string {
	return value === null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
}

export function formatReferenceDate(date: string): string {
	const [year, month] = date.split("-")
	const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
	return label.charAt(0).toUpperCase() + label.slice(1)
}
