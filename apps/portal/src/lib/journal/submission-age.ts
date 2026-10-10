/**
 * Severidade do tempo desde a submissão, nos limites do painel editorial: até 7 dias
 * está em dia, de 8 a 14 pede atenção, acima de 14 está atrasado. Tabela e kanban
 * leem daqui para o mesmo artigo não aparecer verde num e amarelo no outro.
 */
export type SubmissionAgeSeverity = "on-time" | "attention" | "late"

export function getSubmissionAgeSeverity(days: number): SubmissionAgeSeverity {
	if (days > 14) return "late"
	if (days > 7) return "attention"
	return "on-time"
}

const TEXT_CLASS: Record<SubmissionAgeSeverity, string> = {
	"on-time": "text-success",
	attention: "text-warning",
	late: "text-destructive font-semibold",
}

const BADGE_CLASS: Record<SubmissionAgeSeverity, string> = {
	"on-time": "bg-success/10 text-success",
	attention: "bg-warning/10 text-warning",
	late: "bg-destructive/10 text-destructive",
}

/** Classes de cor para os dias desde a submissão: só o texto (tabela) ou pílula tintada (cartão). */
export function daysSeverityClass(days: number, surface: "text" | "badge" = "text"): string {
	const severity = getSubmissionAgeSeverity(days)
	return surface === "badge" ? BADGE_CLASS[severity] : TEXT_CLASS[severity]
}
