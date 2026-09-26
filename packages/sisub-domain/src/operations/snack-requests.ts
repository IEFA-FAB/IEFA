/**
 * Pedido de Lanche de Bordo/Apoio — Módulo 7 do Manual SISUB (SDAB, 27 NOV 2025).
 * Change OpenSpec: `sisub-snack-support-requests`.
 *
 * Três pontas:
 *   - PADRÃO: uma exceção (`menu_template`) classificada como padrão de lanche. Num padrão,
 *     `headcount_override` do item é porções por kit (ver migration 20260922120000).
 *   - PEDIDO: o comensal (`diner:1`) preenche o Anexo E, a calculadora
 *     (`utils/snack-entitlement.ts`) sugere classe e dotação, e ele escolhe padrões pedíveis da
 *     cozinha apoiadora. O requisitante é SEMPRE o usuário da sessão.
 *   - COZINHA: aceite/recusa (`kitchen:2`), andamento (`kitchen:2` ou `kitchen-production:1`),
 *     retirada e cautela. A cozinha do pedido é lida da LINHA, nunca do input (#158/#322).
 *
 * Todo passo da máquina de estados trava a linha do pedido (`for update`), confere a
 * transição e grava o evento na mesma transação — aceite e recusa simultâneos resultam em
 * uma transição e um conflito, nunca em duas.
 *
 * O aceite MATERIALIZA o pedido no quadro de produção: um `daily_menu` do tipo de refeição de
 * sistema "Lanches de Bordo/Apoio" na data de retirada (Brasília) e um `menu_item` por
 * (linha × preparação), marcado com `origin_snack_request_id` — é por ele que o quadro
 * discrimina o que é lanche de qual pedido. Recusa/cancelamento retira os itens do quadro
 * (soft-delete); comida já produzida não volta ao estoque (7.4.4).
 */

