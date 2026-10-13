import type { FolderConference, FolderReviewStats } from "@/lib/ingredient-tree"

/** Formata a data ISO da revisão como "09/06/2026" (curto, pt-BR). */
export function formatReviewDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Todos os insumos da subárvore da pasta já foram conferidos ao menos uma vez. */
export function isFolderFullyReviewed(review: FolderReviewStats): boolean {
	return review.reviewed === review.total
}

/** Tooltip do progresso de conferência da pasta. */
export function describeFolderReview(review: FolderReviewStats): string {
	return review.oldestReviewedAt && review.reviewed === review.total
		? `Todos os ${review.total} insumos conferidos. O mais antigo em ${formatReviewDate(review.oldestReviewedAt)}.`
		: `${review.total - review.reviewed} de ${review.total} insumos ainda não conferidos.`
}

/**
 * Quem conferiu — o nome pode faltar em registro antigo, e aí a frase simplesmente
 * não menciona autor em vez de dizer "por null".
 */
export function formatConferenceAuthor(conference: FolderConference | undefined): string {
	return conference?.reviewedByName ? ` por ${conference.reviewedByName}` : ""
}

/** Tooltip do carimbo de conferência da pasta (só existe quando a pasta tem `reviewedAt`). */
export function describeFolderConference(conference: FolderConference, reviewedAt: string): string {
	const byWhom = formatConferenceAuthor(conference)
	return conference.addedSince > 0
		? `Conferida em ${formatReviewDate(reviewedAt)}${byWhom}; ${
				conference.addedSince === 1 ? "1 item entrou" : `${conference.addedSince} itens entraram`
			} depois.`
		: `Conferida em ${formatReviewDate(reviewedAt)}${byWhom}. Nada entrou desde então.`
}
