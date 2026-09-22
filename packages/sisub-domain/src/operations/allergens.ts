/**
 * Alergênicos do insumo — grupos da RDC ANVISA 26/2015.
 *
 * O vocabulário é FECHADO e espelha o CHECK de `kitchen.ingredient.allergens`
 * (migration 20260922120000); `allergens.sql-contract.test.ts` confere os dois lados.
 * Valor de domínio fica em português: é o nome do grupo na norma, e vira dado gravado.
 *
 * A ordem do array é a ordem de leitura na tela e na folha impressa.
 */

export const ALLERGENS = ["gluten", "leite", "ovos", "soja", "amendoim", "castanhas", "peixes", "crustaceos", "latex_natural"] as const

export type Allergen = (typeof ALLERGENS)[number]

/** Rótulo curto, o que sai no cardápio impresso. */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
	gluten: "Glúten",
	leite: "Leite",
	ovos: "Ovos",
	soja: "Soja",
	amendoim: "Amendoim",
	castanhas: "Castanhas",
	peixes: "Peixes",
	crustaceos: "Crustáceos",
	latex_natural: "Látex natural",
}

/** O que cada grupo cobre, para quem marca o insumo não ter de abrir a norma. */
export const ALLERGEN_DESCRIPTIONS: Record<Allergen, string> = {
	gluten: "Trigo, centeio, cevada, aveia e derivados",
	leite: "Leite de qualquer mamífero e derivados (queijo, manteiga, creme de leite)",
	ovos: "Ovos e derivados (maionese, massa com ovos)",
	soja: "Soja e derivados (proteína texturizada, shoyu, tofu)",
	amendoim: "Amendoim e derivados",
	castanhas: "Amêndoa, avelã, caju, castanha-do-pará, macadâmia, nozes, pecã, pistache, pinoli",
	peixes: "Peixes e derivados",
	crustaceos: "Camarão, lagosta, caranguejo, siri",
	latex_natural: "Látex natural",
}

export function isAllergen(value: unknown): value is Allergen {
	return typeof value === "string" && (ALLERGENS as readonly string[]).includes(value)
}

/**
 * Deduplica, descarta o que não é do vocabulário e devolve na ordem canônica de `ALLERGENS`.
 * O banco guarda `text[]`; a leitura passa por aqui para a tela não depender da ordem gravada.
 */
export function normalizeAllergens(values: readonly unknown[] | null | undefined): Allergen[] {
	const present = new Set((values ?? []).filter(isAllergen))
	return ALLERGENS.filter((a) => present.has(a))
}