import {
	dailyMenuInKitchen,
	foodNutrientValueInNutritionReference,
	ingredientNutrientInKitchen,
	ingredientNutritionReferenceInKitchen,
	kitchenInKitchen,
	menuItemsInKitchen,
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	nutrientComponentMappingInNutritionReference,
	nutrientInKitchen,
	productionTaskInKitchen,
	type SisubDb,
	snackRequestEventInKitchen,
	snackRequestInKitchen,
	snackRequestLineInKitchen,
	snackRequestMaterialInKitchen,
	unitsInCore,
	userDataInCore,
	userMilitaryDataInCore,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { requireAssetRead, requireAssetWriteForScope, resolveAssetOwner } from "../guards/asset-ownership.ts"
import { requireKitchen, requireKitchenFloorWrite, requirePermission } from "../guards/require-permission.ts"
import type {
	AdvanceSnackRequest,
	CancelMySnackRequest,
	CreateSnackRequest,
	DecideSnackRequest,
	GetSnackStandardEnergy,
	KitchenCancelSnackRequest,
	ListKitchenSnackRequests,
	ListOrderableStandards,
	RegisterSnackMaterialReturn,
	RegisterSnackPickup,
	SetSnackClassification,
	SnackProductionSummaryInput,
	SnackRequestId,
} from "../schemas/snack.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"
import {
	calculateSnackEntitlement,
	findEntitlementDivergences,
	type SnackAudience,
	type SnackClass,
	type SnackEntitlement,
	type SnackFamily,
	type SnackVariant,
} from "../utils/snack-entitlement.ts"
import {
	brasiliaCivilDate,
	buildSnackProductionSummary,
	cancelDiscardsFood,
	canTransition,
	computeKitEnergy,
	computeRecipeEnergy,
	isInProductionPlan,
	isLateRequest,
	requesterCanCancel,
	type SnackProductionSummary,
	type SnackRequestStatus,
	type SnackStandardSnapshot,
} from "../utils/snack-kit.ts"
import { resolveSnackMealType } from "./meal-types.ts"
import { fetchRecipesWithIngredients } from "./templates.ts"

type SnackRequestRow = Tables<"snack_request">
type SnackRequestLineRow = Tables<"snack_request_line">
type SnackRequestEventRow = Tables<"snack_request_event">
type SnackRequestMaterialRow = Tables<"snack_request_material">
type Tx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

export type SnackRequestLine = Omit<SnackRequestLineRow, "standard_snapshot"> & { standard_snapshot: SnackStandardSnapshot }
export type SnackRequestPerson = { user_id: string; label: string }
export type SnackRequestSummary = Omit<SnackRequestRow, "calculator_snapshot"> & {
	kitchen_name: string | null
	lines: SnackRequestLine[]
	requester: SnackRequestPerson
	/** Snapshot da calculadora na hora do envio: entrada + sugestão. */
	calculator_snapshot: { input: CreateSnackRequestInputSnapshot; entitlement: SnackEntitlement; divergences: string[] }
	is_late: boolean
}
export type SnackRequestDetail = SnackRequestSummary & {
	events: (SnackRequestEventRow & { actor_label: string })[]
	materials: SnackRequestMaterialRow[]
	production: { total: number; done: number; in_progress: number }
}
type CreateSnackRequestInputSnapshot = Pick<
	CreateSnackRequest,
	| "missionKind"
	| "departureAt"
	| "totalMinutes"
	| "longestLegMinutes"
	| "stopsWithoutMess"
	| "groundMinutes"
	| "isOperational"
	| "hasGalley"
	| "hasOven"
	| "crewCount"
	| "paxCount"
>

// ── Energia (kcal por 100 g, efetiva: tabela alimentar vinculada, senão manual) ──

async function loadEnergyPer100g(db: Pick<SisubDb, "select">, ingredientIds: string[]): Promise<Map<string, number>> {
	const energy = new Map<string, number>()
	if (ingredientIds.length === 0) return energy

	const linked = await runQuery("FETCH_FAILED", () =>
		db
			.select({ ingredientId: ingredientNutritionReferenceInKitchen.ingredientId })
			.from(ingredientNutritionReferenceInKitchen)
			.where(inArray(ingredientNutritionReferenceInKitchen.ingredientId, ingredientIds))
	)
	const linkedIds = new Set(linked.map((r) => r.ingredientId))

	if (linkedIds.size > 0) {
		const rows = await runQuery("FETCH_FAILED", () =>
			db
				.select({
					ingredientId: ingredientNutritionReferenceInKitchen.ingredientId,
					kcal: sql<
						number | null
					>`(${foodNutrientValueInNutritionReference.value} * ${nutrientComponentMappingInNutritionReference.conversionMultiplier}) + ${nutrientComponentMappingInNutritionReference.conversionOffset}`,
				})
				.from(ingredientNutritionReferenceInKitchen)
				.innerJoin(
					foodNutrientValueInNutritionReference,
					eq(ingredientNutritionReferenceInKitchen.foodRevisionId, foodNutrientValueInNutritionReference.foodRevisionId)
				)
				.innerJoin(
					nutrientComponentMappingInNutritionReference,
					eq(foodNutrientValueInNutritionReference.componentId, nutrientComponentMappingInNutritionReference.componentId)
				)
				.innerJoin(nutrientInKitchen, eq(nutrientComponentMappingInNutritionReference.nutrientId, nutrientInKitchen.id))
				.where(
					and(
						inArray(ingredientNutritionReferenceInKitchen.ingredientId, [...linkedIds]),
						eq(nutrientComponentMappingInNutritionReference.isPreferred, true),
						eq(nutrientInKitchen.isEnergyValue, true),
						isNull(nutrientInKitchen.deletedAt)
					)
				)
		)
		for (const row of rows) if (row.kcal != null && Number.isFinite(Number(row.kcal))) energy.set(row.ingredientId, Number(row.kcal))
	}

	// Vínculo com tabela alimentar SUBSTITUI a composição manual (mesma regra de
	// `listIngredientEffectiveNutrients`): só quem não tem vínculo cai no manual.
	const manualIds = ingredientIds.filter((id) => !linkedIds.has(id))
	if (manualIds.length > 0) {
		const rows = await runQuery("FETCH_FAILED", () =>
			db
				.select({ ingredientId: ingredientNutrientInKitchen.ingredientId, kcal: ingredientNutrientInKitchen.nutrientValue })
				.from(ingredientNutrientInKitchen)
				.innerJoin(nutrientInKitchen, eq(ingredientNutrientInKitchen.nutrientId, nutrientInKitchen.id))
				.where(
					and(
						inArray(ingredientNutrientInKitchen.ingredientId, manualIds),
						isNull(ingredientNutrientInKitchen.deletedAt),
						eq(nutrientInKitchen.isEnergyValue, true),
						isNull(nutrientInKitchen.deletedAt)
					)
				)
		)
		for (const row of rows) if (row.kcal != null && Number.isFinite(Number(row.kcal))) energy.set(row.ingredientId, Number(row.kcal))
	}
	return energy
}

type StandardRow = {
	id: string
	name: string | null
	kitchenId: number | null
	snackFamily: string | null
	snackClass: string | null
	snackVariant: string | null
	requiresGalley: boolean
	requiresOven: boolean
	shelfLifeHours: number | null
	reviewedAt: string | null
	orderable: boolean
}

const STANDARD_COLS = {
	id: menuTemplateInKitchen.id,
	name: menuTemplateInKitchen.name,
	kitchenId: menuTemplateInKitchen.kitchenId,
	snackFamily: menuTemplateInKitchen.snackFamily,
	snackClass: menuTemplateInKitchen.snackClass,
	snackVariant: menuTemplateInKitchen.snackVariant,
	requiresGalley: menuTemplateInKitchen.requiresGalley,
	requiresOven: menuTemplateInKitchen.requiresOven,
	shelfLifeHours: menuTemplateInKitchen.shelfLifeHours,
	reviewedAt: menuTemplateInKitchen.reviewedAt,
	orderable: menuTemplateInKitchen.orderable,
} as const

export type SnackStandardEnergyDetail = {
	kcalPerKit: number | null
	complete: boolean
	incomplete: string[]
	recipes: { recipeId: string; recipeName: string; portions: number; kcalPerPortion: number | null; missing: string[] }[]
}

/**
 * Snapshot + energia de padrões. O que o pedido grava é o que o comensal viu: nome, classe,
 * itens com porções por kit e kcal do kit naquele instante — o padrão pode mudar depois.
 */
async function buildStandardSnapshots(
	db: SisubDb,
	standards: StandardRow[]
): Promise<Map<string, { snapshot: SnackStandardSnapshot; energy: SnackStandardEnergyDetail }>> {
	const out = new Map<string, { snapshot: SnackStandardSnapshot; energy: SnackStandardEnergyDetail }>()
	if (standards.length === 0) return out

	const items = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				templateId: menuTemplateItemsInKitchen.menuTemplateId,
				recipeId: menuTemplateItemsInKitchen.recipeId,
				portions: menuTemplateItemsInKitchen.headcountOverride,
				itemGroup: menuTemplateItemsInKitchen.itemGroup,
				sortOrder: menuTemplateItemsInKitchen.sortOrder,
			})
			.from(menuTemplateItemsInKitchen)
			.where(
				inArray(
					menuTemplateItemsInKitchen.menuTemplateId,
					standards.map((s) => s.id)
				)
			)
			.orderBy(asc(menuTemplateItemsInKitchen.sortOrder))
	)
	const recipeIds = [...new Set(items.map((i) => i.recipeId).filter((id): id is string => id != null))]
	const recipes = recipeIds.length > 0 ? await fetchRecipesWithIngredients(db, recipeIds) : []
	const recipeById = new Map(recipes.map((r) => [r.id, r]))
	const ingredientIds = [
		...new Set(recipes.flatMap((r) => r.recipeIngredientsInKitchens.map((ri) => ri.ingredientId).filter((id): id is string => id != null))),
	]
	const energyByIngredient = await loadEnergyPer100g(db, ingredientIds)

	for (const standard of standards) {
		const own = items.filter((i) => i.templateId === standard.id && i.recipeId != null)
		const recipeRows = own.map((item) => {
			const recipe = recipeById.get(item.recipeId as string)
			// Porções por kit: item sem número conta 1 (uma porção da preparação por kit).
			const portions = item.portions != null && item.portions > 0 ? item.portions : 1
			const energy = recipe
				? computeRecipeEnergy(
						{
							name: recipe.name ?? "",
							portionYield: recipe.portionYield != null ? Number(recipe.portionYield) : null,
							// Insumo soft-deletado não compõe mais a ficha — contá-lo inflaria o kcal do kit
							// (o helper compartilhado traz a linha inteira, sem filtro de `deleted_at`).
							ingredients: recipe.recipeIngredientsInKitchens
								.filter((ri) => ri.deletedAt == null)
								.map((ri) => ({
									ingredientId: ri.ingredientId,
									name: ri.ingredientInKitchen?.description ?? "Insumo",
									netQuantity: ri.netQuantity,
									measureUnit: ri.ingredientInKitchen?.measureUnit ?? null,
									isOptional: Boolean(ri.isOptional),
								})),
						},
						energyByIngredient
					)
				: { kcalPerPortion: null, missing: [] }
			return {
				recipeId: item.recipeId as string,
				recipeName: recipe?.name ?? "Preparação removida",
				portions,
				itemGroup: item.itemGroup,
				kcalPerPortion: energy.kcalPerPortion != null ? Math.round(energy.kcalPerPortion) : null,
				missing: energy.missing,
				energy,
			}
		})
		const kit = computeKitEnergy(recipeRows.map((r) => ({ recipeName: r.recipeName, portions: r.portions, energy: r.energy })))
		const hasEnergy = recipeRows.some((r) => r.energy.kcalPerPortion != null)
		out.set(standard.id, {
			snapshot: {
				id: standard.id,
				name: standard.name ?? "Padrão sem nome",
				family: standard.snackFamily as SnackFamily,
				snackClass: standard.snackClass as SnackClass,
				variant: standard.snackVariant as SnackVariant,
				requiresGalley: standard.requiresGalley,
				requiresOven: standard.requiresOven,
				shelfLifeHours: standard.shelfLifeHours,
				reviewedAt: standard.reviewedAt,
				kcalPerKit: hasEnergy ? kit.kcal : null,
				kcalComplete: kit.complete && recipeRows.length > 0,
				items: recipeRows.map((r) => ({ recipeId: r.recipeId, recipeName: r.recipeName, portions: r.portions, itemGroup: r.itemGroup })),
			},
			energy: {
				kcalPerKit: hasEnergy ? kit.kcal : null,
				complete: kit.complete && recipeRows.length > 0,
				incomplete: kit.incomplete,
				recipes: recipeRows.map(({ energy: _energy, itemGroup: _group, ...rest }) => rest),
			},
		})
	}
	return out
}

// ── Padrão de lanche ──────────────────────────────────────────────────────

/**
 * Classifica (ou desclassifica, com `null`) uma exceção como padrão de lanche. Autoriza pelo
 * dono da linha: exceção da cozinha exige `kitchen:2` nela; do catálogo global, `global:2`.
 * Padrão global nunca é pedível — é molde para cópia.
 */
