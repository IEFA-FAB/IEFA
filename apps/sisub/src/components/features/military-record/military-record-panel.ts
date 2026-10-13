/**
 * Derivações puras do `MilitaryRecordPanel` que são só do sisub: onde mostrar o retorno de cada
 * ação e quando há alternativas a oferecer. O que vale também para o sucont está em
 * `describeSaramPanel` (`@iefa/database/saram-link`).
 */
import { hasSaramAction, SARAM_FALLBACK_ERROR_MESSAGE, type SaramLinkStatusName, type SaramOutcomeView, type SaramStatus } from "@iefa/database/saram-link"

export type FeedbackSource = "top" | "cpf" | "suffix" | "request"
export type Feedback = SaramOutcomeView & { source: FeedbackSource }

export function getErrorMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : SARAM_FALLBACK_ERROR_MESSAGE
}

/** O servidor oferece algum caminho além da sugestão: CPF, pedido à administração ou conta de seção. */
export function offersSaramAlternatives(status: Pick<SaramStatus, "actions">): boolean {
	return hasSaramAction(status, "verify_cpf") || hasSaramAction(status, "request_link") || hasSaramAction(status, "set_institutional")
}

export function getAlternativesTitle(statusName: SaramLinkStatusName, showAlternatives: boolean): string {
	if (statusName === "legacy") return "Se quiser, confirme o vínculo agora"
	return showAlternatives ? "Então vamos por outro caminho" : "Como vincular seu SARAM"
}

/**
 * Erro de conferência fica junto do formulário (a pessoa vai redigitar); o resto, no topo.
 * Se o estado mudou (a última tentativa bloqueou), o formulário da origem some: vai para o topo.
 */
export function getFeedbackSource(
	outcomeKind: SaramOutcomeView["kind"],
	resultStatus: SaramLinkStatusName,
	from: SaramLinkStatusName,
	source: FeedbackSource
): FeedbackSource {
	return outcomeKind === "error" && resultStatus === from ? source : "top"
}

/** O retorno que pertence a um formulário, ou `null`. */
export function selectFeedback(feedback: Feedback | null, source: FeedbackSource): Feedback | null {
	return feedback && feedback.source === source ? feedback : null
}
