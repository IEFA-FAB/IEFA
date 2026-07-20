/**
 * Procurement operations — Drizzle query layer.
 *
 * fetchProcurementNeeds: agrega quantidades de insumo a partir de daily_menu num intervalo
 * (read-only; sem persistência). fetchUnitDashboard: ATAs publicadas + itens de ARP com
 * consumo ≥ 80%, anotados com `in_upcoming_menu`.
 *
 * Contrato de retorno PRESERVADO (snake_case). Colunas `numeric` voltam como string no
 * Drizzle (PostgREST devolvia number) → coeridas com `Number(...)` onde o contrato é number.
 */

import {
	dailyMenuInKitchen,
	kitchenInCore,
	menuItemsInKitchen,
	procurementArpInProcurement,
	procurementArpItemInProcurement,
	procurementListInProcurement,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { FetchProcurementNeeds, FetchUnitDashboard } from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import type { ProcurementNeed } from "../types/procurement.ts"
import { runQuery, toWire } from "../utils/index.ts"
import { scaleIngredientQuantity } from "./demand-math.ts"

type ProcurementList = Tables<"procurement_list">

/** Coage `numeric` (string no Drizzle) → number, preservando null. */
function num(v: string | number | null | undefined): number | null {
	if (v === null || v === undefined) return null
	return Number(v)
}

/**
 * 6-step pipeline:
 *   (1) Resolve unit → kitchenIds if unitId provided.
 *   (2) Fetch daily_menu + menu_items in date range (excludes excluded_from_procurement + soft-deleted).
 *   (3) Collect unique recipe IDs + fetch with ingredients.
 *   (4) Aggregate by ingredient_id: quantity = net_quantity × (plannedQty / portionYield).
 *   (5) Format quantities to 4 decimal places.
 *   (6) Sort by folder_description → ingredient_name (pt-BR collation).
 */
export async function fetchProcurementNeeds(db: SisubDb, ctx: UserContext, input: FetchProcurementNeeds): Promise<ProcurementNeed[]> {
	requirePermission(ctx, "kitchen", 1)

	const { startDate, endDate, kitchenId, unitId } = input

	let kitchenIds: number[] | undefined
	if (unitId) {
		const kitchens = await runQuery("QUERY_FAILED", () => db.select({ id: kitchenInCore.id }).from(kitchenInCore).where(eq(kitchenInCore.unitId, unitId)))
		kitchenIds = kitchens.map((k) => k.id)
		if (kitchenIds.length === 0) return []
	}

	// daily_menu (filtro service_date/kitchen + soft delete) ⋈ menu_items (não excluído, não soft-deleted).
	const dailyMenuWhere = [gte(dailyMenuInKitchen.serviceDate, startDate), lte(dailyMenuInKitchen.serviceDate, endDate), isNull(dailyMenuInKitchen.deletedAt)]
	if (kitchenId != null) dailyMenuWhere.push(eq(dailyMenuInKitchen.kitchenId, kitchenId))
	else if (kitchenIds) dailyMenuWhere.push(inArray(dailyMenuInKitchen.kitchenId, kitchenIds))

	const menuRows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				plannedPortionQuantity: menuItemsInKitchen.plannedPortionQuantity,
				recipeOriginId: menuItemsInKitchen.recipeOriginId,
			})
			.from(menuItemsInKitchen)
			.innerJoin(dailyMenuInKitchen, eq(menuItemsInKitchen.dailyMenuId, dailyMenuInKitchen.id))
			.where(and(...dailyMenuWhere, isNull(menuItemsInKitchen.deletedAt), eq(menuItemsInKitchen.excludedFromProcurement, "0")))
	)

	if (menuRows.length === 0) return []

	const recipeIds = [...new Set(menuRows.map((m) => m.recipeOriginId).filter((id): id is string => id !== null))]
	if (recipeIds.length === 0) return []

	const recipes = await runQuery("QUERY_FAILED", () =>
		db.query.recipesInKitchen.findMany({
			columns: { id: true, portionYield: true },
			with: {
				recipeIngredientsInKitchens: {
					columns: { ingredientId: true, netQuantity: true },
					with: {
						ingredientInKitchen: {
							columns: { id: true, description: true, measureUnit: true, folderId: true },
							with: { folderInKitchen: { columns: { id: true, description: true } } },
						},
					},
				},
			},
			where: inArray(recipesInKitchen.id, recipeIds),
		})
	)
	if (recipes.length === 0) return []

	const recipeById = new Map(recipes.map((r) => [r.id, r]))

	const needsMap = new Map<
		string,
		{
			ingredient: {
				id: string
				description: string | null
				measure_unit: string | null
				folder_id: string | null
				folder?: { id: string; description: string | null } | null
			}
			total_quantity: number
		}
	>()

	for (const menuItem of menuRows) {
		if (!menuItem.recipeOriginId) continue
		const recipe = recipeById.get(menuItem.recipeOriginId)
		if (!recipe) continue

		for (const ri of recipe.recipeIngredientsInKitchens) {
			const ingredientRaw = ri.ingredientInKitchen
			if (!ingredientRaw) continue

			const ingredientId = ri.ingredientId
			if (!ingredientId) continue
			// Ajuste fino datado: uma ocorrência concreta por menu_item (repetitions = 1).
			// demand = planned_portion_quantity (nº de comensais do item).
			const quantityNeeded = scaleIngredientQuantity(
				Number(ri.netQuantity ?? 0),
				Number(menuItem.plannedPortionQuantity ?? 0),
				Number(recipe.portionYield ?? 0)
			)

			const existing = needsMap.get(ingredientId)
			if (existing) {
				existing.total_quantity += quantityNeeded
			} else {
				needsMap.set(ingredientId, {
					ingredient: {
						id: ingredientRaw.id,
						description: ingredientRaw.description,
						measure_unit: ingredientRaw.measureUnit,
						folder_id: ingredientRaw.folderId,
						folder: ingredientRaw.folderInKitchen ? { id: ingredientRaw.folderInKitchen.id, description: ingredientRaw.folderInKitchen.description } : null,
					},
					total_quantity: quantityNeeded,
				})
			}
		}
	}

	const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => ({
		folder_id: d.ingredient.folder_id,
		folder_description: d.ingredient.folder?.description ?? null,
		ingredient_id: ingredientId,
		ingredient_name: d.ingredient.description ?? "",
		measure_unit: d.ingredient.measure_unit,
		total_quantity: Number(d.total_quantity.toFixed(4)),
		purchase_item_id: null,
		purchase_item_description: null,
		purchase_measure_unit: null,
		purchase_quantity: null,
		conversion_factor: null,
		catmat_item_codigo: null,
		catmat_item_descricao: null,
		unit_price: null,
		item_description: null,
	}))

	needs.sort((a, b) => {
		const folderA = a.folder_description ?? "Sem categoria"
		const folderB = b.folder_description ?? "Sem categoria"
		if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
		return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
	})

	return needs
}