export async function setSnackClassification(db: SisubDb, ctx: UserContext, input: SetSnackClassification): Promise<{ id: string }> {
	const ownerKitchenId = await resolveAssetOwner(db, "menu_template", input.templateId)
	requireAssetWriteForScope(ctx, ownerKitchenId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ templateType: menuTemplateInKitchen.templateType, deletedAt: menuTemplateInKitchen.deletedAt })
			.from(menuTemplateInKitchen)
			.where(eq(menuTemplateInKitchen.id, input.templateId))
			.limit(1)
	)
	const template = rows[0]
	if (!template) throw new NotFoundError("menu_template", input.templateId)
	if (template.deletedAt !== null) throw new DomainError("TEMPLATE_DELETED", "O padrão foi excluído.")
	if (template.templateType !== "exception") throw new DomainError("SNACK_STANDARD_NOT_EXCEPTION", "Só um cardápio de apoio pode ser padrão de lanche.")

	const c = input.classification
	if (c?.orderable) {
		// Padrão pedível sem preparação vira pedido que o aceite materializa em NADA: cardápio
		// vazio no dia, zero tarefa, e a cozinha sem saber o que produzir.
		const [{ count } = { count: 0 }] = await runQuery("FETCH_FAILED", () =>
			db
				.select({ count: sql<number>`count(*)::int` })
				.from(menuTemplateItemsInKitchen)
				.where(and(eq(menuTemplateItemsInKitchen.menuTemplateId, input.templateId), isNotNull(menuTemplateItemsInKitchen.recipeId)))
		)
		if (Number(count) === 0) {
			throw new DomainError("SNACK_STANDARD_EMPTY", "Padrão sem preparação não pode ficar disponível para pedido: monte o kit antes de publicá-lo.")
		}
	}
	if (c?.orderable && ownerKitchenId == null) {
		throw new DomainError("SNACK_STANDARD_GLOBAL_NOT_ORDERABLE", "Padrão do catálogo global não é pedível: copie-o para a cozinha que vai produzir.")
	}

	const values = c
		? {
				snackFamily: c.family,
				snackClass: c.snackClass,
				snackVariant: c.variant,
				requiresGalley: c.requiresGalley,
				requiresOven: c.requiresOven,
				reviewedAt: c.reviewedAt,
				shelfLifeHours: c.shelfLifeHours,
				orderable: c.orderable,
			}
		: {
				snackFamily: null,
				snackClass: null,
				snackVariant: null,
				requiresGalley: false,
				requiresOven: false,
				reviewedAt: null,
				shelfLifeHours: null,
				orderable: false,
			}

	const updated = await runQuery("UPDATE_FAILED", () =>
		db
			.update(menuTemplateInKitchen)
			.set(values)
			.where(
				and(
					eq(menuTemplateInKitchen.id, input.templateId),
					// Dono repetido no predicado: se a linha mudou de cozinha entre a checagem e a
					// escrita, o update não casa nada (mesmo padrão de `meal-types.ts`).
					ownerKitchenId == null ? isNull(menuTemplateInKitchen.kitchenId) : eq(menuTemplateInKitchen.kitchenId, ownerKitchenId)
				)
			)
			.returning({ id: menuTemplateInKitchen.id })
	)
	if (!updated[0]) throw new NotFoundError("menu_template", input.templateId)
	return updated[0]
}

/** kcal por kit de um padrão (ou de uma exceção ainda não classificada), para a tela da cozinha. */
export async function getSnackStandardEnergy(db: SisubDb, ctx: UserContext, input: GetSnackStandardEnergy): Promise<SnackStandardEnergyDetail> {
	const ownerKitchenId = await resolveAssetOwner(db, "menu_template", input.templateId)
	requireAssetRead(ctx, ownerKitchenId)
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select(STANDARD_COLS).from(menuTemplateInKitchen).where(eq(menuTemplateInKitchen.id, input.templateId)).limit(1)
	)
	const row = rows[0]
	if (!row) throw new NotFoundError("menu_template", input.templateId)
	const built = await buildStandardSnapshots(db, [row])
	return built.get(row.id)?.energy ?? { kcalPerKit: null, complete: false, incomplete: [], recipes: [] }
}

/** Padrões que o comensal pode pedir numa cozinha: da própria cozinha, pedíveis, ativos. */
export async function listOrderableStandards(db: SisubDb, ctx: UserContext, input: ListOrderableStandards): Promise<SnackStandardSnapshot[]> {
	requirePermission(ctx, "diner", 1)
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select(STANDARD_COLS)
			.from(menuTemplateInKitchen)
			.where(
				and(
					eq(menuTemplateInKitchen.kitchenId, input.kitchenId),
					eq(menuTemplateInKitchen.orderable, true),
					isNotNull(menuTemplateInKitchen.snackFamily),
					isNull(menuTemplateInKitchen.deletedAt)
				)
			)
			.orderBy(asc(menuTemplateInKitchen.snackFamily), asc(menuTemplateInKitchen.snackClass), asc(menuTemplateInKitchen.name))
	)
	const built = await buildStandardSnapshots(db, rows)
	return rows.flatMap((r) => {
		const entry = built.get(r.id)
		return entry ? [entry.snapshot] : []
	})
}

export type SnackOrderingContext = {
	kitchens: { id: number; name: string; orderable_count: number }[]
	default_kitchen_id: number | null
	requester_label: string
	requester_unit_label: string | null
}

/**
 * Contexto da tela de pedido: cozinhas com padrão pedível, a cozinha do refeitório padrão do
 * usuário e o rótulo dele (posto + nome de guerra) para o cabeçalho do Anexo E.
 */
export async function getSnackOrderingContext(db: SisubDb, ctx: UserContext): Promise<SnackOrderingContext> {
	requirePermission(ctx, "diner", 1)

	const kitchens = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: kitchenInKitchen.id, name: kitchenInKitchen.displayName, orderableCount: sql<number>`count(${menuTemplateInKitchen.id})::int` })
			.from(kitchenInKitchen)
			.innerJoin(
				menuTemplateInKitchen,
				and(
					eq(menuTemplateInKitchen.kitchenId, kitchenInKitchen.id),
					eq(menuTemplateInKitchen.orderable, true),
					isNotNull(menuTemplateInKitchen.snackFamily),
					isNull(menuTemplateInKitchen.deletedAt)
				)
			)
			.groupBy(kitchenInKitchen.id, kitchenInKitchen.displayName)
			.orderBy(asc(kitchenInKitchen.displayName))
	)

	const me = await runQuery("FETCH_FAILED", () =>
		db
			.select({ defaultMessHallId: userDataInCore.defaultMessHallId, nrOrdem: userDataInCore.nrOrdem, email: userDataInCore.email })
			.from(userDataInCore)
			.where(eq(userDataInCore.id, ctx.userId))
			.limit(1)
	)
	let defaultKitchenId: number | null = null
	if (me[0]?.defaultMessHallId != null) {
		const hall = await runQuery("FETCH_FAILED", () => db.execute(sql`select kitchen_id from kitchen.mess_halls where id = ${me[0]?.defaultMessHallId} limit 1`))
		const kitchenId = (hall as unknown as { kitchen_id: number | string | null }[])[0]?.kitchen_id
		defaultKitchenId = kitchenId != null ? Number(kitchenId) : null
	}
	const people = await resolvePeople(db, [ctx.userId])
	const military = me[0]?.nrOrdem ? await fetchMilitary(db, [me[0].nrOrdem]) : new Map()

	return {
		kitchens: kitchens.map((k) => ({ id: k.id, name: k.name ?? `Cozinha ${k.id}`, orderable_count: Number(k.orderableCount) })),
		default_kitchen_id: defaultKitchenId,
		requester_label: people.get(ctx.userId) ?? me[0]?.email ?? "",
		requester_unit_label: (me[0]?.nrOrdem ? military.get(me[0].nrOrdem)?.sgOrg : null) ?? null,
	}
}

