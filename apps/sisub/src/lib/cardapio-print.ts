import { ALLERGEN_LABELS, normalizeAllergens, type RecipeIngredientDigest } from "@iefa/sisub-domain"

/**
 * Regras do cardápio semanal impresso (tela, PDF e DOCX), fora do componente para serem
 * testáveis: o que sai em negrito e o que entra na lista de preparações.
 */

/**
 * Grupos que saem em negrito na grade impressa — o prato que dá nome à refeição.
 *
 * São três porque nem toda refeição tem "prato principal": na ceia esse papel é
 * do `lanche` (salgado assado, pão com frios) e no café é da `proteina` (ovos e
 * frios) — que é exatamente o que estava em `prato_principal` antes de a
 * migration remapear o café. Sem os dois, a linha daquela refeição sai inteira
 * em peso normal e a folha perde a hierarquia de leitura.
 */
const MAIN_DISH_GROUPS = new Set(["prato_principal", "lanche", "proteina"])

/** O prato principal sai em negrito na grade; os demais grupos, em peso normal. */
export function isMainDish(group: string | null | undefined): boolean {
	return group != null && MAIN_DISH_GROUPS.has(group)
}

/**
 * Ingredientes na lista de preparações. Nunca com quantidade — a folha é para o comensal
 * saber o que come, não para a cozinha produzir.
 */
export const INGREDIENTS_MODES = ["none", "allergens", "all"] as const
export type IngredientsMode = (typeof INGREDIENTS_MODES)[number]

export const INGREDIENTS_MODE_LABELS: Record<IngredientsMode, string> = {
	none: "Não mostrar ingredientes",
	allergens: "Somente alergênicos",
	all: "Todos os ingredientes (sem quantidade)",
}

/**
 * Teto padrão, em % do efetivo da refeição, do que conta como preparação da mesa de comando.
 * Porcentagem pequena num plano semanal não é opção do rancho: é o prato servido a poucos
 * (mesa de comando), que a cozinha produz mas o comensal não escolhe.
 */
export const DEFAULT_COMMAND_TABLE_MAX_PROPORTION = 5

export type CardapioPrintOptions = {
	showMethod: boolean
	ingredients: IngredientsMode
	/** Tira da folha as preparações da mesa de comando (porcentagem até `commandTableMaxProportion`). */
	hideCommandTable: boolean
	commandTableMaxProportion: number
	/** Cada preparação da grade ganha a tinta do seu grupo, com legenda. */
	groupColors: boolean
}

/**
 * Padrão = a folha de antes das opções (modo de preparo, sem ingredientes), já sem a mesa de
 * comando: a folha é afixada para o comensal, e o prato dela não está à disposição dele.
 */
export const DEFAULT_PRINT_OPTIONS: CardapioPrintOptions = {
	showMethod: true,
	ingredients: "none",
	hideCommandTable: true,
	commandTableMaxProportion: DEFAULT_COMMAND_TABLE_MAX_PROPORTION,
	groupColors: true,
}

/**
 * Item da mesa de comando: dimensionado por porcentagem, e ela não passa do teto. Quantidade
 * direta ("12 pax") não conta — é ela que dimensiona o item quando existe (`resolveItemDemand`),
 * e a porcentagem que sobrar ao lado não diz nada sobre ele.
 */
export function isCommandTableItem(
	item: { headcount_override?: number | null; recommended_proportion?: number | null },
	options: Pick<CardapioPrintOptions, "hideCommandTable" | "commandTableMaxProportion">
): boolean {
	if (!options.hideCommandTable || item.headcount_override != null || item.recommended_proportion == null) return false
	return item.recommended_proportion <= options.commandTableMaxProportion
}

/**
 * Demanda impressa ao lado da preparação. Só o efetivo fixo ("120 pax"): a porcentagem é
 * dado de planejamento da cozinha e poluía a folha que o comensal lê.
 */
export function formatPrintedDemand(item: { headcount_override?: number | null }): string | null {
	return item.headcount_override != null ? `${item.headcount_override} pax` : null
}

/**
 * Tinta de cada grupo na grade impressa (hex sem `#`, o formato que o DOCX pede). Tons claros
 * de propósito: o texto segue preto e legível, e a folha em impressora P&B vira cinza claro.
 * Chave repetida entre conjuntos (`bebida`, `complemento`) tem a mesma cor em toda refeição.
 */