type DashboardArpItemRow = {
	id: string
	arp_id: string
	numero_item: number | null
	catmat_item_codigo: number | null
	descricao_item: string | null
	nome_fornecedor: string | null
	medida_catmat: string | null
	quantidade_homologada: number | null
	quantidade_empenhada: number | null
	saldo_empenho: number | null
	valor_unitario: number | null
	consumption_pct: number
	arp_numero_ata: string
	arp_ano_ata: string | null
	arp_vigencia_fim: string | null
	ata_id: string
	ata_title: string
	ingredient_id: string | null
	ingredient_name: string | null
	in_upcoming_menu: boolean
}

/**
 * Returns published ATAs and low-balance ARP items (≥80% consumed) for a unit,
 * annotated with in_upcoming_menu flag.
 *
 * 7-step pipeline:
 *   (1) Fetch all non-deleted ATAs → filter published.
 *   (2) Fetch ARPs linked to published ATAs.
 *   (3) Fetch ARP items with ata_item join (for ingredient_id).
 *   (4) Filter: qtdeEmpenhada / qtdeHomologada ≥ 0.8.
 *   (5) Collect ingredient_ids from relevant items.
 *   (6) Check upcoming menus (today + 30 days) across unit kitchens to compute in_upcoming_menu.
 *   (7) Sort: in_upcoming_menu=true first, then consumption_pct descending.
 * Returns early with empty low_balance_items at steps (1), (2) and (4) if no qualifying data found.
 */