// ── Pessoas (rótulo "posto nome de guerra") ───────────────────────────────

async function fetchMilitary(db: Pick<SisubDb, "select">, nrOrdens: string[]) {
	const rows = nrOrdens.length
		? await runQuery("FETCH_FAILED", () =>
				db
					.select({
						nrOrdem: userMilitaryDataInCore.nrOrdem,
						nmGuerra: userMilitaryDataInCore.nmGuerra,
						sgPosto: userMilitaryDataInCore.sgPosto,
						sgOrg: userMilitaryDataInCore.sgOrg,
					})
					.from(userMilitaryDataInCore)
					.where(inArray(userMilitaryDataInCore.nrOrdem, nrOrdens))
			)
		: []
	return new Map(rows.filter((r) => r.nrOrdem != null).map((r) => [r.nrOrdem as string, r]))
}

async function resolvePeople(db: Pick<SisubDb, "select">, userIds: string[]): Promise<Map<string, string>> {
	const ids = [...new Set(userIds)]
	if (ids.length === 0) return new Map()
	const users = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: userDataInCore.id, email: userDataInCore.email, nrOrdem: userDataInCore.nrOrdem })
			.from(userDataInCore)
			.where(inArray(userDataInCore.id, ids))
	)
	const military = await fetchMilitary(
		db,
		users.map((u) => u.nrOrdem).filter((n): n is string => typeof n === "string" && n.length > 0)
	)
	const out = new Map<string, string>()
	for (const user of users) {
		const m = user.nrOrdem ? military.get(user.nrOrdem) : undefined
		const label = [m?.sgPosto, m?.nmGuerra].filter(Boolean).join(" ")
		out.set(user.id, label || user.email)
	}
	return out
}

// ── Leitura ───────────────────────────────────────────────────────────────

async function fetchLines(db: Pick<SisubDb, "select">, requestIds: string[]): Promise<Map<string, SnackRequestLine[]>> {
	const out = new Map<string, SnackRequestLine[]>()
	if (requestIds.length === 0) return out
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(snackRequestLineInKitchen)
			.where(inArray(snackRequestLineInKitchen.requestId, requestIds))
			.orderBy(asc(snackRequestLineInKitchen.createdAt))
	)
	for (const row of rows) {
		// O snapshot é JSON gravado em camelCase (`SnackStandardSnapshot`) e sai como está:
		// `toWire` desce em objeto aninhado e trocaria `snackClass` por `snack_class`.
		const { standardSnapshot, ...columns } = row
		const wire: SnackRequestLine = {
			...toWire<Omit<SnackRequestLine, "standard_snapshot">>(columns),
			standard_snapshot: standardSnapshot as SnackStandardSnapshot,
		}
		const list = out.get(row.requestId) ?? []
		list.push(wire)
		out.set(row.requestId, list)
	}
	return out
}

async function toSummaries(db: SisubDb, rows: (typeof snackRequestInKitchen.$inferSelect)[], now = new Date()): Promise<SnackRequestSummary[]> {
	if (rows.length === 0) return []
	const lines = await fetchLines(
		db,
		rows.map((r) => r.id)
	)
	const people = await resolvePeople(
		db,
		rows.map((r) => r.requestedBy)
	)
	const kitchenIds = [...new Set(rows.map((r) => r.kitchenId))]
	const kitchens = await runQuery("FETCH_FAILED", () =>
		db.select({ id: kitchenInKitchen.id, name: kitchenInKitchen.displayName }).from(kitchenInKitchen).where(inArray(kitchenInKitchen.id, kitchenIds))
	)
	const kitchenName = new Map(kitchens.map((k) => [k.id, k.name]))
	return rows.map((row) => {
		const wire = toWire<SnackRequestSummary>(row)
		return {
			...wire,
			kitchen_name: kitchenName.get(row.kitchenId) ?? null,
			lines: lines.get(row.id) ?? [],
			requester: { user_id: row.requestedBy, label: people.get(row.requestedBy) ?? "" },
			calculator_snapshot: row.calculatorSnapshot as SnackRequestSummary["calculator_snapshot"],
			is_late: row.lateReason != null || (row.status === "submitted" && isLateRequest(now, row.pickupAt, row.departureAt)),
		}
	})
}

async function toDetail(db: SisubDb, row: typeof snackRequestInKitchen.$inferSelect): Promise<SnackRequestDetail> {
	const [summary] = await toSummaries(db, [row])
	if (!summary) throw new NotFoundError("snack_request", row.id)
	const events = await runQuery("FETCH_FAILED", () =>
		db.select().from(snackRequestEventInKitchen).where(eq(snackRequestEventInKitchen.requestId, row.id)).orderBy(asc(snackRequestEventInKitchen.createdAt))
	)
	const materials = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(snackRequestMaterialInKitchen)
			.where(eq(snackRequestMaterialInKitchen.requestId, row.id))
			.orderBy(asc(snackRequestMaterialInKitchen.issuedAt))
	)
	const actors = await resolvePeople(
		db,
		events.map((e) => e.actorId)
	)
	const tasks = await runQuery("FETCH_FAILED", () =>
		db
			.select({ status: productionTaskInKitchen.status })
			.from(productionTaskInKitchen)
			.innerJoin(menuItemsInKitchen, eq(productionTaskInKitchen.menuItemId, menuItemsInKitchen.id))
			.where(and(eq(menuItemsInKitchen.originSnackRequestId, row.id), isNull(menuItemsInKitchen.deletedAt)))
	)
	return {
		...summary,
		// `details` é JSON gravado em camelCase (ex.: `adjustments[].lineId`) e sai como está —
		// `toWire` desceria nele e a tela não acharia as chaves.
		events: events.map(({ details, ...e }) => ({
			...toWire<SnackRequestEventRow>(e),
			details: details as SnackRequestEventRow["details"],
			actor_label: actors.get(e.actorId) ?? "",
		})),
		materials: materials.map((m) => toWire<SnackRequestMaterialRow>(m)),
		production: {
			total: tasks.length,
			done: tasks.filter((t) => t.status === "DONE").length,
			in_progress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
		},
	}
}

async function loadRequest(db: Pick<SisubDb, "select">, requestId: string) {
	const rows = await runQuery("FETCH_FAILED", () => db.select().from(snackRequestInKitchen).where(eq(snackRequestInKitchen.id, requestId)).limit(1))
	const row = rows[0]
	if (!row) throw new NotFoundError("snack_request", requestId)
	return row
}

// ── Comensal ──────────────────────────────────────────────────────────────

