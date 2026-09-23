/**
 * Peças puras do pedido de lanche: energia do kit, máquina de estados, validade da etiqueta
 * e consolidado de produção. Sem banco — testadas em `snack-kit.test.ts`.
 */

import type { SnackAudience, SnackClass, SnackFamily, SnackVariant } from "./snack-entitlement.ts"

// ── Energia ────────────────────────────────────────────────────────────────

/**
 * Quantidade em gramas pela unidade de medida — a MESMA heurística da tabela nutricional da
 * preparação (`useRecipeNutrition`): g/kg/mg convertidos, litro vira 1.000 g, o resto assume
 * grama (1 ml ≈ 1 g). Conversão por densidade fica fora, como lá.
 */
export function quantityToGrams(quantity: number | string, unit?: string | null): number {
	const q = Number(quantity)
	if (!Number.isFinite(q)) return 0
	const u = (unit ?? "").trim().toLowerCase()
	if (u === "kg" || u === "quilograma" || u === "quilo" || u === "l" || u === "lt" || u === "litro") return q * 1000
	if (u === "mg" || u === "miligrama") return q / 1000
	return q
}

export type EnergyRecipeInput = {
	name: string
	portionYield: number | null
	ingredients: { ingredientId: string | null; name: string; netQuantity: number | string | null; measureUnit: string | null; isOptional: boolean }[]
}

export type RecipeEnergy = {
	/** kcal por porção considerando só os insumos com composição; nulo sem rendimento ou sem dado nenhum. */
	kcalPerPortion: number | null
	/** Insumos sem valor energético — o total é parcial quando há algum. */
	missing: string[]
}

/**
 * Energia por porção: Σ (g líquidos / 100 × kcal por 100 g) ÷ rendimento. Insumo opcional
 * não entra (preparação base, como na tabela nutricional). Insumo sem composição NÃO vira
 * zero: fica em `missing`, e quem mostra o número tem que dizer que ele é parcial.
 */
export function computeRecipeEnergy(recipe: EnergyRecipeInput, kcalPer100gByIngredient: ReadonlyMap<string, number>): RecipeEnergy {
	const missing: string[] = []
	let total = 0
	let withData = 0
	for (const ingredient of recipe.ingredients) {
		if (ingredient.isOptional || !ingredient.ingredientId) continue
		const grams = quantityToGrams(ingredient.netQuantity ?? 0, ingredient.measureUnit)
		if (grams <= 0) continue
		const kcal = kcalPer100gByIngredient.get(ingredient.ingredientId)
		if (kcal == null) {
			missing.push(ingredient.name)
			continue
		}
		withData++
		total += (grams / 100) * kcal
	}
	const yieldPortions = Number(recipe.portionYield ?? 0)
	if (!(yieldPortions > 0) || withData === 0) return { kcalPerPortion: null, missing }
	return { kcalPerPortion: total / yieldPortions, missing }
}

export type KitEnergy = {
	kcal: number
	/** Todas as preparações têm energia completa. */
	complete: boolean
	/** Preparações sem rendimento/composição, ou com insumo sem composição. */
	incomplete: string[]
}

export function computeKitEnergy(items: { recipeName: string; portions: number; energy: RecipeEnergy }[]): KitEnergy {
	let kcal = 0
	const incomplete: string[] = []
	for (const item of items) {
		if (item.energy.kcalPerPortion == null || item.energy.missing.length > 0) incomplete.push(item.recipeName)
		if (item.energy.kcalPerPortion != null) kcal += item.energy.kcalPerPortion * item.portions
	}
	return { kcal: Math.round(kcal), complete: incomplete.length === 0, incomplete }
}

// ── Máquina de estados ────────────────────────────────────────────────────

export const SNACK_REQUEST_STATUSES = ["submitted", "accepted", "rejected", "in_production", "ready", "delivered", "closed", "cancelled"] as const
export type SnackRequestStatus = (typeof SNACK_REQUEST_STATUSES)[number]

export const SNACK_REQUEST_STATUS_LABELS: Record<SnackRequestStatus, string> = {
	submitted: "Enviado",
	accepted: "Aceito",
	rejected: "Recusado",
	in_production: "Em produção",
	ready: "Pronto para retirada",
	delivered: "Retirado",
	closed: "Encerrado",
	cancelled: "Cancelado",
}

const TRANSITIONS: Record<SnackRequestStatus, readonly SnackRequestStatus[]> = {
	submitted: ["accepted", "rejected", "cancelled"],
	accepted: ["in_production", "cancelled"],
	in_production: ["ready", "cancelled"],
	ready: ["delivered", "cancelled"],
	// Missão cancelada depois da retirada: o material volta ao rancho (7.4.11).
	delivered: ["closed", "cancelled"],
	rejected: [],
	closed: [],
	cancelled: [],
}

export function canTransition(from: SnackRequestStatus, to: SnackRequestStatus): boolean {
	return TRANSITIONS[from].includes(to)
}

export function isTerminalStatus(status: SnackRequestStatus): boolean {
	return TRANSITIONS[status].length === 0
}

/** O requisitante só cancela antes de a produção começar; depois disso, fala com a cozinha. */
export function requesterCanCancel(status: SnackRequestStatus): boolean {
	return status === "submitted" || status === "accepted"
}

