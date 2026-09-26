/**
 * Número digitado em pt-BR → valor; vazio → `null`; texto inválido → `NaN`.
 *
 * Ponto é separador de milhar: "1.500" é mil e quinhentos, que é também como o campo mostra o
 * valor. Só vira decimal quando não pode ser milhar ("12.5", "3.14"), para quem digita no
 * padrão americano. Com vírgula, a vírgula é o decimal e todo ponto é milhar.
 */
export function parseDecimal(raw: string): number | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	let normalized: string
	if (trimmed.includes(",")) normalized = trimmed.replace(/\./g, "").replace(",", ".")
	else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) normalized = trimmed.replace(/\./g, "")
	else normalized = trimmed
	const value = Number(normalized)
	return Number.isFinite(value) && value >= 0 ? value : Number.NaN
}
