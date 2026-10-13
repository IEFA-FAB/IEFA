/**
 * @module lib/compatibilidade/format
 * Extraído de routes/analista-compatibilidade.tsx (port do analistacompatibilidade):
 * auxiliares de texto usados pelo parser, pela mensagem e pela tela.
 */

export function normalizeKey(key: string) {
	return key
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
}

export function formatCurrency(value: number | string) {
	if (typeof value === "string") return value
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}
