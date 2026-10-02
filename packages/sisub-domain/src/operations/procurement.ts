/**
 * Procurement operations — Drizzle query layer.
 *
 * fetchProcurementNeeds: agrega quantidades de insumo a partir de daily_menu num intervalo
 * (read-only; sem persistência). fetchUnitDashboard: anexos concluídos + itens de ARP com
 * consumo ≥ 80%, anotados com `in_upcoming_menu`.
 *
 * Contrato de retorno PRESERVADO (snake_case). Colunas `numeric` voltam como string no
 * Drizzle (PostgREST devolvia number) → coeridas com `Number(...)` onde o contrato é number.
 */

import {
	arpInProcurement,
	arpItemInProcurement,
	dailyMenuInKitchen,
	folderInKitchen,
	kitchenInKitchen,
	menuItemsInKitchen,
	quantityEstimateInProcurement,
	quantityEstimateItemInProcurement,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"
import { requireAnyPermission, requireUnit, requireUnscopedPermission } from "../guards/require-permission.ts"
import type { FetchProcurementNeeds, FetchUnitDashboard } from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import type { ProcurementNeed } from "../types/procurement.ts"
import { addCivilDays, brasiliaToday } from "../utils/civil-date.ts"
import { runQuery, toWire } from "../utils/index.ts"
import { scaleIngredientQuantity } from "./demand-math.ts"

type QuantityEstimate = Tables<"quantity_estimate">

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
	const { startDate, endDate, kitchenId, unitId } = input

	// Escopado pelo recorte pedido. O guard era `kitchen:1` SEM escopo, que aceita o grant de
	// QUALQUER cozinha: com ele, quem tinha uma cozinha lia o cardápio planejado de todas.
	//   - por cozinha: `kitchen:1` nela, ou `storage:1` nela (a reposição do almoxarifado
	//     chama isto com o ctx do estoque — `replenishment.fn`);
	//   - por unidade: `unit:1` nela;
	//   - sem recorte (a FAB inteira): só a permissão sem escopo.
	if (kitchenId != null) requireAnyPermission(ctx, ["kitchen", "storage"], 1, { type: "kitchen", id: kitchenId })
	else if (unitId != null) requireUnit(ctx, 1, unitId)
	else requireUnscopedPermission(ctx, "kitchen", 1)

	let kitchenIds: number[] | undefined
	if (unitId) {
		const kitchens = await runQuery("QUERY_FAILED", () =>
			db.select({ id: kitchenInKitchen.id }).from(kitchenInKitchen).where(eq(kitchenInKitchen.unitId, unitId))
		)
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
			// NULL é "não excluído": a coluna é nullable e sem default, e o aplicador de template não a
			// preenche. Com `= 0` puro, todo item aplicado por template ficava fora — a reposição do
			// estoque dizia "nenhuma necessidade" com o mês inteiro planejado e o estoque zerado.
			.where(
				and(
					...dailyMenuWhere,
					isNull(menuItemsInKitchen.deletedAt),
					or(isNull(menuItemsInKitchen.excludedFromProcurement), eq(menuItemsInKitchen.excludedFromProcurement, 0))
				)
			)
	)

	if (menuRows.length === 0) return []

	const recipeIds = [...new Set(menuRows.map((m) => m.recipeOriginId).filter((id): id is string => id !== null))]
	if (recipeIds.length === 0) return []

	// Folder buscado à parte: aninhá-lo aqui (4º nível) estoura o limite de 63 chars
	// de alias do Postgres — os aliases profundos colidem após truncar → 42703.
	const recipes = await runQuery("QUERY_FAILED", () =>
		db.query.recipesInKitchen.findMany({
			columns: { id: true, portionYield: true },
			with: {
				recipeIngredientsInKitchens: {
					columns: { ingredientId: true, netQuantity: true },
					with: {
						ingredientInKitchen: {
							columns: { id: true, description: true, measureUnit: true, folderId: true },
						},
					},
				},
			},
			where: inArray(recipesInKitchen.id, recipeIds),
		})
	)
	if (recipes.length === 0) return []

	const recipeById = new Map(recipes.map((r) => [r.id, r]))

	const folderIds = [
		...new Set(recipes.flatMap((r) => r.recipeIngredientsInKitchens.map((ri) => ri.ingredientInKitchen?.folderId).filter((id): id is string => id != null))),
	]
	const folders =
		folderIds.length > 0
			? await runQuery("QUERY_FAILED", () =>
					db.query.folderInKitchen.findMany({ columns: { id: true, description: true }, where: inArray(folderInKitchen.id, folderIds) })
				)
			: []
	const folderById = new Map(folders.map((f) => [f.id, f]))

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
			estimated_quantity: number
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
				existing.estimated_quantity += quantityNeeded
			} else {
				const folder = ingredientRaw.folderId != null ? (folderById.get(ingredientRaw.folderId) ?? null) : null
				needsMap.set(ingredientId, {
					ingredient: {
						id: ingredientRaw.id,
						description: ingredientRaw.description,
						measure_unit: ingredientRaw.measureUnit,
						folder_id: ingredientRaw.folderId,
						folder: folder ? { id: folder.id, description: folder.description } : null,
					},
					estimated_quantity: quantityNeeded,
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
		estimated_quantity: Number(d.estimated_quantity.toFixed(4)),
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
	/** Nulo quando a ARP não teve anexo quantitativo feito no sistema (ata de outro órgão, carona). */
	quantity_estimate_id: string | null
	quantity_estimate_title: string
	ingredient_id: string | null
	ingredient_name: string | null
	in_upcoming_menu: boolean
}

/**
 * Anexos quantitativos concluídos e itens de ARP com saldo baixo (≥ 80% consumido) da unidade,
 * com a marca `in_upcoming_menu`.
 *
 * Sete passos:
 *   (1) anexos não excluídos → só os concluídos;
 *   (2) ARPs ligadas a eles;
 *   (3) itens das ARPs com o item do anexo (para o `ingredient_id`);
 *   (4) filtro: qtdeEmpenhada / qtdeHomologada ≥ 0,8;
 *   (5) `ingredient_id` dos itens que sobraram;
 *   (6) cardápios dos próximos 30 dias nas cozinhas da unidade, para o `in_upcoming_menu`;
 *   (7) ordem: `in_upcoming_menu` primeiro, depois `consumption_pct` decrescente.
 * Sai cedo, com `low_balance_items` vazio, nos passos (1), (2) e (4) quando não há o que mostrar.
 */
export async function fetchUnitDashboard(
	db: SisubDb,
	ctx: UserContext,
	input: FetchUnitDashboard
): Promise<{ completed_quantity_estimates: QuantityEstimate[]; low_balance_items: DashboardArpItemRow[] }> {
	// Anexos, saldo de ARP e cardápio planejado da OM: só quem lê a unidade. Antes a fn só
	// exigia sessão, e o `unitId` do corpo abria o painel de qualquer OM.
	requireUnit(ctx, 1, input.unitId)
	// ── 1. Anexos concluídos não excluídos da unidade ───────────────────────────
	const completedQuantityEstimateRows = await runQuery("QUERY_FAILED", () =>
		db
			.select()
			.from(quantityEstimateInProcurement)
			.where(
				and(
					eq(quantityEstimateInProcurement.unitId, input.unitId),
					eq(quantityEstimateInProcurement.status, "completed"),
					isNull(quantityEstimateInProcurement.deletedAt)
				)
			)
			.orderBy(desc(quantityEstimateInProcurement.createdAt))
	)

	const completedQuantityEstimates = completedQuantityEstimateRows.map((a) => toWire<QuantityEstimate>(a))
	const completedQuantityEstimateIds = completedQuantityEstimateRows.map((a) => a.id)

	if (completedQuantityEstimateIds.length === 0) {
		return { completed_quantity_estimates: completedQuantityEstimates, low_balance_items: [] }
	}

	// ── 2. ARPs vinculadas aos anexos concluídos ──────────────────────────────
	const arpsData = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				id: arpInProcurement.id,
				quantityEstimateId: arpInProcurement.quantityEstimateId,
				numeroAta: arpInProcurement.numeroAta,
				anoAta: arpInProcurement.anoAta,
				dataVigenciaFim: arpInProcurement.dataVigenciaFim,
			})
			.from(arpInProcurement)
			.where(inArray(arpInProcurement.quantityEstimateId, completedQuantityEstimateIds))
	)

	if (arpsData.length === 0) {
		return { completed_quantity_estimates: completedQuantityEstimates, low_balance_items: [] }
	}

	const arpIds = arpsData.map((a) => a.id)
	const quantityEstimateIdToTitle = new Map(completedQuantityEstimateRows.map((a) => [a.id, a.title]))
	const arpById = new Map(arpsData.map((a) => [a.id, a]))

	// ── 3. Itens das ARPs com join no item do anexo (para ingredient_id) ──────
	// Join explícito pela coluna do item do anexo (`quantity_estimate_item_id`).
	const arpItems = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				id: arpItemInProcurement.id,
				arpId: arpItemInProcurement.arpId,
				numeroItem: arpItemInProcurement.numeroItem,
				catmatItemCodigo: arpItemInProcurement.catmatItemCodigo,
				descricaoItem: arpItemInProcurement.descricaoItem,
				nomeFornecedor: arpItemInProcurement.nomeFornecedor,
				valorUnitario: arpItemInProcurement.valorUnitario,
				quantidadeHomologada: arpItemInProcurement.quantidadeHomologada,
				quantidadeEmpenhada: arpItemInProcurement.quantidadeEmpenhada,
				saldoEmpenho: arpItemInProcurement.saldoEmpenho,
				medidaCatmat: arpItemInProcurement.medidaCatmat,
				listItemIngredientId: quantityEstimateItemInProcurement.ingredientId,
				listItemIngredientName: quantityEstimateItemInProcurement.ingredientName,
			})
			.from(arpItemInProcurement)
			.leftJoin(quantityEstimateItemInProcurement, eq(quantityEstimateItemInProcurement.id, arpItemInProcurement.quantityEstimateItemId))
			.where(inArray(arpItemInProcurement.arpId, arpIds))
	)

	// ── 4. Filtrar itens com consumo ≥ 80% ───────────────────────────────────
	const relevantItems = arpItems.filter((item) => {
		const qtdHom = Number(item.quantidadeHomologada ?? 0)
		const qtdEmp = Number(item.quantidadeEmpenhada ?? 0)
		if (qtdHom <= 0) return false
		return qtdEmp / qtdHom >= 0.8
	})

	if (relevantItems.length === 0) {
		return { completed_quantity_estimates: completedQuantityEstimates, low_balance_items: [] }
	}

	// ── 5. Coletar ingredient_ids dos itens relevantes ───────────────────────
	const ingredientIds = relevantItems.map((item) => item.listItemIngredientId).filter((id): id is string => Boolean(id))

	// ── 6. Verificar quais ingredientes aparecem em menus dos próximos 30 dias ─
	const upcomingIngredientIds = new Set<string>()

	if (ingredientIds.length > 0) {
		const kitchens = await runQuery("QUERY_FAILED", () =>
			db.select({ id: kitchenInKitchen.id }).from(kitchenInKitchen).where(eq(kitchenInKitchen.unitId, input.unitId))
		)
		const kitchenIds = kitchens.map((k) => k.id)

		if (kitchenIds.length > 0) {
			const today = brasiliaToday()
			const future = addCivilDays(today, 30)

			// DUAS queries de propósito (mesmo split de production.ts): daily_menu →
			// menu_items → recipes → recipe_ingredients numa query só estoura o limite
			// de 63 chars de alias do Postgres — os identificadores truncados colidem
			// → 42703 ou resultado vazio silencioso.
			const menus = await runQuery("QUERY_FAILED", () =>
				db.query.dailyMenuInKitchen.findMany({
					columns: { id: true },
					with: {
						menuItemsInKitchens: { columns: { id: true, deletedAt: true, recipeOriginId: true } },
					},
					where: and(
						inArray(dailyMenuInKitchen.kitchenId, kitchenIds),
						gte(dailyMenuInKitchen.serviceDate, today),
						lte(dailyMenuInKitchen.serviceDate, future),
						isNull(dailyMenuInKitchen.deletedAt)
					),
				})
			)

			const menuRecipeIds = [
				...new Set(
					menus.flatMap((menu) =>
						menu.menuItemsInKitchens
							.filter((menuItem) => !menuItem.deletedAt)
							.map((menuItem) => menuItem.recipeOriginId)
							.filter((id): id is string => id != null)
					)
				),
			]

			if (menuRecipeIds.length > 0) {
				const menuRecipes = await runQuery("QUERY_FAILED", () =>
					db.query.recipesInKitchen.findMany({
						columns: { id: true },
						with: { recipeIngredientsInKitchens: { columns: { ingredientId: true } } },
						where: inArray(recipesInKitchen.id, menuRecipeIds),
					})
				)

				for (const recipe of menuRecipes) {
					for (const ing of recipe.recipeIngredientsInKitchens) {
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

		const ingredientId = item.listItemIngredientId ?? null

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
			quantity_estimate_id: arp.quantityEstimateId,
			quantity_estimate_title: arp.quantityEstimateId ? (quantityEstimateIdToTitle.get(arp.quantityEstimateId) ?? "—") : "Sem anexo quantitativo",
			ingredient_id: ingredientId,
			ingredient_name: item.listItemIngredientName ?? item.descricaoItem,
			in_upcoming_menu: ingredientId ? upcomingIngredientIds.has(ingredientId) : false,
		})
	}

	// Críticos no cardápio primeiro, depois por % de consumo decrescente
	lowBalanceItems.sort((a, b) => {
		if (a.in_upcoming_menu !== b.in_upcoming_menu) return a.in_upcoming_menu ? -1 : 1
		return b.consumption_pct - a.consumption_pct
	})

	return { completed_quantity_estimates: completedQuantityEstimates, low_balance_items: lowBalanceItems }
}