export async function fetchUnitDashboard(
	db: SisubDb,
	_ctx: UserContext,
	input: FetchUnitDashboard
): Promise<{ published_atas: ProcurementList[]; low_balance_items: DashboardArpItemRow[] }> {
	// ── 1. Todas as ATAs não deletadas da unidade ─────────────────────────────
	const allAtas = await runQuery("QUERY_FAILED", () =>
		db
			.select()
			.from(procurementListInProcurement)
			.where(and(eq(procurementListInProcurement.unitId, input.unitId), isNull(procurementListInProcurement.deletedAt)))
			.orderBy(desc(procurementListInProcurement.createdAt))
	)

	const publishedAtasRows = allAtas.filter((a) => a.status === "published")
	const publishedAtas = publishedAtasRows.map((a) => toWire<ProcurementList>(a))
	const publishedAtaIds = publishedAtasRows.map((a) => a.id)

	if (publishedAtaIds.length === 0) {
		return { published_atas: publishedAtas, low_balance_items: [] }
	}

	// ── 2. ARPs vinculadas às ATAs publicadas ─────────────────────────────────
	const arpsData = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				id: procurementArpInProcurement.id,
				ataId: procurementArpInProcurement.ataId,
				numeroAta: procurementArpInProcurement.numeroAta,
				anoAta: procurementArpInProcurement.anoAta,
				dataVigenciaFim: procurementArpInProcurement.dataVigenciaFim,
			})
			.from(procurementArpInProcurement)
			.where(inArray(procurementArpInProcurement.ataId, publishedAtaIds))
	)

	if (arpsData.length === 0) {
		return { published_atas: publishedAtas, low_balance_items: [] }
	}

	const arpIds = arpsData.map((a) => a.id)
	const ataIdToTitle = new Map(publishedAtasRows.map((a) => [a.id, a.title]))
	const arpById = new Map(arpsData.map((a) => [a.id, a]))

	// ── 3. Itens das ARPs com join no item da ATA (para ingredient_id) ────────
	const arpItems = await runQuery("QUERY_FAILED", () =>
		db.query.procurementArpItemInProcurement.findMany({
			columns: {
				id: true,
				arpId: true,
				numeroItem: true,
				catmatItemCodigo: true,
				descricaoItem: true,
				nomeFornecedor: true,
				valorUnitario: true,
				quantidadeHomologada: true,
				quantidadeEmpenhada: true,
				saldoEmpenho: true,
				medidaCatmat: true,
			},
			with: { procurementListItemInProcurement: { columns: { id: true, ingredientId: true, ingredientName: true } } },
			where: inArray(procurementArpItemInProcurement.arpId, arpIds),
		})
	)

	// ── 4. Filtrar itens com consumo ≥ 80% ───────────────────────────────────
	const relevantItems = arpItems.filter((item) => {
		const qtdHom = Number(item.quantidadeHomologada ?? 0)
		const qtdEmp = Number(item.quantidadeEmpenhada ?? 0)
		if (qtdHom <= 0) return false
		return qtdEmp / qtdHom >= 0.8
	})

	if (relevantItems.length === 0) {
		return { published_atas: publishedAtas, low_balance_items: [] }
	}

	// ── 5. Coletar ingredient_ids dos itens relevantes ───────────────────────
	const ingredientIds = relevantItems.map((item) => item.procurementListItemInProcurement?.ingredientId ?? null).filter((id): id is string => Boolean(id))

	// ── 6. Verificar quais ingredientes aparecem em menus dos próximos 30 dias ─
	const upcomingIngredientIds = new Set<string>()

	if (ingredientIds.length > 0) {
		const kitchens = await runQuery("QUERY_FAILED", () => db.select({ id: kitchenInCore.id }).from(kitchenInCore).where(eq(kitchenInCore.unitId, input.unitId)))
		const kitchenIds = kitchens.map((k) => k.id)

		if (kitchenIds.length > 0) {
			const today = new Date().toISOString().substring(0, 10)
			const future = new Date(Date.now() + 30 * 86_400_000).toISOString().substring(0, 10)

			const menus = await runQuery("QUERY_FAILED", () =>
				db.query.dailyMenuInKitchen.findMany({
					columns: { id: true },
					with: {
						menuItemsInKitchens: {
							columns: { id: true, deletedAt: true },
							with: {
								recipesInKitchen: {
									columns: { id: true },
									with: { recipeIngredientsInKitchens: { columns: { ingredientId: true } } },
								},
							},
						},
					},
					where: and(
						inArray(dailyMenuInKitchen.kitchenId, kitchenIds),
						gte(dailyMenuInKitchen.serviceDate, today),
						lte(dailyMenuInKitchen.serviceDate, future),
						isNull(dailyMenuInKitchen.deletedAt)
					),
				})
			)

			for (const menu of menus) {
				for (const menuItem of menu.menuItemsInKitchens) {
					if (menuItem.deletedAt) continue
					const recipeOrigin = menuItem.recipesInKitchen
					if (!recipeOrigin) continue
					for (const ing of recipeOrigin.recipeIngredientsInKitchens) {
						if (ing.ingredientId) upcomingIngredientIds.add(ing.ingredientId)
					}
				}
			}
		}
	}

	// ── 7. Montar lista final ─────────────────────────────────────────────────
	const lowBalanceItems: DashboardArpItemRow[] = []

	for (const item of relevantItems) {
		const arp = arpById.get(item.arpId)
		if (!arp) continue

		const ataItem = item.procurementListItemInProcurement
		const ingredientId = ataItem?.ingredientId ?? null

		const qtdHom = Number(item.quantidadeHomologada ?? 0)
		const qtdEmp = Number(item.quantidadeEmpenhada ?? 0)
		const consumptionPct = qtdHom > 0 ? Math.round((qtdEmp / qtdHom) * 100) : 0

		lowBalanceItems.push({
			id: item.id,
			arp_id: item.arpId,
			numero_item: item.numeroItem,
			catmat_item_codigo: item.catmatItemCodigo,
			descricao_item: item.descricaoItem,
			nome_fornecedor: item.nomeFornecedor,
			medida_catmat: item.medidaCatmat,
			quantidade_homologada: num(item.quantidadeHomologada),
			quantidade_empenhada: num(item.quantidadeEmpenhada),
			saldo_empenho: num(item.saldoEmpenho),
			valor_unitario: num(item.valorUnitario),
			consumption_pct: consumptionPct,
			arp_numero_ata: arp.numeroAta,
			arp_ano_ata: arp.anoAta,
			arp_vigencia_fim: arp.dataVigenciaFim,
			ata_id: arp.ataId,
			ata_title: ataIdToTitle.get(arp.ataId) ?? "—",
			ingredient_id: ingredientId,
			ingredient_name: ataItem?.ingredientName ?? item.descricaoItem,
			in_upcoming_menu: ingredientId ? upcomingIngredientIds.has(ingredientId) : false,
		})
	}

	// Críticos no cardápio primeiro, depois por % de consumo decrescente
	lowBalanceItems.sort((a, b) => {
		if (a.in_upcoming_menu !== b.in_upcoming_menu) return a.in_upcoming_menu ? -1 : 1
		return b.consumption_pct - a.consumption_pct
	})

	return { published_atas: publishedAtas, low_balance_items: lowBalanceItems }
}
