/**
 * Qual folha a hero mostra: a procedural ou a do mantenedor (`intendencia`).
 * Sorteada a cada carga de página, no cliente; `?acanto=<variante>` força uma —
 * para revisão, sem mexer em rota.
 */

export const ACANTHUS_VARIANTS = ["procedural", "intendencia"] as const
export type AcanthusVariant = (typeof ACANTHUS_VARIANTS)[number]

const isVariant = (value: string | null): value is AcanthusVariant => ACANTHUS_VARIANTS.some((v) => v === value)

export function pickVariant(search: string, random: () => number = Math.random): AcanthusVariant {
	const forced = new URLSearchParams(search).get("acanto")
	if (isVariant(forced)) return forced
	const index = Math.min(ACANTHUS_VARIANTS.length - 1, Math.floor(random() * ACANTHUS_VARIANTS.length))
	return ACANTHUS_VARIANTS[index] ?? "procedural"
}