/** Status em que o pedido está na produção (tem item no quadro). */
export function isInProductionPlan(status: SnackRequestStatus): boolean {
	return status === "accepted" || status === "in_production" || status === "ready"
}

/** Cancelar a partir destes estados significa que já houve comida produzida: não se reaproveita (7.4.4). */
export function cancelDiscardsFood(from: SnackRequestStatus): boolean {
	return from === "in_production" || from === "ready" || from === "delivered"
}

// ── Prazos ─────────────────────────────────────────────────────────────────

export const MIN_LEAD_TIME_HOURS = 24
export const DEFAULT_SHELF_LIFE_HOURS = 24

/** Antecedência contada até o que vier primeiro: retirada ou partida (7.4.10). */
export function leadTimeHours(now: Date, pickupAt: string, departureAt: string): number {
	const deadline = Math.min(Date.parse(pickupAt), Date.parse(departureAt))
	return (deadline - now.getTime()) / 3_600_000
}

export function isLateRequest(now: Date, pickupAt: string, departureAt: string): boolean {
	return leadTimeHours(now, pickupAt, departureAt) < MIN_LEAD_TIME_HOURS
}

export function labelExpiresAt(fabricatedAt: Date, shelfLifeHours: number | null): Date {
	return new Date(fabricatedAt.getTime() + (shelfLifeHours ?? DEFAULT_SHELF_LIFE_HOURS) * 3_600_000)
}

/** Data civil de Brasília (UTC−3 fixo) de um instante — é a data do quadro de produção. */
export function brasiliaCivilDate(iso: string): string {
	const shifted = new Date(Date.parse(iso) - 3 * 3_600_000)
	return shifted.toISOString().slice(0, 10)
}

// ── Snapshot do padrão e consolidado ───────────────────────────────────────

export type SnackStandardSnapshot = {
	id: string
	name: string
	family: SnackFamily
	snackClass: SnackClass
	variant: SnackVariant
	requiresGalley: boolean
	requiresOven: boolean
	shelfLifeHours: number | null
	/** Revisão trimestral do padrão no momento do pedido (7.4.18). Ausente em snapshot antigo. */
	reviewedAt?: string | null
	kcalPerKit: number | null
	kcalComplete: boolean
	items: { recipeId: string; recipeName: string; portions: number; itemGroup: string | null }[]
}

export type SnackSummaryRequest = {
	id: string
	missionDescription: string
	pickupAt: string
	waterQuantity: number
	cupQuantity: number
	iceQuantity: number
	coffeeQuantity: number
	lines: { standard: SnackStandardSnapshot; audience: SnackAudience; kits: number }[]
}

export type SnackProductionSummary = {
	standards: { standardId: string; name: string; snackClass: SnackClass; family: SnackFamily; kits: number; requestIds: string[] }[]
	recipes: { recipeId: string; recipeName: string; portions: number; requestIds: string[] }[]
	materials: { water: number; cups: number; ice: number; coffee: number }
	requestCount: number
}

/**
 * Consolidado do dia: kits por padrão → porções por preparação (somando padrões diferentes
 * que usam a mesma preparação) → material do Anexo E. Cada total aponta para os pedidos de
 * origem, para a cozinha conferir de onde veio o número.
 */
export function buildSnackProductionSummary(requests: SnackSummaryRequest[]): SnackProductionSummary {
	const standards = new Map<string, SnackProductionSummary["standards"][number]>()
	const recipes = new Map<string, SnackProductionSummary["recipes"][number]>()
	const materials = { water: 0, cups: 0, ice: 0, coffee: 0 }

	for (const request of requests) {
		materials.water += request.waterQuantity
		materials.cups += request.cupQuantity
		materials.ice += request.iceQuantity
		materials.coffee += request.coffeeQuantity
		for (const item of request.lines) {
			if (item.kits <= 0) continue
			const std = standards.get(item.standard.id) ?? {
				standardId: item.standard.id,
				name: item.standard.name,
				snackClass: item.standard.snackClass,
				family: item.standard.family,
				kits: 0,
				requestIds: [],
			}
			std.kits += item.kits
			if (!std.requestIds.includes(request.id)) std.requestIds.push(request.id)
			standards.set(item.standard.id, std)

			for (const recipe of item.standard.items) {
				const row = recipes.get(recipe.recipeId) ?? { recipeId: recipe.recipeId, recipeName: recipe.recipeName, portions: 0, requestIds: [] }
				row.portions += recipe.portions * item.kits
				if (!row.requestIds.includes(request.id)) row.requestIds.push(request.id)
				recipes.set(recipe.recipeId, row)
			}
		}
	}

	return {
		standards: [...standards.values()].sort(
			(a, b) => a.family.localeCompare(b.family) || a.snackClass.localeCompare(b.snackClass) || a.name.localeCompare(b.name, "pt-BR")
		),
		recipes: [...recipes.values()].sort((a, b) => a.recipeName.localeCompare(b.recipeName, "pt-BR")),
		materials,
		requestCount: requests.length,
	}
}

/** Revisão trimestral (7.4.18): vencida sem data ou com mais de 3 meses. */
export function isStandardReviewOverdue(reviewedAt: string | null, today: string): boolean {
	if (!reviewedAt) return true
	const limit = new Date(`${reviewedAt}T00:00:00Z`)
	limit.setUTCMonth(limit.getUTCMonth() + 3)
	return limit.toISOString().slice(0, 10) < today
}
