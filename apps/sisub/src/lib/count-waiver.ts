/**
 * Ressalva da aprovação da contagem (migration 20260926217000).
 *
 * O banco recusa a aprovação quando há produção concluída sem saída lançada, com SQLSTATE
 * próprio e os dias pendentes (ISO, separados por vírgula) no HINT. A tela oferece a ressalva
 * pelo CÓDIGO, nunca pelo texto da mensagem: reescrever a frase no SQL desligaria a ressalva
 * calado, e a contagem voltaria a travar.
 */

export const PENDING_PRODUCTION_SQLSTATE = "P0W01"

/** Dias pendentes do HINT, validados e em ordem. Lixo no HINT vira lista vazia, não data inventada. */
export function parsePendingProductionDays(hint: string | null | undefined): string[] {
	if (!hint) return []
	return [
		...new Set(
			hint
				.split(",")
				.map((part) => part.trim())
				.filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part))
		),
	].sort()
}

/** "2026-09-25", "2026-09-26" → "25/09 e 26/09". */
export function formatPendingProductionDays(days: readonly string[]): string {
	const labels = days.map((day) => {
		const [, month, date] = day.split("-")
		return `${date}/${month}`
	})
	if (labels.length <= 1) return labels[0] ?? ""
	return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`
}