export async function createSnackRequest(db: SisubDb, ctx: UserContext, input: CreateSnackRequest, now = new Date()): Promise<SnackRequestDetail> {
	requirePermission(ctx, "diner", 1)

	if (input.missionKind === "aerea" && !input.missionOrderNumber) {
		throw new DomainError("SNACK_MISSION_ORDER_REQUIRED", "Missão aérea exige o número da ordem de missão.")
	}
	if (input.includesNonMilitary && !input.nonMilitaryReason) {
		throw new DomainError("SNACK_NON_MILITARY_REASON_REQUIRED", "Pedido com civis ou servidores exige o motivo da participação na missão.")
	}
	if (input.longestLegMinutes != null && input.longestLegMinutes > input.totalMinutes) {
		throw new DomainError("SNACK_LEG_LONGER_THAN_TOTAL", "A maior perna não pode ser maior que o deslocamento total.")
	}
	if (Date.parse(input.pickupAt) <= now.getTime()) throw new DomainError("SNACK_PICKUP_IN_PAST", "A retirada tem que ser no futuro.")
	if (Date.parse(input.pickupAt) > Date.parse(input.departureAt)) {
		throw new DomainError("SNACK_PICKUP_AFTER_DEPARTURE", "A retirada tem que ser antes da partida.")
	}
	const late = isLateRequest(now, input.pickupAt, input.departureAt)
	if (late && !input.lateReason) {
		throw new DomainError("SNACK_LATE_REASON_REQUIRED", "Pedido com menos de 24 h de antecedência exige justificativa (Módulo 7, 7.4.10).")
	}

	const standardIds = [...new Set(input.lines.map((l) => l.standardId))]
	const standards = await runQuery("FETCH_FAILED", () =>
		db
			.select(STANDARD_COLS)
			.from(menuTemplateInKitchen)
			.where(
				and(
					inArray(menuTemplateInKitchen.id, standardIds),
					eq(menuTemplateInKitchen.kitchenId, input.kitchenId),
					eq(menuTemplateInKitchen.orderable, true),
					isNotNull(menuTemplateInKitchen.snackFamily),
					isNull(menuTemplateInKitchen.deletedAt)
				)
			)
	)
	if (standards.length !== standardIds.length) {
		throw new DomainError("SNACK_STANDARD_UNAVAILABLE", "Um dos padrões escolhidos não está disponível para pedido nesta cozinha.")
	}
	const family: SnackFamily = input.missionKind === "aerea" ? "bordo" : "apoio"
	for (const standard of standards) {
		if (standard.snackFamily !== family) {
			throw new DomainError(
				"SNACK_STANDARD_WRONG_FAMILY",
				`"${standard.name}" é Lanche de ${standard.snackFamily === "bordo" ? "Bordo" : "Apoio"}; a missão é ${input.missionKind === "aerea" ? "aérea" : "terrestre"}.`
			)
		}
		if (standard.requiresGalley && !input.hasGalley)
			throw new DomainError("SNACK_STANDARD_NEEDS_GALLEY", `"${standard.name}" exige aeronave com copa ou minicozinha.`)
		if (standard.requiresOven && !input.hasOven) throw new DomainError("SNACK_STANDARD_NEEDS_OVEN", `"${standard.name}" exige forno a bordo.`)
	}

	const mission = {
		missionKind: input.missionKind,
		departureAt: input.departureAt,
		totalMinutes: input.totalMinutes,
		longestLegMinutes: input.longestLegMinutes,
		stopsWithoutMess: input.stopsWithoutMess,
		groundMinutes: input.groundMinutes,
		isOperational: input.isOperational,
		hasGalley: input.hasGalley,
		hasOven: input.hasOven,
		crewCount: input.crewCount,
		paxCount: input.paxCount,
	}
	if (mission.crewCount + mission.paxCount === 0) throw new DomainError("SNACK_NO_PEOPLE", "Informe a tripulação ou o efetivo.")
	// A calculadora roda de novo aqui: o snapshot gravado é o do SERVIDOR, não o que o
	// navegador disse ter calculado.
	const entitlement = calculateSnackEntitlement(mission)
	const standardById = new Map(standards.map((s) => [s.id, s]))
	const divergences = findEntitlementDivergences(
		entitlement,
		input.lines.map((l) => {
			const s = standardById.get(l.standardId) as StandardRow
			return { family: s.snackFamily as SnackFamily, snackClass: s.snackClass as SnackClass, audience: l.audience, quantity: l.quantity }
		})
	)
	if (divergences.length > 0 && !input.divergenceReason) {
		throw new DomainError("SNACK_DIVERGENCE_REASON_REQUIRED", "O pedido difere da sugestão da calculadora: justifique a classe ou a quantidade.", {
			divergences,
		})
	}

	const optionalKeys = new Set(entitlement.lines.filter((l) => l.optional).map((l) => `${l.family}:${l.snackClass}:${l.audience}`))
	const snapshots = await buildStandardSnapshots(db, standards)

	const requestId = await db.transaction(async (tx) => {
		const [created] = await runQuery("INSERT_FAILED", () =>
			tx
				.insert(snackRequestInKitchen)
				.values({
					kitchenId: input.kitchenId,
					requestedBy: ctx.userId,
					requesterUnitLabel: input.requesterUnitLabel,
					missionKind: input.missionKind,
					vehicleType: input.vehicleType || null,
					vehicleRegistration: input.vehicleRegistration || null,
					vehicleOm: input.vehicleOm || null,
					missionDescription: input.missionDescription,
					departureAt: input.departureAt,
					origin: input.origin || null,
					destination: input.destination || null,
					stops: input.stops || null,
					totalMinutes: input.totalMinutes,
					longestLegMinutes: input.longestLegMinutes,
					stopsWithoutMess: input.stopsWithoutMess,
					groundMinutes: input.groundMinutes,
					missionOrderNumber: input.missionOrderNumber || null,
					isOperational: input.isOperational,
					hasGalley: input.hasGalley,
					hasOven: input.hasOven,
					crewCount: input.crewCount,
					paxCount: input.paxCount,
					waterQuantity: input.waterQuantity,
					cupQuantity: input.cupQuantity,
					iceQuantity: input.iceQuantity,
					coffeeQuantity: input.coffeeQuantity,
					includesNonMilitary: input.includesNonMilitary,
					nonMilitaryReason: input.includesNonMilitary ? (input.nonMilitaryReason ?? null) : null,
					preference: input.preference,
					pickupAt: input.pickupAt,
					pickupResponsible: input.pickupResponsible,
					fundingSource: input.fundingSource,
					lateReason: late ? (input.lateReason ?? null) : null,
					divergenceReason: divergences.length > 0 ? (input.divergenceReason ?? null) : null,
					calculatorSnapshot: { input: mission, entitlement, divergences },
				})
				.returning({ id: snackRequestInKitchen.id })
		)
		if (!created) throw new DomainError("INSERT_FAILED", "no row returned")

		await runQuery("INSERT_FAILED", () =>
			tx
				.insert(snackRequestLineInKitchen)
				.values(
					input.lines.map((l) => {
						const s = standardById.get(l.standardId) as StandardRow
						return {
							requestId: created.id,
							standardId: l.standardId,
							audience: l.audience,
							quantity: l.quantity,
							optional: optionalKeys.has(`${s.snackFamily}:${s.snackClass}:${l.audience}`),
							standardSnapshot: snapshots.get(l.standardId)?.snapshot ?? {},
						}
					})
				)
				.then(() => undefined)
		)
		await insertEvent(tx, created.id, null, "submitted", ctx.userId, null, divergences.length > 0 ? { divergences } : null)
		return created.id
	})

	return toDetail(db, await loadRequest(db, requestId))
}

export async function listMySnackRequests(db: SisubDb, ctx: UserContext): Promise<SnackRequestSummary[]> {
	requirePermission(ctx, "diner", 1)
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select().from(snackRequestInKitchen).where(eq(snackRequestInKitchen.requestedBy, ctx.userId)).orderBy(desc(snackRequestInKitchen.createdAt)).limit(100)
	)
	return toSummaries(db, rows)
}

/** Pedido alheio responde como inexistente — sondar UUID não distingue "não existe" de "não é seu". */
export async function getMySnackRequest(db: SisubDb, ctx: UserContext, input: SnackRequestId): Promise<SnackRequestDetail> {
	requirePermission(ctx, "diner", 1)
	const row = await loadRequest(db, input.requestId)
	if (row.requestedBy !== ctx.userId) throw new NotFoundError("snack_request", input.requestId)
	return toDetail(db, row)
}