const GROUP_PRINT_COLORS: Record<string, string> = {
	salada: "DCFCE7",
	prato_principal: "FEE2E2",
	acompanhamento: "FEF9C3",
	guarnicao: "FFEDD5",
	bebida: "DBEAFE",
	sobremesa: "FCE7F3",
	pao: "F5E6D3",
	proteina: "EDE9FE",
	complemento: "CCFBF1",
	fruta: "ECFCCB",
	lanche: "FAE8FF",
	entrada: "E0E7FF",
	volante: "CFFAFE",
}

/** Grupo criado pela cozinha, fora da paleta: cor estável derivada da chave. */
const FALLBACK_PRINT_COLORS = ["E0F2FE", "FEF3C7", "F3E8FF", "D1FAE5", "FFE4E6", "E2E8F0"]

/** Cor de impressão do grupo; `null` para preparação sem grupo (sai sem tinta). */
export function groupPrintColor(group: string | null | undefined): string | null {
	if (group == null) return null
	const known = GROUP_PRINT_COLORS[group]
	if (known) return known
	let hash = 0
	for (const ch of group) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
	return FALLBACK_PRINT_COLORS[hash % FALLBACK_PRINT_COLORS.length]
}

/** Uma ficha distinta do cardápio, antes das opções de impressão. */
export type PreparationSource = { id: string; name: string; version: string; prePreparation: string | null; method: string | null }

export type PreparationEntry = {
	id: string
	name: string
	version: string
	/** `null` quando o modo de preparo está desligado ou a ficha não tem o texto. */
	prePreparation: string | null
	method: string | null
	/** Modo "todos": nomes dos ingredientes. `null` fora desse modo. */
	ingredients: string[] | null
	/** Modo "alergênicos": rótulos dos grupos presentes (pode ser vazio). `null` fora desse modo. */
	allergens: string[] | null
	/** Preparações dentro da ficha cujos alergênicos ninguém consegue afirmar. */
	unverified: string[]
}

/**
 * Monta a lista de preparações conforme as opções. Uma ficha entra quando tem algo a mostrar:
 * texto de preparo (com o modo ligado) ou ingredientes (com o modo de ingredientes ligado).
 * Ficha sem ingrediente nenhum não ganha "nenhum alergênico" — seria afirmar o que não se sabe.
 */
export function buildPreparationEntries(
	sources: readonly PreparationSource[],
	digests: ReadonlyMap<string, RecipeIngredientDigest> | undefined,
	options: Pick<CardapioPrintOptions, "showMethod" | "ingredients">
): PreparationEntry[] {
	const entries: PreparationEntry[] = []
	for (const source of sources) {
		const prePreparation = options.showMethod ? source.prePreparation : null
		const method = options.showMethod ? source.method : null
		const digest = options.ingredients === "none" ? undefined : digests?.get(source.id)
		const hasIngredients = (digest?.ingredients.length ?? 0) > 0

		let ingredients: string[] | null = null
		let allergens: string[] | null = null
		if (digest && hasIngredients && options.ingredients === "all") ingredients = digest.ingredients.map((i) => i.name)
		if (digest && hasIngredients && options.ingredients === "allergens")
			allergens = normalizeAllergens(digest.ingredients.flatMap((i) => i.allergens)).map((a) => ALLERGEN_LABELS[a])

		if (!prePreparation && !method && ingredients == null && allergens == null) continue
		entries.push({
			id: source.id,
			name: source.name,
			version: source.version,
			prePreparation,
			method,
			ingredients,
			allergens,
			unverified: allergens != null ? (digest?.unresolved ?? []) : [],
		})
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Texto da linha de alergênicos, igual na tela, no PDF e no DOCX. */
export function describeAllergens(entry: Pick<PreparationEntry, "allergens" | "unverified">): string | null {
	if (entry.allergens == null) return null
	const listed = entry.allergens.length > 0 ? entry.allergens.join(", ") : "nenhum marcado nos insumos"
	const unverified = entry.unverified.length > 0 ? ` (não conferido: ${entry.unverified.join(", ")})` : ""
	return `${listed}${unverified}`
}