export async function cancelMySnackRequest(db: SisubDb, ctx: UserContext, input: CancelMySnackRequest): Promise<SnackRequestDetail> {
	requirePermission(ctx, "diner", 1)
	const row = await loadRequest(db, input.requestId)
	if (row.requestedBy !== ctx.userId) throw new NotFoundError("snack_request", input.requestId)

	await db.transaction(async (tx) => {
		await transition(tx, input.requestId, "cancelled", ctx.userId, {
			guard: (locked) => {
				if (locked.requestedBy !== ctx.userId) throw new NotFoundError("snack_request", input.requestId)
				if (!requesterCanCancel(locked.status as SnackRequestStatus)) {
					throw new DomainError("SNACK_CANCEL_NOT_ALLOWED", "A produção já começou: para cancelar, fale com a cozinha.")
				}
			},
			patch: () => ({ cancelledBy: ctx.userId, cancelReason: input.reason || null }),
			note: input.reason || null,
		})
		await removeFromProduction(tx, input.requestId)
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

// ── Cozinha ───────────────────────────────────────────────────────────────

export async function listKitchenSnackRequests(db: SisubDb, ctx: UserContext, input: ListKitchenSnackRequests): Promise<SnackRequestSummary[]> {
	requireKitchen(ctx, 1, input.kitchenId)
	const conditions = [eq(snackRequestInKitchen.kitchenId, input.kitchenId)]
	// Datas civis de Brasília → instantes: 00:00 de Brasília é 03:00 UTC.
	if (input.from) conditions.push(gte(snackRequestInKitchen.pickupAt, `${input.from}T03:00:00.000Z`))
	if (input.to) {
		const next = new Date(`${input.to}T03:00:00.000Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		conditions.push(lt(snackRequestInKitchen.pickupAt, next.toISOString()))
	}
	if (input.statuses && input.statuses.length > 0) conditions.push(inArray(snackRequestInKitchen.status, input.statuses))
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(snackRequestInKitchen)
			.where(and(...conditions))
			.orderBy(asc(snackRequestInKitchen.pickupAt))
			.limit(300)
	)
	return toSummaries(db, rows)
}

/** Lê a cozinha da LINHA e exige o nível pedido nela. */
async function authorizeKitchenRequest(db: SisubDb, ctx: UserContext, requestId: string, level: 1 | 2 | "floor") {
	const row = await loadRequest(db, requestId)
	if (level === "floor") {
		// Andamento é do chão (`kitchen:2` ou `kitchen-production:1`), mas a tela do pedido e a
		// etiqueta ficam na Gestão Cozinha (`kitchen:1`). Sem o `kitchen:1` o operador poderia
		// mudar um pedido que não consegue abrir.
		requireKitchen(ctx, 1, row.kitchenId)
		requireKitchenFloorWrite(ctx, row.kitchenId)
	} else requireKitchen(ctx, level, row.kitchenId)
	return row
}

export async function getKitchenSnackRequest(db: SisubDb, ctx: UserContext, input: SnackRequestId): Promise<SnackRequestDetail> {
	const row = await authorizeKitchenRequest(db, ctx, input.requestId, 1)
	return toDetail(db, row)
}

export async function decideSnackRequest(db: SisubDb, ctx: UserContext, input: DecideSnackRequest): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, 2)

	await db.transaction(async (tx) => {
		if (input.decision === "reject") {
			await transition(tx, input.requestId, "rejected", ctx.userId, {
				patch: () => ({ decidedBy: ctx.userId, decidedAt: new Date().toISOString(), decisionReason: input.reason }),
				note: input.reason,
			})
			return
		}

		const lines = await runQuery("FETCH_FAILED", () =>
			tx.select().from(snackRequestLineInKitchen).where(eq(snackRequestLineInKitchen.requestId, input.requestId))
		)
		const byId = new Map(lines.map((l) => [l.id, l]))
		const changes: { lineId: string; from: number; to: number }[] = []
		for (const adjustment of input.adjustments ?? []) {
			const line = byId.get(adjustment.lineId)
			if (!line) throw new NotFoundError("snack_request_line", adjustment.lineId)
			if (adjustment.approvedQuantity > line.quantity) {
				throw new DomainError("SNACK_APPROVED_ABOVE_REQUESTED", "A quantidade aprovada não pode passar da pedida.")
			}
			if (adjustment.approvedQuantity !== line.quantity) changes.push({ lineId: line.id, from: line.quantity, to: adjustment.approvedQuantity })
		}
		const approved = new Map(changes.map((c) => [c.lineId, c.to]))
		if (lines.every((l) => (approved.get(l.id) ?? l.quantity) === 0)) {
			throw new DomainError("SNACK_ACCEPT_EMPTY", "Aceitar zerando tudo é recusar: use a recusa, com o motivo.")
		}

		const locked = await transition(tx, input.requestId, "accepted", ctx.userId, {
			patch: () => ({ decidedBy: ctx.userId, decidedAt: new Date().toISOString(), unitValue: input.unitValue, decisionReason: input.note || null }),
			note: input.note || null,
			details: changes.length > 0 ? { adjustments: changes } : null,
		})
		for (const line of lines) {
			await tx
				.update(snackRequestLineInKitchen)
				.set({ approvedQuantity: approved.get(line.id) ?? line.quantity })
				.where(eq(snackRequestLineInKitchen.id, line.id))
		}
		await addToProduction(
			tx,
			locked,
			lines.map((l) => ({ ...l, approvedQuantity: approved.get(l.id) ?? l.quantity }))
		)
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

/** Folga de relógio aceita na coleta de amostra: o terminal da cozinha não está sincronizado. */
const SAMPLE_CLOCK_SKEW_MS = 5 * 60_000
/** A amostra é do lote que está saindo; 24 h atrás já não é deste lote (7.4.6). */
const SAMPLE_MAX_AGE_MS = 24 * 3_600_000

export async function advanceSnackRequest(db: SisubDb, ctx: UserContext, input: AdvanceSnackRequest, now = new Date()): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, "floor")
	if (input.to === "ready") {
		// A coleta vira a DATA DE FABRICAÇÃO impressa na etiqueta, e a validade sai dela: uma
		// data no futuro imprime comida "válida" por anos.
		const collected = Date.parse(input.sampleCollectedAt)
		if (collected > now.getTime() + SAMPLE_CLOCK_SKEW_MS) {
			throw new DomainError("SNACK_SAMPLE_IN_FUTURE", "A coleta da amostra não pode ser no futuro: ela vira a data de fabricação da etiqueta.")
		}
		if (collected < now.getTime() - SAMPLE_MAX_AGE_MS) {
			throw new DomainError("SNACK_SAMPLE_TOO_OLD", "A coleta da amostra é deste lote: informe uma data das últimas 24 h.")
		}
	}
	await db.transaction(async (tx) => {
		if (input.to === "in_production") {
			await transition(tx, input.requestId, "in_production", ctx.userId, {})
			return
		}
		await transition(tx, input.requestId, "ready", ctx.userId, {
			patch: () => ({ sampleCollectedAt: input.sampleCollectedAt, sampleCollectedBy: ctx.userId, sampleNotes: input.sampleNotes || null }),
			note: input.sampleNotes || null,
			details: { sampleCollectedAt: input.sampleCollectedAt },
		})
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

export async function registerSnackPickup(db: SisubDb, ctx: UserContext, input: RegisterSnackPickup): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, "floor")
	// Sem isto o CHECK do banco recusa o INSERT e derruba a transação INTEIRA: a retirada não
	// seria registrada, com um `INSERT_FAILED` opaco na tela.
	if (input.materials.some((m) => m.item === "outro" && !m.description)) {
		throw new DomainError("SNACK_MATERIAL_DESCRIPTION_REQUIRED", 'Material "outro" precisa de descrição.')
	}
	await db.transaction(async (tx) => {
		await transition(tx, input.requestId, "delivered", ctx.userId, {
			patch: () => ({ pickedUpAt: new Date().toISOString(), pickedUpByName: input.pickedUpByName, deliveredBy: ctx.userId }),
			note: `Retirado por ${input.pickedUpByName}`,
			details: input.materials.length > 0 ? { materials: input.materials } : null,
		})
		if (input.materials.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(snackRequestMaterialInKitchen)
					.values(input.materials.map((m) => ({ requestId: input.requestId, item: m.item, description: m.description || null, quantity: m.quantity })))
					.then(() => undefined)
			)
		}
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

export async function registerSnackMaterialReturn(db: SisubDb, ctx: UserContext, input: RegisterSnackMaterialReturn): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, "floor")
	await db.transaction(async (tx) => {
		const [locked] = await tx.select().from(snackRequestInKitchen).where(eq(snackRequestInKitchen.id, input.requestId)).for("update")
		if (!locked) throw new NotFoundError("snack_request", input.requestId)
		if (locked.status !== "delivered" && locked.status !== "cancelled") {
			throw new DomainError("SNACK_RETURN_NOT_ALLOWED", "Devolução de material só depois da retirada.")
		}
		const materials = await tx.select().from(snackRequestMaterialInKitchen).where(eq(snackRequestMaterialInKitchen.requestId, input.requestId))
		const byId = new Map(materials.map((m) => [m.id, m]))
		const now = new Date().toISOString()
		for (const ret of input.returns) {
			const material = byId.get(ret.materialId)
			if (!material) throw new NotFoundError("snack_request_material", ret.materialId)
			if (ret.returnedQuantity > material.quantity) throw new DomainError("SNACK_RETURN_ABOVE_ISSUED", "Devolução maior que o cautelado.")
			await tx
				.update(snackRequestMaterialInKitchen)
				.set({ returnedQuantity: ret.returnedQuantity, returnedAt: ret.returnedQuantity === material.quantity ? now : null })
				.where(eq(snackRequestMaterialInKitchen.id, material.id))
			material.returnedQuantity = ret.returnedQuantity
		}
		const pending = materials.some((m) => m.returnedQuantity < m.quantity)
		await tx.update(snackRequestInKitchen).set({ materialReturnPending: pending, updatedAt: now }).where(eq(snackRequestInKitchen.id, input.requestId))
		await insertEvent(tx, input.requestId, locked.status, locked.status, ctx.userId, pending ? "Devolução parcial de material" : "Material devolvido", {
			returns: input.returns,
		})
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

export async function closeSnackRequest(db: SisubDb, ctx: UserContext, input: SnackRequestId): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, "floor")
	await db.transaction(async (tx) => {
		// Trava a linha ANTES de ler a cautela: uma retirada concorrente que cautela material
		// esperaria esta transação, em vez de gravar material que esta leitura não viu.
		await tx.select({ id: snackRequestInKitchen.id }).from(snackRequestInKitchen).where(eq(snackRequestInKitchen.id, input.requestId)).for("update")
		const materials = await tx.select().from(snackRequestMaterialInKitchen).where(eq(snackRequestMaterialInKitchen.requestId, input.requestId))
		await transition(tx, input.requestId, "closed", ctx.userId, {
			guard: () => {
				if (materials.some((m) => m.returnedQuantity < m.quantity)) {
					throw new DomainError("SNACK_MATERIAL_PENDING", "Há material cautelado não devolvido: registre a devolução antes de encerrar.")
				}
			},
		})
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

export async function cancelKitchenSnackRequest(db: SisubDb, ctx: UserContext, input: KitchenCancelSnackRequest): Promise<SnackRequestDetail> {
	await authorizeKitchenRequest(db, ctx, input.requestId, 2)
	await db.transaction(async (tx) => {
		// Trava a linha ANTES de ler a cautela: uma retirada concorrente que cautela material
		// esperaria esta transação, em vez de gravar material que esta leitura não viu.
		await tx.select({ id: snackRequestInKitchen.id }).from(snackRequestInKitchen).where(eq(snackRequestInKitchen.id, input.requestId)).for("update")
		const materials = await tx.select().from(snackRequestMaterialInKitchen).where(eq(snackRequestMaterialInKitchen.requestId, input.requestId))
		const locked = await transition(tx, input.requestId, "cancelled", ctx.userId, {
			patch: () => ({
				cancelledBy: ctx.userId,
				cancelReason: input.reason,
				// Cancelada depois da produção: o que saiu do rancho volta (7.4.11) — a comida
				// perecível NÃO é reaproveitada (7.4.4), o material da cautela sim.
				// Pendência é de MATERIAL cautelado: sem cautela não há o que devolver, e marcar
				// a flag a deixaria impossível de limpar.
				materialReturnPending: materials.some((m) => m.returnedQuantity < m.quantity),
			}),
			note: input.reason,
			details: (locked) => ({ discardsFood: cancelDiscardsFood(locked.status as SnackRequestStatus) }),
		})
		// Depois da retirada o item fica no quadro: a produção aconteceu e é histórico.
		if (isInProductionPlan(locked.status as SnackRequestStatus)) await removeFromProduction(tx, input.requestId)
	})
	return toDetail(db, await loadRequest(db, input.requestId))
}

export async function fetchSnackProductionSummary(
	db: SisubDb,
	ctx: UserContext,
	input: SnackProductionSummaryInput
): Promise<SnackProductionSummary & { requests: SnackRequestSummary[] }> {
	requireKitchen(ctx, 1, input.kitchenId)
	const requests = await listKitchenSnackRequests(db, ctx, {
		kitchenId: input.kitchenId,
		from: input.date,
		to: input.date,
		statuses: ["accepted", "in_production", "ready"],
	})
	const summary = buildSnackProductionSummary(
		requests.map((r) => ({
			id: r.id,
			missionDescription: r.mission_description,
			pickupAt: r.pickup_at,
			waterQuantity: r.water_quantity,
			cupQuantity: r.cup_quantity,
			iceQuantity: r.ice_quantity,
			coffeeQuantity: r.coffee_quantity,
			lines: r.lines.map((l) => ({ standard: l.standard_snapshot, audience: l.audience as SnackAudience, kits: l.approved_quantity ?? l.quantity })),
		}))
	)
	return { ...summary, requests }
}

export type SnackLabelData = {
	producer: { kitchen: string | null; unit: string | null }
	fabricated_at: string
	request: SnackRequestSummary
}

/** Dados da etiqueta (7.4.5): OM produtora vem da unidade da cozinha. */
export async function getSnackLabelData(db: SisubDb, ctx: UserContext, input: SnackRequestId): Promise<SnackLabelData> {
	const row = await authorizeKitchenRequest(db, ctx, input.requestId, 1)
	const [summary] = await toSummaries(db, [row])
	if (!summary) throw new NotFoundError("snack_request", input.requestId)
	const kitchen = await runQuery("FETCH_FAILED", () =>
		db
			.select({ name: kitchenInKitchen.displayName, unitId: kitchenInKitchen.unitId })
			.from(kitchenInKitchen)
			.where(eq(kitchenInKitchen.id, row.kitchenId))
			.limit(1)
	)
	const unitId = kitchen[0]?.unitId
	const unit =
		unitId != null
			? await runQuery("FETCH_FAILED", () =>
					db.select({ name: unitsInCore.displayName, code: unitsInCore.code }).from(unitsInCore).where(eq(unitsInCore.id, unitId)).limit(1)
				)
			: []
	return {
		producer: { kitchen: kitchen[0]?.name ?? null, unit: unit[0]?.name ?? unit[0]?.code ?? null },
		fabricated_at: row.sampleCollectedAt ?? new Date().toISOString(),
		request: summary,
	}
}

// ── Máquina de estados ────────────────────────────────────────────────────

type LockedRequest = typeof snackRequestInKitchen.$inferSelect

async function insertEvent(
	tx: Tx,
	requestId: string,
	from: string | null,
	to: string,
	actorId: string,
	note: string | null,
	details: Record<string, unknown> | null
): Promise<void> {
	await runQuery("INSERT_FAILED", () =>
		tx
			.insert(snackRequestEventInKitchen)
			.values({ requestId, fromStatus: from, toStatus: to, actorId, note, details })
			.then(() => undefined)
	)
}

/**
 * Trava a linha, confere a transição, aplica o patch e grava o evento — tudo na transação do
 * chamador. É o ÚNICO caminho que muda `status`.
 */
async function transition(
	tx: Tx,
	requestId: string,
	to: SnackRequestStatus,
	actorId: string,
	options: {
		guard?: (locked: LockedRequest) => void
		patch?: (locked: LockedRequest) => Partial<typeof snackRequestInKitchen.$inferInsert>
		note?: string | null
		details?: Record<string, unknown> | null | ((locked: LockedRequest) => Record<string, unknown> | null)
	}
): Promise<LockedRequest> {
	const [locked] = await runQuery("FETCH_FAILED", () => tx.select().from(snackRequestInKitchen).where(eq(snackRequestInKitchen.id, requestId)).for("update"))
	if (!locked) throw new NotFoundError("snack_request", requestId)
	const from = locked.status as SnackRequestStatus
	if (!canTransition(from, to)) {
		throw new DomainError(
			"SNACK_INVALID_TRANSITION",
			`O pedido está "${from}" e não pode ir para "${to}". Atualize a tela: outra pessoa pode ter mexido nele.`,
			{
				from,
				to,
			}
		)
	}
	options.guard?.(locked)
	const patch = options.patch?.(locked) ?? {}
	await runQuery("UPDATE_FAILED", () =>
		tx
			.update(snackRequestInKitchen)
			.set({ ...patch, status: to, updatedAt: new Date().toISOString() })
			.where(eq(snackRequestInKitchen.id, requestId))
	)
	const details = typeof options.details === "function" ? options.details(locked) : (options.details ?? null)
	await insertEvent(tx, requestId, from, to, actorId, options.note ?? null, details)
	return locked
}

// ── Quadro de produção ───────────────────────────────────────────────────

/**
 * Materializa o pedido aceito no quadro de produção, sob o tipo de refeição de sistema, na
 * data de retirada (Brasília). Um item por (linha × preparação): o `origin_template_id` é o
 * padrão e o `origin_snack_request_id` é o pedido — o quadro discrimina pelos dois.
 */
async function addToProduction(tx: Tx, request: LockedRequest, lines: (typeof snackRequestLineInKitchen.$inferSelect)[]): Promise<void> {
	const mealType = await resolveSnackMealType(tx)
	const serviceDate = brasiliaCivilDate(request.pickupAt)

	// Índice único parcial (data, refeição, cozinha) entre ativos: dois aceites simultâneos
	// não criam dois cardápios — o segundo insert não faz nada e o select acha o primeiro.
	await tx.insert(dailyMenuInKitchen).values({ kitchenId: request.kitchenId, serviceDate, mealTypeId: mealType.id, status: "PLANNED" }).onConflictDoNothing()
	const [menu] = await runQuery("FETCH_FAILED", () =>
		tx
			.select({ id: dailyMenuInKitchen.id })
			.from(dailyMenuInKitchen)
			.where(
				and(
					eq(dailyMenuInKitchen.kitchenId, request.kitchenId),
					eq(dailyMenuInKitchen.serviceDate, serviceDate),
					eq(dailyMenuInKitchen.mealTypeId, mealType.id),
					isNull(dailyMenuInKitchen.deletedAt)
				)
			)
			.limit(1)
	)
	if (!menu) throw new DomainError("SNACK_MENU_MISSING", "Não foi possível abrir o cardápio de lanches do dia.")

	const snapshots = lines.filter((l) => (l.approvedQuantity ?? l.quantity) > 0).map((l) => ({ line: l, snapshot: l.standardSnapshot as SnackStandardSnapshot }))
	const recipeIds = [...new Set(snapshots.flatMap((s) => s.snapshot.items.map((i) => i.recipeId)))]
	const recipes = recipeIds.length > 0 ? await fetchRecipesWithIngredients(tx, recipeIds) : []
	const recipeById = new Map(recipes.map((r) => [r.id, r]))

	const existing = await tx
		.select({ sortOrder: menuItemsInKitchen.sortOrder })
		.from(menuItemsInKitchen)
		.where(and(eq(menuItemsInKitchen.dailyMenuId, menu.id), isNull(menuItemsInKitchen.deletedAt)))
	let sortOrder = existing.reduce((max, r) => Math.max(max, (r.sortOrder ?? 0) + 1), 0)

	// Um item por (padrão × preparação) no pedido: tripulação e passageiros do mesmo padrão
	// são o mesmo lote na produção — separados, o quadro mostraria "Café 6" e "Café 3".
	const byKey = new Map<string, typeof menuItemsInKitchen.$inferInsert>()
	for (const { line, snapshot } of snapshots) {
		const kits = line.approvedQuantity ?? line.quantity
		for (const item of snapshot.items) {
			const recipe = recipeById.get(item.recipeId)
			if (!recipe) continue
			const key = `${snapshot.id}:${item.recipeId}`
			const existing = byKey.get(key)
			if (existing) {
				existing.plannedPortionQuantity = Number(existing.plannedPortionQuantity ?? 0) + kits * item.portions
				continue
			}
			byKey.set(key, {
				dailyMenuId: menu.id,
				recipeOriginId: item.recipeId,
				// Snapshot snake_case com `ingredients` aninhado — o mesmo shape de addMenuItem.
				recipe: toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }),
				plannedPortionQuantity: kits * item.portions,
				itemGroup: item.itemGroup,
				sortOrder: sortOrder++,
				originTemplateId: snapshot.id,
				originTemplateType: "exception",
				originSnackRequestId: request.id,
			})
		}
	}
	const rows = [...byKey.values()]
	if (rows.length === 0) return

	const inserted = await runQuery("INSERT_ITEMS_FAILED", () => tx.insert(menuItemsInKitchen).values(rows).returning({ id: menuItemsInKitchen.id }))
	await tx
		.insert(productionTaskInKitchen)
		.values(inserted.map((i) => ({ kitchenId: request.kitchenId, menuItemId: i.id, productionDate: serviceDate, status: "PENDING" as const })))
		.onConflictDoNothing({ target: productionTaskInKitchen.menuItemId })
}

/** Tira do quadro os itens do pedido (soft-delete). A tarefa some junto com o item no quadro. */
async function removeFromProduction(tx: Tx, requestId: string): Promise<void> {
	await tx
		.update(menuItemsInKitchen)
		.set({ deletedAt: new Date().toISOString() })
		.where(and(eq(menuItemsInKitchen.originSnackRequestId, requestId), isNull(menuItemsInKitchen.deletedAt)))
}
