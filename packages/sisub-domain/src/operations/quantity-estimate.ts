/**
 * Ciclo de vida do anexo quantitativo: cálculo das necessidades, criação, transições de status e
 * exclusão lógica. Camada de consulta em Drizzle (migração PostgREST→Drizzle).
 *
 * Auth: LEITURA exige `unit:1` na unidade dona do anexo; ESCRITA, `unit:2`. Sete das dez escritas
 * recebem só um id — a unidade sai da linha persistida, nunca do input (ver `authorizeQuantityEstimate`/
 * `authorizeQuantityEstimateItem` e `quantity-estimate.authz.test.ts`). O que o anexo CITA também é conferido contra ele:
 * cozinhas e planos de cardápio são da OM (`assertSelectionsBelongToUnit`), itens atualizados
 * por id são do próprio anexo (predicado com `quantity_estimate_id`), e pesquisa de preço só é religada quando
 * está solta ou já é da mesma OM (`filterOwnResearchLinks`). O cálculo de necessidades, que não
 * grava nada, exige alcançar cada cozinha selecionada (`authorizeNeedsSelections`).
 *
 * Contrato de retorno PRESERVADO (snake_case aninhado) via `toWire()`; o Drizzle
 * devolve colunas camelCase e relations com nomes gerados pelo `drizzle-kit pull`.
 *
 * Mensagens de erro especiais (`Erro ao ...: message`) preservadas (prefixo +
 * mensagem do driver). Mutações multi-tabela rodam em `db.transaction` (bug fix
 * vs original PostgREST: falha parcial agora desfaz tudo, sem linhas órfãs).
 *
 * Colunas `numeric` voltam como string no Drizzle (PostgREST devolvia number):
 * escritas embrulham números com `String(...)`; aritmética/agregação lê com `Number(...)`.
 */

import {
	folderInKitchen,
	ingredientInKitchen,
	kitchenInKitchen,
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	menuTemplateMealInKitchen,
	priceResearchInProcurement,
	priceResearchItemInProcurement,
	purchaseItemIngredientInProcurement,
	purchaseItemInProcurement,
	quantityEstimateInProcurement,
	quantityEstimateItemInProcurement,
	quantityEstimateKitchenInProcurement,
	quantityEstimateSelectionInProcurement,
	quantityEstimateSnapshotComponentInProcurement,
	quantityEstimateSnapshotSelectionInProcurement,
	recipeIngredientsInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { canReachKitchen, type KitchenUnitRef, kitchenBelongsToUnit } from "../guards/kitchen-unit.ts"
import { requireUnit } from "../guards/require-permission.ts"
import type {
	CalculateQuantityEstimateNeeds,
	CreateQuantityEstimate,
	CreateQuantityEstimateDraft,
	DeleteQuantityEstimate,
	DraftItem,
	FetchQuantityEstimateDetails,
	FetchQuantityEstimateList,
	FinalizeQuantityEstimateDraft,
	SaveQuantityEstimateDraftItems,
	UpdateQuantityEstimateDraft,
	UpdateQuantityEstimateItemDescription,
	UpdateQuantityEstimateItemPrices,
	UpdateQuantityEstimateLimits,
	UpdateQuantityEstimateStatus,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import type { ProcurementNeed } from "../types/procurement.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"
import { resolveItemDemand, scaleIngredientQuantity } from "./demand-math.ts"
import { isSamePrice, toMeasureUnitCode } from "./price-units.ts"
import {
	computeMinQuoteQuantity,
	computeQuantityEstimateItemLimits,
	type QuantityLimits,
	requiresMaxQuantityJustification,
	resolveDeliveryCycle,
} from "./quantity-estimate-limits.ts"
import { findSegmentConflicts, lineKey, loadLiveSegment, resolveNeedsForSegment } from "./segments.ts"
import { eventItemBase, fetchEventMealBases } from "./template-event-meals.ts"
import { fetchTemplateMealsSafe } from "./template-meals.ts"

/**
 * Idade a partir da qual a pesquisa de preço pede renovação. É POLÍTICA INTERNA, sem citação
 * legal: os 6 meses do art. 5º, III e IV, da IN SEGES/ME 65/2021 valem para sítios e cotações, não
 * para a fonte oficial que o sisub consulta (preços de contratações de até 1 ano antes da pesquisa).
 */
export const PRICE_RESEARCH_VALIDITY_DAYS = 180

/** Status do anexo como a tela os chama (publicar é divulgar no PNCP; o anexo é concluído). */
const STATUS_LABELS: Record<string, string> = { draft: "em rascunho", completed: "concluído", archived: "arquivado" }

/** Transições de status permitidas do anexo. Concluído e arquivado são terminais quanto a downgrade. */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
	draft: ["completed", "archived"],
	completed: ["archived"],
	archived: [],
}

type TxClient = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

/** Lê o status atual do anexo ou lança se inexistente. */
async function getQuantityEstimateStatus(client: SisubDb | TxClient, quantityEstimateId: string): Promise<string> {
	const rows = await client
		.select({ status: quantityEstimateInProcurement.status })
		.from(quantityEstimateInProcurement)
		.where(eq(quantityEstimateInProcurement.id, quantityEstimateId))
	if (!rows[0]) throw new DomainError("NOT_FOUND", `anexo quantitativo ${quantityEstimateId} não encontrado`)
	return rows[0].status
}

/** Barra mutações de composição/quantitativo quando o anexo já saiu do rascunho. */
async function assertDraftEditable(client: SisubDb | TxClient, quantityEstimateId: string): Promise<void> {
	const status = await getQuantityEstimateStatus(client, quantityEstimateId)
	if (status !== "draft") {
		throw new DomainError(
			"QUANTITY_ESTIMATE_NOT_DRAFT",
			`O anexo quantitativo está ${STATUS_LABELS[status] ?? status}: composição e quantitativos são imutáveis depois de concluído`
		)
	}
}

type QuantityEstimate = Tables<"quantity_estimate">
type QuantityEstimateItem = Tables<"quantity_estimate_item">
type QuantityEstimateKitchen = Tables<"quantity_estimate_kitchen">
type QuantityEstimateSelection = Tables<"quantity_estimate_selection">

type QuantityEstimateSelectionWire = QuantityEstimateSelection & {
	template: { name: string | null; template_type: string; expected_monthly_occurrences: number | null } | null
}
type QuantityEstimateKitchenWire = QuantityEstimateKitchen & {
	kitchen: { id: number; display_name: string | null } | null
	selections: QuantityEstimateSelectionWire[]
}

type QuantityEstimateSnapshotSelection = {
	template_name: string | null
	template_type: string | null
	kitchen_id: number | null
	kitchen_name: string | null
	repetitions: number
	snapshot_source: string
}
type QuantityEstimateSnapshotComponent = {
	ingredient_id: string | null
	ingredient_name: string
	folder_description: string | null
	measure_unit: string | null
	estimated_quantity: number
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: number | null
	catmat_item_codigo: number | null
	unit_price: number | null
	snapshot_source: string
	max_increase_percent: number | null
	max_quantity: number | null
	delivery_cycle: string | null
	min_order_quantity: number | null
	min_quote_quantity: number | null
}
/** Metadados de integridade computados por request (não persistidos). */
type QuantityEstimateMeta = {
	is_stale: boolean
	price_research: { oldest_research_at: string | null; validity_days: number; is_expired: boolean }
	snapshot: { selections: QuantityEstimateSnapshotSelection[]; components: QuantityEstimateSnapshotComponent[] } | null
}
/** Item com o que decide o ciclo quando o anexo ainda não gravou o seu: padrão do insumo e conservação. */
type QuantityEstimateItemWire = QuantityEstimateItem & { conservation_class: string | null; ingredient_delivery_cycle: string | null }
type QuantityEstimateWithDetails = QuantityEstimate & { kitchens: QuantityEstimateKitchenWire[]; items: QuantityEstimateItemWire[]; meta: QuantityEstimateMeta }

type ItemInsert = typeof quantityEstimateItemInProcurement.$inferInsert

const DETAILS_RELATIONS: Record<string, string> = {
	quantityEstimateSelectionInProcurements: "selections",
	kitchenInKitchen: "kitchen",
	menuTemplateInKitchen: "template",
}

// ─── Calcular necessidades (sem persistir) ────────────────────────────────────

/**
 * Computes ingredient quantities needed to fulfill a set of menu template selections — read-only, no persistence.
 *
 * Resolves templates → recipes → ingredients; multiplies net_quantity by (headcount / portion_yield × repetitions).
 * Aggregates identical ingredient_ids across all kitchenSelections (weekly + events + exceptions combined).
 * Translates ingredient → purchase_item via is_default link, then sorts by folder_description → ingredient_name (pt-BR).
 */
export async function calculateQuantityEstimateNeeds(db: SisubDb, ctx: UserContext, input: CalculateQuantityEstimateNeeds): Promise<ProcurementNeed[]> {
	// Não grava nada, mas LÊ planos, receitas e insumos das cozinhas citadas — que vinham do
	// corpo. Sem isto, qualquer sessão abria o plano local de qualquer cozinha pelo cálculo.
	await authorizeNeedsSelections(db, ctx, input.kitchenSelections)
	return computeQuantityEstimateNeeds(db, input)
}

/** Uma parcela da quantidade de um insumo: um item de cardápio × as repetições da seleção. */
export interface NeedContribution {
	ingredientId: string
	kitchenId: number
	templateId: string
	templateType: string | null
	recipeId: string
	headcount: number
	netQuantity: number
	portionYield: number
	repetitions: number
	quantity: number
}

/**
 * O cálculo em si, sem autorização (quem chama já autorizou). Com `collect`, registra cada
 * parcela: é a memória de cálculo das quantidades (Lei 14.133/2021, art. 18, § 1º, IV), e sai da
 * MESMA travessia que produz o número — não de uma reconstrução à parte que pudesse divergir.
 */
async function computeQuantityEstimateNeeds(db: SisubDb, input: CalculateQuantityEstimateNeeds, collect?: NeedContribution[]): Promise<ProcurementNeed[]> {
	const { kitchenSelections } = input

	// Coletar as seleções dos três regimes (weekly, event, exception). `repetitions`
	// já chega normalizado como "vezes dentro da vigência do anexo" — a projeção
	// mensal da exceção é resolvida antes, no wizard.
	const allSelections = kitchenSelections.flatMap((ks) => [
		...ks.templateSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		...ks.eventSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		...(ks.exceptionSelections ?? []).map((s) => ({ ...s, kitchenId: ks.kitchenId })),
	])

	if (allSelections.length === 0) return []

	const uniqueTemplateIds = [...new Set(allSelections.map((s) => s.templateId))]

	// TRÊS queries de propósito (mesmo split de production.ts): aninhar template →
	// items → recipe → ingredients → ingredient → folder numa query só (5 níveis)
	// estoura o limite de 63 chars de alias do Postgres — os níveis profundos
	// colidem no identificador truncado → 42703 ou resultado vazio silencioso.
	// Receitas (3 níveis, dentro do limite) e folders são buscadas à parte e
	// juntadas em JS.
	const templates = await runQuery(
		"QUERY_FAILED",
		() =>
			db.query.menuTemplateInKitchen.findMany({
				columns: { id: true, templateType: true },
				with: {
					menuTemplateItemsInKitchens: {
						columns: { id: true, recipeId: true, headcountOverride: true, dayOfWeek: true, mealTypeId: true, recommendedProportion: true, eventMealId: true },
					},
				},
				where: inArray(menuTemplateInKitchen.id, uniqueTemplateIds),
			}),
		{ prefix: "Erro ao buscar templates" }
	)

	if (templates.length === 0) return []

	const templateMap = new Map(templates.map((t) => [t.id, t]))

	const recipeIds = [...new Set(templates.flatMap((t) => t.menuTemplateItemsInKitchens.map((item) => item.recipeId).filter((id): id is string => id != null)))]
	const recipes =
		recipeIds.length > 0
			? await runQuery(
					"QUERY_FAILED",
					() =>
						db.query.recipesInKitchen.findMany({
							columns: { id: true, portionYield: true },
							with: {
								recipeIngredientsInKitchens: {
									columns: { ingredientId: true, netQuantity: true },
									with: {
										ingredientInKitchen: { columns: { id: true, description: true, measureUnit: true, folderId: true, defaultDeliveryCycle: true } },
									},
								},
							},
							where: inArray(recipesInKitchen.id, recipeIds),
						}),
					{ prefix: "Erro ao buscar receitas" }
				)
			: []
	const recipeById = new Map(recipes.map((r) => [r.id, r]))

	const folderIds = [
		...new Set(recipes.flatMap((r) => r.recipeIngredientsInKitchens.map((ri) => ri.ingredientInKitchen?.folderId).filter((id): id is string => id != null))),
	]
	const folders =
		folderIds.length > 0
			? await runQuery(
					"QUERY_FAILED",
					() =>
						db.select({ id: folderInKitchen.id, description: folderInKitchen.description }).from(folderInKitchen).where(inArray(folderInKitchen.id, folderIds)),
					{ prefix: "Erro ao buscar pastas" }
				)
			: []
	const folderById = new Map(folders.map((f) => [f.id, f]))

	// Efetivo base por (template → dia:refeição). O headcount_override do item é exceção;
	// a base cobre os itens sem override (que antes eram pulados e não entravam na compra).
	// Lido à parte, tolerante à tabela ausente (migração pendente → base vazia, sem quebrar o anexo).
	// Evento mede pela própria refeição: o efetivo dela é a base da porcentagem dos itens.
	const eventTemplateIds = templates.filter((t) => t.templateType === "event").map((t) => t.id)
	const [mealsByTemplate, eventMealBases] = await Promise.all([fetchTemplateMealsSafe(db, uniqueTemplateIds), fetchEventMealBases(db, eventTemplateIds)])
	const baseByTemplateCell = new Map<string, Map<string, number>>()
	for (const t of templates) {
		const cells = new Map<string, number>()
		for (const meal of mealsByTemplate.get(t.id) ?? []) {
			if (meal.baseHeadcount != null) cells.set(`${meal.dayOfWeek}:${meal.mealTypeId}`, meal.baseHeadcount)
		}
		baseByTemplateCell.set(t.id, cells)
	}

	type NeedAccumulator = {
		ingredient: {
			id: string
			description: string | null
			measure_unit: string | null
			default_delivery_cycle: string | null
			folder_id: string | null
			folder?: { id: string; description: string | null } | null
		}
		estimated_quantity: number
	}
	const needsMap = new Map<string, NeedAccumulator>()

	for (const selection of allSelections) {
		const template = templateMap.get(selection.templateId)
		if (!template) continue
		const baseByCell = baseByTemplateCell.get(selection.templateId)

		for (const item of template.menuTemplateItemsInKitchens) {
			const recipeData = item.recipeId ? recipeById.get(item.recipeId) : undefined
			if (!recipeData) continue

			// Quantidade direta do item, senão a porcentagem sobre o efetivo base da refeição,
			// senão o efetivo cheio. Sem nenhum dos três o item não tem efetivo dimensionável
			// → não contribui para a compra.
			const headcount = resolveItemDemand({
				headcountOverride: item.headcountOverride,
				baseHeadcount: eventItemBase(item.eventMealId, eventMealBases, baseByCell?.get(`${item.dayOfWeek}:${item.mealTypeId}`) ?? null),
				recommendedProportion: item.recommendedProportion != null ? Number(item.recommendedProportion) : null,
			})
			if (!headcount) continue

			const portionYield = Number(recipeData.portionYield ?? 0)

			for (const ri of recipeData.recipeIngredientsInKitchens) {
				const ingredientRaw = ri.ingredientInKitchen
				if (!ingredientRaw || !ri.ingredientId) continue

				const folder = ingredientRaw.folderId ? (folderById.get(ingredientRaw.folderId) ?? null) : null
				const ingredient = {
					id: ingredientRaw.id,
					description: ingredientRaw.description,
					measure_unit: ingredientRaw.measureUnit,
					default_delivery_cycle: ingredientRaw.defaultDeliveryCycle,
					folder_id: ingredientRaw.folderId,
					folder: folder ? { id: folder.id, description: folder.description } : null,
				}

				// Aquisição: projeta o cardápio × repetições da seleção do anexo.
				const quantityNeeded = scaleIngredientQuantity(Number(ri.netQuantity ?? 0), headcount, portionYield, selection.repetitions)
				collect?.push({
					ingredientId: ri.ingredientId,
					kitchenId: selection.kitchenId,
					templateId: selection.templateId,
					templateType: template.templateType ?? null,
					recipeId: item.recipeId as string,
					headcount,
					netQuantity: Number(ri.netQuantity ?? 0),
					portionYield,
					repetitions: selection.repetitions,
					quantity: quantityNeeded,
				})

				const existing = needsMap.get(ri.ingredientId)
				if (existing) {
					existing.estimated_quantity += quantityNeeded
				} else {
					needsMap.set(ri.ingredientId, { ingredient, estimated_quantity: quantityNeeded })
				}
			}
		}
	}

	// Passo de tradução: ingredient → purchase_item (via is_default link, purchase_item não soft-deleted).
	const ingredientIds = Array.from(needsMap.keys())
	type PurchaseItemLink = {
		purchase_item_id: string
		purchase_item_description: string
		purchase_measure_unit: string | null
		catmat_item_codigo: number | null
		catmat_item_descricao: string | null
		unit_price: number | null
		conversion_factor: number
		conservation_class: string | null
	}
	const ingredientToPurchaseItem = new Map<string, PurchaseItemLink>()

	if (ingredientIds.length > 0) {
		const piLinks = await runQuery(
			"QUERY_FAILED",
			() =>
				db.query.purchaseItemIngredientInProcurement.findMany({
					columns: { ingredientId: true, conversionFactor: true },
					with: {
						purchaseItemInProcurement: {
							columns: {
								id: true,
								description: true,
								purchaseMeasureUnit: true,
								catmatItemCodigo: true,
								catmatItemDescricao: true,
								unitPrice: true,
								conservationClass: true,
								deletedAt: true,
							},
						},
					},
					where: and(inArray(purchaseItemIngredientInProcurement.ingredientId, ingredientIds), eq(purchaseItemIngredientInProcurement.isDefault, true)),
				}),
			{ prefix: "Erro ao buscar itens de compra" }
		)

		for (const link of piLinks) {
			const pi = link.purchaseItemInProcurement
			if (!pi || pi.deletedAt) continue
			ingredientToPurchaseItem.set(link.ingredientId, {
				purchase_item_id: pi.id,
				purchase_item_description: pi.description,
				purchase_measure_unit: pi.purchaseMeasureUnit,
				catmat_item_codigo: pi.catmatItemCodigo,
				catmat_item_descricao: pi.catmatItemDescricao,
				unit_price: pi.unitPrice === null ? null : Number(pi.unitPrice),
				conversion_factor: Number(link.conversionFactor),
				conservation_class: pi.conservationClass,
			})
		}
	}

	const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => {
		const pi = ingredientToPurchaseItem.get(ingredientId)
		const purchaseQuantity = pi ? Number((d.estimated_quantity / pi.conversion_factor).toFixed(4)) : null
		return {
			folder_id: d.ingredient.folder_id,
			folder_description: d.ingredient.folder?.description || null,
			ingredient_id: ingredientId,
			ingredient_name: d.ingredient.description || "",
			measure_unit: d.ingredient.measure_unit,
			estimated_quantity: Number(d.estimated_quantity.toFixed(4)),
			purchase_item_id: pi?.purchase_item_id ?? null,
			purchase_item_description: pi?.purchase_item_description ?? null,
			purchase_measure_unit: pi?.purchase_measure_unit ?? null,
			purchase_quantity: purchaseQuantity,
			conversion_factor: pi?.conversion_factor ?? null,
			catmat_item_codigo: pi?.catmat_item_codigo ?? null,
			catmat_item_descricao: pi?.catmat_item_descricao ?? null,
			unit_price: pi?.unit_price ?? null,
			item_description: null,
			conservation_class: pi?.conservation_class ?? null,
			ingredient_delivery_cycle: d.ingredient.default_delivery_cycle,
			// O cálculo já decide o ciclo deste anexo a partir do insumo; daqui em diante ele é
			// escolha GRAVADA no item, e mudar o insumo não mexe no anexo montado.
			delivery_cycle: resolveDeliveryCycle({ ingredientCycle: d.ingredient.default_delivery_cycle, conservationClass: pi?.conservation_class }).cycle,
		}
	})

	needs.sort((a, b) => {
		const folderA = a.folder_description || "Sem categoria"
		const folderB = b.folder_description || "Sem categoria"
		if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
		return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
	})

	return needs
}

// ─── Escopo das seleções (cozinha + plano) ────────────────────────────────────

type SelectionScopeInput = ReadonlyArray<{
	kitchenId: number
	templateSelections: ReadonlyArray<{ templateId: string }>
	eventSelections: ReadonlyArray<{ templateId: string }>
	exceptionSelections?: ReadonlyArray<{ templateId: string }>
}>

/** Só a cozinha COM seleção entra no anexo (as demais são puladas na gravação) — e só ela é conferida. */
function selectedKitchens(kitchenSelections: SelectionScopeInput) {
	return kitchenSelections
		.map((ks) => ({
			kitchenId: ks.kitchenId,
			templateIds: [...ks.templateSelections, ...ks.eventSelections, ...(ks.exceptionSelections ?? [])].map((s) => s.templateId),
		}))
		.filter((ks) => ks.templateIds.length > 0)
}

/**
 * Lê do banco a OM de cada cozinha e a cozinha dona de cada plano citado, e confere que todo
 * plano é da própria cozinha ou global. Devolve as cozinhas para o chamador decidir o resto
 * (pertencer à OM do anexo, ou ser alcançável por quem calcula).
 */
async function loadSelectionScope(client: SisubDb | TxClient, kitchenSelections: SelectionScopeInput): Promise<Map<number, KitchenUnitRef>> {
	const selected = selectedKitchens(kitchenSelections)
	if (selected.length === 0) return new Map()

	const kitchenIds = [...new Set(selected.map((ks) => ks.kitchenId))]
	const templateIds = [...new Set(selected.flatMap((ks) => ks.templateIds))]
	const [kitchens, templates] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			client
				.select({ id: kitchenInKitchen.id, unitId: kitchenInKitchen.unitId, purchaseUnitId: kitchenInKitchen.purchaseUnitId })
				.from(kitchenInKitchen)
				.where(inArray(kitchenInKitchen.id, kitchenIds))
		),
		runQuery("FETCH_FAILED", () =>
			client
				.select({ id: menuTemplateInKitchen.id, kitchenId: menuTemplateInKitchen.kitchenId })
				.from(menuTemplateInKitchen)
				.where(inArray(menuTemplateInKitchen.id, templateIds))
		),
	])
	const kitchenById = new Map(kitchens.map((k) => [k.id, k]))
	const templateOwner = new Map(templates.map((t) => [t.id, t.kitchenId]))

	for (const ks of selected) {
		if (!kitchenById.has(ks.kitchenId)) throw new DomainError("NOT_FOUND", `cozinha ${ks.kitchenId} não encontrada`)
		// Plano inexistente e plano local de OUTRA cozinha respondem igual: não é daqui.
		const foreign = ks.templateIds.filter((id) => {
			if (!templateOwner.has(id)) return true
			const owner = templateOwner.get(id)
			return owner != null && owner !== ks.kitchenId
		})
		if (foreign.length > 0) {
			throw new DomainError(
				"TEMPLATE_ACCESS_DENIED",
				`Plano(s) de cardápio que não são da cozinha ${ks.kitchenId} nem globais: ${[...new Set(foreign)].join(", ")}`
			)
		}
	}
	return kitchenById
}

/**
 * O anexo só compõe cozinhas da PRÓPRIA OM (lotação ou compra) com planos delas. O guard da
 * escrita prova só a unidade do anexo; as cozinhas e os planos vinham do corpo, e o anexo de uma
 * OM gravava — e depois publicava no snapshot — o cardápio de cozinha de outra.
 */
async function assertSelectionsBelongToUnit(client: SisubDb | TxClient, unitId: number, kitchenSelections: SelectionScopeInput): Promise<void> {
	const kitchens = await loadSelectionScope(client, kitchenSelections)
	for (const kitchen of kitchens.values()) {
		if (!kitchenBelongsToUnit(kitchen, unitId)) {
			throw new DomainError("KITCHEN_NOT_IN_UNIT", `A cozinha ${kitchen.id} não pertence à unidade ${unitId}`)
		}
	}
}

/** Cálculo sem anexo: quem calcula precisa alcançar cada cozinha (`kitchen:1` nela ou `unit:1` numa OM dela). */
async function authorizeNeedsSelections(db: SisubDb, ctx: UserContext, kitchenSelections: SelectionScopeInput): Promise<void> {
	const kitchens = await loadSelectionScope(db, kitchenSelections)
	for (const kitchen of kitchens.values()) {
		if (!canReachKitchen(ctx, 1, kitchen)) throw new PermissionDeniedError("kitchen | unit", 1, { type: "kitchen", id: kitchen.id })
	}
}

// ─── Pesquisa de preço citada pelo anexo ────────────────────────────────────────

/**
 * Filtra os vínculos de pesquisa de preço que o anexo pode reivindicar: cabeçalho e item SOLTOS
 * (recém-pesquisados no wizard) ou já ligados a um anexo da MESMA OM, e o item tem de ser do
 * cabeçalho citado.
 *
 * Os ids vinham do corpo e eram religados sem conferência: o anexo de uma OM "roubava" a memória
 * de cálculo de outra — e a limpeza de órfãs em `persistDraftItems` depois a APAGAVA. O vínculo
 * alheio é DESCARTADO em vez de recusar a gravação: a chave de idempotência da pesquisa avulsa
 * (sem anexo) é por CATMAT/dia/amostras, e duas OMs pesquisando o mesmo item no mesmo dia recebem
 * o mesmo id — recusar travaria o salvamento da segunda por uma colisão que ela não causou.
 */
async function filterOwnResearchLinks<T extends { researchId: string; researchItemId: string }>(
	client: SisubDb | TxClient,
	unitId: number,
	links: readonly T[]
): Promise<T[]> {
	if (links.length === 0) return []
	const headerIds = [...new Set(links.map((l) => l.researchId))]
	const itemIds = [...new Set(links.map((l) => l.researchItemId))]

	const [headers, items] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			client
				.select({
					id: priceResearchInProcurement.id,
					quantityEstimateId: priceResearchInProcurement.quantityEstimateId,
					unitId: quantityEstimateInProcurement.unitId,
				})
				.from(priceResearchInProcurement)
				.leftJoin(quantityEstimateInProcurement, eq(quantityEstimateInProcurement.id, priceResearchInProcurement.quantityEstimateId))
				.where(inArray(priceResearchInProcurement.id, headerIds))
		),
		runQuery("FETCH_FAILED", () =>
			client
				.select({
					id: priceResearchItemInProcurement.id,
					researchId: priceResearchItemInProcurement.researchId,
					quantityEstimateItemId: priceResearchItemInProcurement.quantityEstimateItemId,
					unitId: quantityEstimateInProcurement.unitId,
				})
				.from(priceResearchItemInProcurement)
				.leftJoin(quantityEstimateItemInProcurement, eq(quantityEstimateItemInProcurement.id, priceResearchItemInProcurement.quantityEstimateItemId))
				.leftJoin(quantityEstimateInProcurement, eq(quantityEstimateInProcurement.id, quantityEstimateItemInProcurement.quantityEstimateId))
				.where(inArray(priceResearchItemInProcurement.id, itemIds))
		),
	])

	const ownHeaders = new Set(headers.filter((h) => h.quantityEstimateId == null || h.unitId === unitId).map((h) => h.id))
	const researchOfOwnItem = new Map(items.filter((i) => i.quantityEstimateItemId == null || i.unitId === unitId).map((i) => [i.id, i.researchId]))
	return links.filter((l) => ownHeaders.has(l.researchId) && researchOfOwnItem.get(l.researchItemId) === l.researchId)
}

// ─── Anexo de uma contratação ─────────────────────────────────────────────────

/** Contratação viva da MESMA OM do anexo; a apagada não serve para anexo novo. */
async function assertSegmentOfUnit(client: SisubDb | TxClient, segmentId: string, unitId: number): Promise<void> {
	const segment = await loadLiveSegment(client, segmentId)
	if (segment.unitId !== unitId) throw new DomainError("SEGMENT_NOT_IN_UNIT", "A contratação é de outra OM.")
}

/** Quantos itens do cálculo ficaram fora do anexo desta contratação, por motivo. */
export interface SegmentExclusion {
	otherSegment: number
	unassigned: number
	conflict: number
}

/**
 * Cálculo do anexo de UMA contratação: o cálculo completo, filtrado pela resolução de cada
 * linha (item de compra) — planejar X produções e comprar só o segmento Y. Devolve também
 * quantos itens ficaram de fora, para o wizard dizer onde estão.
 */
export async function calculateQuantityEstimateNeedsForSegment(
	db: SisubDb,
	ctx: UserContext,
	input: CalculateQuantityEstimateNeeds & { segmentId: string }
): Promise<{ items: ProcurementNeed[]; excluded: SegmentExclusion }> {
	const segment = await loadLiveSegment(db, input.segmentId)
	requireUnit(ctx, 1, segment.unitId)
	await assertSelectionsBelongToUnit(db, segment.unitId, input.kitchenSelections)

	const needs = await calculateQuantityEstimateNeeds(db, ctx, input)
	const resolutions = await resolveNeedsForSegment(db, segment.unitId, needs)
	const excluded: SegmentExclusion = { otherSegment: 0, unassigned: 0, conflict: 0 }
	const items: ProcurementNeed[] = []
	for (const need of needs) {
		const resolution = resolutions.get(lineKey({ ingredientId: need.ingredient_id, purchaseItemId: need.purchase_item_id }))
		if (resolution?.kind === "assigned" && resolution.segmentId === input.segmentId) items.push(need)
		else if (resolution?.kind === "assigned") excluded.otherSegment++
		else if (resolution?.kind === "conflict") excluded.conflict++
		else excluded.unassigned++
	}
	return { items, excluded }
}

// ─── Memória de cálculo das quantidades ───────────────────────────────────────

export interface QuantityMemory {
	/** Itens recalculados com as seleções gravadas no anexo. */
	needs: ProcurementNeed[]
	/** Parcelas por insumo, já com os nomes de cozinha, cardápio e preparação. */
	contributions: Array<NeedContribution & { kitchenName: string; templateName: string; recipeName: string }>
}

/**
 * Memória de cálculo das quantidades do anexo: refaz o cálculo com as seleções GRAVADAS no anexo
 * (cozinhas, cardápios, repetições) e devolve cada parcela. Em anexo concluído, os números
 * congelados continuam sendo os do snapshot; quem imprime compara e declara a divergência.
 */
export async function explainQuantityEstimateNeeds(db: SisubDb, ctx: UserContext, input: { quantityEstimateId: string }): Promise<QuantityMemory> {
	await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId, 1)
	const rows = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({
					kitchenId: quantityEstimateKitchenInProcurement.kitchenId,
					kitchenName: kitchenInKitchen.displayName,
					templateId: quantityEstimateSelectionInProcurement.templateId,
					templateName: menuTemplateInKitchen.name,
					templateType: menuTemplateInKitchen.templateType,
					repetitions: quantityEstimateSelectionInProcurement.repetitions,
				})
				.from(quantityEstimateSelectionInProcurement)
				.innerJoin(
					quantityEstimateKitchenInProcurement,
					eq(quantityEstimateKitchenInProcurement.id, quantityEstimateSelectionInProcurement.quantityEstimateKitchenId)
				)
				.leftJoin(kitchenInKitchen, eq(kitchenInKitchen.id, quantityEstimateKitchenInProcurement.kitchenId))
				.leftJoin(menuTemplateInKitchen, eq(menuTemplateInKitchen.id, quantityEstimateSelectionInProcurement.templateId))
				.where(eq(quantityEstimateKitchenInProcurement.quantityEstimateId, input.quantityEstimateId)),
		{ prefix: "Erro ao ler as seleções do anexo" }
	)

	const byKitchen = new Map<number, CalculateQuantityEstimateNeeds["kitchenSelections"][number]>()
	for (const row of rows) {
		const entry = byKitchen.get(row.kitchenId) ?? {
			kitchenId: row.kitchenId,
			kitchenName: row.kitchenName ?? `Cozinha ${row.kitchenId}`,
			deliveryNotes: "",
			templateSelections: [],
			eventSelections: [],
			exceptionSelections: [],
		}
		const selection = { templateId: row.templateId, templateName: row.templateName ?? "", repetitions: row.repetitions }
		if (row.templateType === "event") entry.eventSelections.push(selection)
		else if (row.templateType === "exception") entry.exceptionSelections.push(selection)
		else entry.templateSelections.push(selection)
		byKitchen.set(row.kitchenId, entry)
	}

	const collected: NeedContribution[] = []
	const needs = await computeQuantityEstimateNeeds(db, { kitchenSelections: [...byKitchen.values()] }, collected)

	const recipeIds = [...new Set(collected.map((c) => c.recipeId))]
	const recipes =
		recipeIds.length === 0
			? []
			: await runQuery("FETCH_FAILED", () =>
					db.select({ id: recipesInKitchen.id, name: recipesInKitchen.name }).from(recipesInKitchen).where(inArray(recipesInKitchen.id, recipeIds))
				)
	const recipeName = new Map(recipes.map((r) => [r.id, r.name ?? "Preparação"]))
	const kitchenName = new Map(rows.map((r) => [r.kitchenId, r.kitchenName ?? `Cozinha ${r.kitchenId}`]))
	const templateName = new Map(rows.map((r) => [r.templateId, r.templateName ?? "Cardápio"]))

	return {
		needs,
		contributions: collected.map((c) => ({
			...c,
			kitchenName: kitchenName.get(c.kitchenId) ?? `Cozinha ${c.kitchenId}`,
			templateName: templateName.get(c.templateId) ?? "Cardápio",
			recipeName: recipeName.get(c.recipeId) ?? "Preparação",
		})),
	}
}

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

/**
 * Autoriza pela UNIDADE dona do anexo — ou do rascunho: são a mesma linha de `quantity_estimate`,
 * distinguidas por status —, lida do banco e nunca da requisição.
 *
 * Estas operações recebem só o id. Sem resolver o dono, qualquer detentor de `unit:2` numa OM
 * editava preço, descrição e status — ou apagava — o anexo de outra.
 */
async function authorizeQuantityEstimate(db: SisubDb, ctx: UserContext, quantityEstimateId: string, level: 1 | 2 = 2): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ unitId: quantityEstimateInProcurement.unitId })
			.from(quantityEstimateInProcurement)
			.where(eq(quantityEstimateInProcurement.id, quantityEstimateId))
			.limit(1)
	)
	const unitId = rows[0]?.unitId
	if (unitId == null) throw new DomainError("NOT_FOUND", `anexo quantitativo ${quantityEstimateId} não encontrado`)
	requireUnit(ctx, level, unitId)
	return unitId
}

/**
 * Idem, quando só o id do ITEM chega. Devolve o anexo dono para amarrar o predicado da mutação:
 * entre a checagem e a escrita o item pode ser reparentado, e um `where id = ?` cru aplicaria a
 * escrita a um item que já pertence a outro anexo.
 */
async function authorizeQuantityEstimateItem(db: SisubDb, ctx: UserContext, quantityEstimateItemId: string): Promise<string> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ quantityEstimateId: quantityEstimateItemInProcurement.quantityEstimateId })
			.from(quantityEstimateItemInProcurement)
			.where(eq(quantityEstimateItemInProcurement.id, quantityEstimateItemId))
			.limit(1)
	)
	const quantityEstimateId = rows[0]?.quantityEstimateId
	if (quantityEstimateId == null) throw new DomainError("NOT_FOUND", `item do anexo quantitativo ${quantityEstimateItemId} não encontrado`)
	await authorizeQuantityEstimate(db, ctx, quantityEstimateId)
	return quantityEstimateId
}

export async function createQuantityEstimateDraft(db: SisubDb, ctx: UserContext, input: CreateQuantityEstimateDraft): Promise<{ id: string }> {
	requireUnit(ctx, 2, input.unitId)

	const quantityEstimate = await insertOneOrFail(
		"INSERT_FAILED",
		"Erro ao criar rascunho: no row returned",
		() =>
			db
				.insert(quantityEstimateInProcurement)
				.values({ unitId: input.unitId, title: "Sem nome", status: "draft", wizardStep: 1 })
				.returning({ id: quantityEstimateInProcurement.id }),
		{ prefix: "Erro ao criar rascunho" }
	)
	return { id: quantityEstimate.id }
}

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export async function updateQuantityEstimateDraft(db: SisubDb, ctx: UserContext, input: UpdateQuantityEstimateDraft): Promise<void> {
	const unitId = await authorizeQuantityEstimate(db, ctx, input.draftId)
	if (input.kitchenSelections !== undefined) await assertSelectionsBelongToUnit(db, unitId, input.kitchenSelections)

	await db.transaction(async (tx) => {
		const updateData: Partial<typeof quantityEstimateInProcurement.$inferInsert> = { updatedAt: new Date().toISOString() }
		if (input.title !== undefined) updateData.title = input.title
		if (input.notes !== undefined) updateData.notes = input.notes || null
		if (input.wizardStep !== undefined) updateData.wizardStep = input.wizardStep
		if (input.validityMonths !== undefined) updateData.validityMonths = input.validityMonths
		if (input.segmentId !== undefined) {
			if (input.segmentId) await assertSegmentOfUnit(tx, input.segmentId, unitId)
			updateData.segmentId = input.segmentId
		}

		// Detecta draft inexistente (deletado mid-session) em vez de no-op silencioso — paridade com updateQuantityEstimateStatus/deleteQuantityEstimate.
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() =>
				tx
					.update(quantityEstimateInProcurement)
					.set(updateData)
					.where(eq(quantityEstimateInProcurement.id, input.draftId))
					.returning({ id: quantityEstimateInProcurement.id }),
			{ prefix: "Erro ao atualizar rascunho" }
		)

		if (input.kitchenSelections !== undefined) {
			// Substituição destrutiva (delete-all + re-insert) das cozinhas → seleções cascateiam via FK.
			await tx.delete(quantityEstimateKitchenInProcurement).where(eq(quantityEstimateKitchenInProcurement.quantityEstimateId, input.draftId))

			for (const ks of input.kitchenSelections) {
				const allSels = [...ks.templateSelections, ...ks.eventSelections, ...(ks.exceptionSelections ?? [])]
				if (allSels.length === 0) continue

				const quantityEstimateKitchen = await insertOneOrFail(
					"INSERT_FAILED",
					"Erro ao salvar cozinha: no row returned",
					() =>
						tx
							.insert(quantityEstimateKitchenInProcurement)
							.values({ quantityEstimateId: input.draftId, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
							.returning({ id: quantityEstimateKitchenInProcurement.id }),
					{ prefix: "Erro ao salvar cozinha" }
				)

				const selRows = allSels.map((s) => ({ quantityEstimateKitchenId: quantityEstimateKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("INSERT_FAILED", () => tx.insert(quantityEstimateSelectionInProcurement).values(selRows), { prefix: "Erro ao salvar seleções" })
			}
		}
	})
}

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

function buildItemPayload(item: DraftItem, draftId: string, computedAt: string): ItemInsert {
	return {
		quantityEstimateId: draftId,
		ingredientId: item.ingredient_id || null,
		ingredientName: item.ingredient_name,
		folderId: item.folder_id || null,
		folderDescription: item.folder_description || null,
		// Mesma forma do código do catálogo que o insumo grava: rascunho antigo no cliente ("kg") não
		// vira linha fora do catálogo no anexo.
		measureUnit: toMeasureUnitCode(item.measure_unit),
		estimatedQuantity: item.estimated_quantity,
		purchaseItemId: item.purchase_item_id || null,
		purchaseItemDescription: item.purchase_item_description || null,
		purchaseMeasureUnit: item.purchase_measure_unit || null,
		purchaseQuantity: item.purchase_quantity ?? null,
		conversionFactor: item.conversion_factor ?? null,
		catmatItemCodigo: item.catmat_item_codigo ?? null,
		catmatItemDescricao: item.catmat_item_descricao || null,
		unitPrice: item.unit_price ?? null,
		itemDescription: item.item_description || null,
		computedAt,
		// Ausente não entra no payload: o update preserva a escolha gravada. Recalcular a estimada
		// não pode apagar o acréscimo ou o mínimo que alguém ajustou no item.
		...(item.max_increase_percent !== undefined && { maxIncreasePercent: item.max_increase_percent }),
		...(item.delivery_cycle !== undefined && { deliveryCycle: item.delivery_cycle }),
		...(item.min_order_quantity !== undefined && { minOrderQuantity: item.min_order_quantity ?? null }),
	}
}

/**
 * Replace-all dos itens (update existentes por id, insere novos, deleta removidos), tudo numa
 * transação; opcionalmente relinka pesquisas de preço dos itens novos; seta wizard_step 4.
 * Retorna o mapeamento ingredient_id → quantity_estimate_item_id para o cliente atualizar o estado local.
 */
export async function saveQuantityEstimateDraftItems(
	db: SisubDb,
	ctx: UserContext,
	input: SaveQuantityEstimateDraftItems
): Promise<{ savedIds: Array<{ ingredientId: string; quantityEstimateItemId: string }>; unlinkedResearchCount: number }> {
	const unitId = await authorizeQuantityEstimate(db, ctx, input.draftId)

	const existing = input.items.filter((i) => i.quantity_estimate_item_id)
	const toInsert = input.items.filter((i) => !i.quantity_estimate_item_id)
	const insertedItemsById = new Map<string, string>() // ingredient_id → new item id
	// Um único carimbo para computed_at e updated_at: evita que o próprio save marque o rascunho como defasado.
	const stamp = new Date().toISOString()

	const { unlinkedResearchCount } = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		const result = await persistDraftItems(tx, input.draftId, unitId, existing, toInsert, insertedItemsById, input.researchLinks, stamp)
		await runQuery(
			"UPDATE_FAILED",
			// Passo 5 = "Itens": salvar os quantitativos leva o rascunho para a revisão de itens.
			() => tx.update(quantityEstimateInProcurement).set({ wizardStep: 5, updatedAt: stamp }).where(eq(quantityEstimateInProcurement.id, input.draftId)),
			{ prefix: "Erro ao atualizar rascunho" }
		)
		return result
	})

	const savedIds: Array<{ ingredientId: string; quantityEstimateItemId: string }> = [
		...existing.map((item) => ({ ingredientId: item.ingredient_id ?? "", quantityEstimateItemId: item.quantity_estimate_item_id as string })),
		...Array.from(insertedItemsById.entries()).map(([ingredientId, quantityEstimateItemId]) => ({ ingredientId, quantityEstimateItemId })),
	]
	return { savedIds, unlinkedResearchCount }
}

type ResearchLink = { ingredientId: string; researchId: string; researchItemId: string }

/**
 * Chave de negócio de um item para reconciliar pesquisa de preço.
 * Ingrediente tem prioridade (identidade real do item, única por anexo); CATMAT é só fallback
 * para itens sem ingrediente — evita remapear pesquisa entre ingredientes que compartilham CATMAT.
 */
function itemBusinessKey(catmat: number | null | undefined, ingredientId: string | null | undefined): string | null {
	if (ingredientId) return `i:${ingredientId}`
	if (catmat != null) return `c:${catmat}`
	return null
}

/**
 * Núcleo compartilhado por saveQuantityEstimateDraftItems/finalizeQuantityEstimateDraft: replace-all dos itens + reconciliação de pesquisas.
 *
 * Reconciliação por chave de negócio (CATMAT→ingrediente): itens existentes preservam o id (e o link);
 * quando um item some mas outro de mesma chave sobrevive/entra, a pesquisa é remapeada em vez de orfanada.
 * Pesquisas realmente órfãs (`quantity_estimate_item_id` nulo) deste anexo são removidas. Retorna a contagem desvinculada.
 */
async function persistDraftItems(
	tx: TxClient,
	draftId: string,
	unitId: number,
	existing: DraftItem[],
	toInsert: DraftItem[],
	insertedItemsById: Map<string, string>,
	researchLinks: ResearchLink[] | undefined,
	stamp: string
): Promise<{ unlinkedResearchCount: number }> {
	const keepIds = new Set(existing.map((i) => i.quantity_estimate_item_id as string))

	// Itens atuais com chave de negócio (para reconciliar pesquisas antes de deletar).
	const currentItems = await tx
		.select({
			id: quantityEstimateItemInProcurement.id,
			ingredientId: quantityEstimateItemInProcurement.ingredientId,
			catmat: quantityEstimateItemInProcurement.catmatItemCodigo,
		})
		.from(quantityEstimateItemInProcurement)
		.where(eq(quantityEstimateItemInProcurement.quantityEstimateId, draftId))
	const keyByCurrentId = new Map(currentItems.map((r) => [r.id, itemBusinessKey(r.catmat, r.ingredientId)]))
	const toDelete = currentItems.filter((row) => !keepIds.has(row.id)).map((row) => row.id)

	// Mapa chave → item sobrevivente (existentes mantêm id).
	const survivorByKey = new Map<string, string>()
	for (const item of existing) {
		const key = itemBusinessKey(item.catmat_item_codigo, item.ingredient_id)
		if (key) survivorByKey.set(key, item.quantity_estimate_item_id as string)
	}

	// Atualizar existentes (preserva IDs, logo preserva price_research_item.quantity_estimate_item_id).
	// O predicado amarra o anexo (`quantity_estimate_id`): o `quantity_estimate_item_id` vem do corpo, e um `where id = ?`
	// cru reescrevia — e, pelo `quantityEstimateId` do payload, SEQUESTRAVA — o item de outro anexo. Item que
	// não é deste anexo derruba a transação inteira em vez de sumir calado.
	for (const item of existing) {
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao salvar itens: item ${item.quantity_estimate_item_id} não pertence ao anexo ${draftId}`,
			() =>
				tx
					.update(quantityEstimateItemInProcurement)
					.set(buildItemPayload(item, draftId, stamp))
					.where(
						and(
							eq(quantityEstimateItemInProcurement.id, item.quantity_estimate_item_id as string),
							eq(quantityEstimateItemInProcurement.quantityEstimateId, draftId)
						)
					)
					.returning({ id: quantityEstimateItemInProcurement.id }),
			{ prefix: "Erro ao salvar itens" }
		)
	}

	// Inserir novos.
	if (toInsert.length > 0) {
		const insertedItems = await runQuery(
			"INSERT_FAILED",
			() =>
				tx
					.insert(quantityEstimateItemInProcurement)
					.values(toInsert.map((item) => buildItemPayload(item, draftId, stamp)))
					.returning({
						id: quantityEstimateItemInProcurement.id,
						ingredientId: quantityEstimateItemInProcurement.ingredientId,
						catmat: quantityEstimateItemInProcurement.catmatItemCodigo,
					}),
			{ prefix: "Erro ao salvar itens" }
		)
		for (const row of insertedItems) {
			if (row.ingredientId) insertedItemsById.set(row.ingredientId, row.id)
			const key = itemBusinessKey(row.catmat, row.ingredientId)
			if (key && !survivorByKey.has(key)) survivorByKey.set(key, row.id)
		}
	}

	// Reconciliar pesquisas dos itens que vão sumir: mover o vínculo para um sobrevivente de mesma chave.
	// A que não tem sobrevivente fica sem item (ON DELETE SET NULL) e CONTINUA gravada: é trilha
	// de auditoria, e o cabeçalho segue ligado ao anexo. Apagá-la sumia com a memória de cálculo de
	// uma pesquisa que de fato aconteceu. A contagem avisa só as desvinculadas NESTE salvamento.
	const unlinkedResearch = new Set<string>()
	if (toDelete.length > 0) {
		const deleteSet = new Set(toDelete)
		const research = await tx
			.select({ id: priceResearchItemInProcurement.id, quantityEstimateItemId: priceResearchItemInProcurement.quantityEstimateItemId })
			.from(priceResearchItemInProcurement)
			.where(inArray(priceResearchItemInProcurement.quantityEstimateItemId, toDelete))
		for (const r of research) {
			const key = r.quantityEstimateItemId ? keyByCurrentId.get(r.quantityEstimateItemId) : null
			const target = key ? survivorByKey.get(key) : undefined
			if (target && !deleteSet.has(target)) {
				await tx.update(priceResearchItemInProcurement).set({ quantityEstimateItemId: target }).where(eq(priceResearchItemInProcurement.id, r.id))
			} else {
				unlinkedResearch.add(r.id)
			}
		}
		// Deletar itens removidos (o que não foi remapeado vira quantity_estimate_item_id NULL via ON DELETE SET NULL).
		await tx.delete(quantityEstimateItemInProcurement).where(inArray(quantityEstimateItemInProcurement.id, toDelete))
	}

	// Linkar pesquisas de preço aos itens do anexo (cliente reconcilia estado local).
	// Cobre item NOVO e item JÁ EXISTENTE: no wizard, a pesquisa acontece no step 4,
	// quando todos os itens já foram inseridos pelo cálculo — restringir a inseridos
	// deixaria a memória de cálculo órfã justamente no fluxo principal.
	if (researchLinks?.length) {
		const itemIdByIngredient = new Map(insertedItemsById)
		for (const item of existing) {
			if (item.ingredient_id) itemIdByIngredient.set(item.ingredient_id, item.quantity_estimate_item_id as string)
		}
		for (const link of await filterOwnResearchLinks(tx, unitId, researchLinks)) {
			const newItemId = itemIdByIngredient.get(link.ingredientId)
			if (!newItemId) continue
			await tx
				.update(priceResearchItemInProcurement)
				.set({ quantityEstimateItemId: newItemId })
				.where(eq(priceResearchItemInProcurement.id, link.researchItemId))
			await tx.update(priceResearchInProcurement).set({ quantityEstimateId: draftId }).where(eq(priceResearchInProcurement.id, link.researchId))
			// Religada ao item reinserido no mesmo salvamento: não ficou desvinculada.
			unlinkedResearch.delete(link.researchItemId)
		}
	}

	return { unlinkedResearchCount: unlinkedResearch.size }
}

// ─── Finalizar rascunho (wizard_step → null, anexo pronto para conclusão) ──────

export async function finalizeQuantityEstimateDraft(db: SisubDb, ctx: UserContext, input: FinalizeQuantityEstimateDraft): Promise<QuantityEstimate> {
	const unitId = await authorizeQuantityEstimate(db, ctx, input.draftId)

	const existing = input.items.filter((i) => i.quantity_estimate_item_id)
	const toInsert = input.items.filter((i) => !i.quantity_estimate_item_id)
	const insertedItemsById = new Map<string, string>()
	// Um único carimbo para computed_at e updated_at (ver saveQuantityEstimateDraftItems).
	const stamp = new Date().toISOString()

	const quantityEstimate = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		await persistDraftItems(tx, input.draftId, unitId, existing, toInsert, insertedItemsById, input.researchLinks, stamp)

		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao finalizar anexo quantitativo: ${input.draftId} não encontrado`,
			() =>
				tx
					.update(quantityEstimateInProcurement)
					.set({ title: input.title, notes: input.notes || null, wizardStep: null, updatedAt: stamp })
					.where(eq(quantityEstimateInProcurement.id, input.draftId))
					.returning(),
			{ prefix: "Erro ao finalizar anexo quantitativo" }
		)
		return updated
	})

	return toWire<QuantityEstimate>(quantityEstimate)
}

// ─── Criar anexo (persiste tudo) ────────────────────────────────────────────────

/**
 * Persists a complete procurement list with its kitchen assignments, template selections and pre-calculated items across 4 tables.
 *
 * SIDE EFFECTS: inserts quantity_estimate (1), quantity_estimate_kitchen (n), quantity_estimate_selection (m), quantity_estimate_item (p).
 * Tudo numa transação Drizzle: falha parcial desfaz tudo (bug fix vs original sem transação). Status default "draft".
 */
export async function createQuantityEstimate(db: SisubDb, ctx: UserContext, input: CreateQuantityEstimate): Promise<QuantityEstimate> {
	requireUnit(ctx, 2, input.unitId)

	const { unitId, title, notes, kitchenSelections, items } = input
	const stamp = new Date().toISOString()
	await assertSelectionsBelongToUnit(db, unitId, kitchenSelections)

	const quantityEstimate = await db.transaction(async (tx) => {
		// 1. Criar lista de compras.
		const created = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao criar lista: no row returned",
			() =>
				tx
					.insert(quantityEstimateInProcurement)
					.values({ unitId, title, notes: notes || null, status: "draft" })
					.returning(),
			{ prefix: "Erro ao criar lista" }
		)

		// 2. Para cada cozinha com seleções, criar quantity_estimate_kitchen + selections.
		for (const ks of kitchenSelections) {
			const allSels = [...ks.templateSelections, ...ks.eventSelections, ...(ks.exceptionSelections ?? [])]
			if (allSels.length === 0) continue

			const quantityEstimateKitchen = await insertOneOrFail(
				"INSERT_FAILED",
				"Erro ao associar cozinha: no row returned",
				() =>
					tx
						.insert(quantityEstimateKitchenInProcurement)
						.values({ quantityEstimateId: created.id, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
						.returning({ id: quantityEstimateKitchenInProcurement.id }),
				{ prefix: "Erro ao associar cozinha" }
			)

			const selectionRows = allSels.map((s) => ({
				quantityEstimateKitchenId: quantityEstimateKitchen.id,
				templateId: s.templateId,
				repetitions: s.repetitions,
			}))
			await runQuery("INSERT_FAILED", () => tx.insert(quantityEstimateSelectionInProcurement).values(selectionRows), { prefix: "Erro ao salvar seleções" })
		}

		// 3. Inserir itens calculados.
		if (items.length > 0) {
			const itemRows: ItemInsert[] = items.map((item) => buildItemPayload(item, created.id, stamp))
			const insertedItems = await runQuery(
				"INSERT_FAILED",
				() =>
					tx
						.insert(quantityEstimateItemInProcurement)
						.values(itemRows)
						.returning({ id: quantityEstimateItemInProcurement.id, ingredientId: quantityEstimateItemInProcurement.ingredientId }),
				{ prefix: "Erro ao salvar itens" }
			)

			// 4. Linkar registros de auditoria de pesquisa de preços (se houver).
			if (input.researchLinks?.length && insertedItems.length) {
				for (const link of await filterOwnResearchLinks(tx, unitId, input.researchLinks)) {
					const quantityEstimateItem = insertedItems.find((i) => i.ingredientId === link.ingredientId)
					if (!quantityEstimateItem) continue
					await tx
						.update(priceResearchItemInProcurement)
						.set({ quantityEstimateItemId: quantityEstimateItem.id })
						.where(eq(priceResearchItemInProcurement.id, link.researchItemId))
					await tx.update(priceResearchInProcurement).set({ quantityEstimateId: created.id }).where(eq(priceResearchInProcurement.id, link.researchId))
				}
			}
		}

		return created
	})

	return toWire<QuantityEstimate>(quantityEstimate)
}

// ─── Listar anexos da unidade ───────────────────────────────────────────────────

/** Anexos quantitativos não excluídos da unidade, dos mais recentes para os mais antigos. */
export async function fetchQuantityEstimateList(db: SisubDb, ctx: UserContext, input: FetchQuantityEstimateList): Promise<QuantityEstimate[]> {
	requireUnit(ctx, 1, input.unitId)
	const lists = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(quantityEstimateInProcurement)
				.where(and(eq(quantityEstimateInProcurement.unitId, input.unitId), isNull(quantityEstimateInProcurement.deletedAt)))
				.orderBy(sql`${quantityEstimateInProcurement.createdAt} desc`),
		{ prefix: "Erro ao buscar listas" }
	)
	return lists.map((r) => toWire<QuantityEstimate>(r))
}

// ─── Buscar anexo com detalhes ──────────────────────────────────────────────────

/**
 * Anexo quantitativo com cozinhas, cardápios considerados e itens calculados. Devolve null se o anexo não existe.
 *
 * Só o anexo ausente vira null; falha ao ler cozinhas ou itens continua lançando.
 */
export async function fetchQuantityEstimateDetails(
	db: SisubDb,
	ctx: UserContext,
	input: FetchQuantityEstimateDetails
): Promise<QuantityEstimateWithDetails | null> {
	const quantityEstimate = await runQuery(
		"QUERY_FAILED",
		async () => {
			const [row] = await db.select().from(quantityEstimateInProcurement).where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId)).limit(1)
			return row
		},
		{
			prefix: "Erro ao buscar anexo",
		}
	)
	if (!quantityEstimate) return null
	// A unidade sai da LINHA: qualquer sessão lia o anexo — preços, pesquisa, cozinhas — de
	// qualquer OM sabendo o id.
	requireUnit(ctx, 1, quantityEstimate.unitId)

	// Cozinha → seleções → template em queries SEPARADAS, juntadas em JS.
	// A relational query aninhada gerava o alias
	// `procurementListKitchenInProcurement_procurementListSelectionInProcurements`
	// (73 chars): o Postgres trunca em NAMEDATALEN (63) e o SQL emitido continua
	// referenciando o nome inteiro → 42703 `column ... .template_id does not exist`.
	// Na prática, todo anexo com pelo menos uma cozinha respondia 400.
	const kitchenRows = await runQuery(
		"QUERY_FAILED",
		() => db.select().from(quantityEstimateKitchenInProcurement).where(eq(quantityEstimateKitchenInProcurement.quantityEstimateId, input.quantityEstimateId)),
		{ prefix: "Erro ao buscar cozinhas" }
	)

	const kitchenCoreIds = [...new Set(kitchenRows.map((k) => k.kitchenId).filter((id): id is number => id != null))]
	const [coreKitchens, selectionRows] = await Promise.all([
		kitchenCoreIds.length > 0
			? runQuery(
					"QUERY_FAILED",
					() =>
						db
							.select({ id: kitchenInKitchen.id, displayName: kitchenInKitchen.displayName })
							.from(kitchenInKitchen)
							.where(inArray(kitchenInKitchen.id, kitchenCoreIds)),
					{ prefix: "Erro ao buscar cozinhas" }
				)
			: Promise.resolve([]),
		kitchenRows.length > 0
			? runQuery(
					"QUERY_FAILED",
					() =>
						db
							.select()
							.from(quantityEstimateSelectionInProcurement)
							.where(
								inArray(
									quantityEstimateSelectionInProcurement.quantityEstimateKitchenId,
									kitchenRows.map((k) => k.id)
								)
							),
					{ prefix: "Erro ao buscar seleções" }
				)
			: Promise.resolve([]),
	])

	// expectedMonthlyOccurrences vem junto para o wizard reprojetar as seleções de
	// exceção quando a vigência do anexo muda, sem uma segunda consulta.
	const selectionTemplateIds = [...new Set(selectionRows.map((s) => s.templateId).filter((id): id is string => id != null))]
	const selectionTemplates =
		selectionTemplateIds.length > 0
			? await runQuery(
					"QUERY_FAILED",
					() =>
						db
							.select({
								id: menuTemplateInKitchen.id,
								name: menuTemplateInKitchen.name,
								templateType: menuTemplateInKitchen.templateType,
								expectedMonthlyOccurrences: menuTemplateInKitchen.expectedMonthlyOccurrences,
							})
							.from(menuTemplateInKitchen)
							.where(inArray(menuTemplateInKitchen.id, selectionTemplateIds)),
					{ prefix: "Erro ao buscar templates" }
				)
			: []

	const coreKitchenById = new Map(coreKitchens.map((k) => [k.id, k]))
	const templateById = new Map(selectionTemplates.map((t) => [t.id, t]))
	const selectionsByKitchen = new Map<string, Array<(typeof selectionRows)[number] & { menuTemplateInKitchen: (typeof selectionTemplates)[number] | null }>>()
	for (const sel of selectionRows) {
		const withTemplate = { ...sel, menuTemplateInKitchen: (sel.templateId ? templateById.get(sel.templateId) : null) ?? null }
		const bucket = selectionsByKitchen.get(sel.quantityEstimateKitchenId)
		if (bucket) bucket.push(withTemplate)
		else selectionsByKitchen.set(sel.quantityEstimateKitchenId, [withTemplate])
	}

	// Chaves iguais às da relational query — DETAILS_RELATIONS mapeia para o contrato de wire.
	const kitchens = kitchenRows.map((k) => ({
		...k,
		kitchenInKitchen: (k.kitchenId != null ? coreKitchenById.get(k.kitchenId) : null) ?? null,
		quantityEstimateSelectionInProcurements: selectionsByKitchen.get(k.id) ?? [],
	}))

	const items = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(quantityEstimateItemInProcurement)
				.where(eq(quantityEstimateItemInProcurement.quantityEstimateId, input.quantityEstimateId))
				.orderBy(sql`${quantityEstimateItemInProcurement.folderDescription} asc nulls last`, asc(quantityEstimateItemInProcurement.ingredientName)),
		{ prefix: "Erro ao buscar itens" }
	)

	const cycleContext = await fetchCycleContext(db, items)
	const meta = await computeQuantityEstimateMeta(db, quantityEstimate.status, input.quantityEstimateId, kitchens, items, quantityEstimate.updatedAt ?? null)

	return {
		...toWire<QuantityEstimate>(quantityEstimate),
		kitchens: kitchens.map((k) => toWire<QuantityEstimateKitchenWire>(k, DETAILS_RELATIONS)),
		items: items.map((i) => ({
			...toWire<QuantityEstimateItem>(i),
			conservation_class: (i.purchaseItemId ? cycleContext.conservationByPurchaseItem.get(i.purchaseItemId) : null) ?? null,
			ingredient_delivery_cycle: (i.ingredientId ? cycleContext.cycleByIngredient.get(i.ingredientId) : null) ?? null,
		})),
		meta,
	}
}

type CycleContext = { conservationByPurchaseItem: Map<string, string | null>; cycleByIngredient: Map<string, string | null> }

/** Padrão de ciclo dos insumos e conservação dos itens de compra — o que decide o ciclo de item sem escolha gravada. */
async function fetchCycleContext(
	client: SisubDb | TxClient,
	items: Array<{ purchaseItemId: string | null; ingredientId: string | null }>
): Promise<CycleContext> {
	const purchaseItemIds = [...new Set(items.map((i) => i.purchaseItemId).filter((id): id is string => id != null))]
	const ingredientIds = [...new Set(items.map((i) => i.ingredientId).filter((id): id is string => id != null))]
	const [purchaseItems, ingredients] = await Promise.all([
		purchaseItemIds.length > 0
			? runQuery(
					"QUERY_FAILED",
					() =>
						client
							.select({ id: purchaseItemInProcurement.id, conservationClass: purchaseItemInProcurement.conservationClass })
							.from(purchaseItemInProcurement)
							.where(inArray(purchaseItemInProcurement.id, purchaseItemIds)),
					{ prefix: "Erro ao buscar conservação dos itens de compra" }
				)
			: Promise.resolve([]),
		ingredientIds.length > 0
			? runQuery(
					"QUERY_FAILED",
					() =>
						client
							.select({ id: ingredientInKitchen.id, defaultDeliveryCycle: ingredientInKitchen.defaultDeliveryCycle })
							.from(ingredientInKitchen)
							.where(inArray(ingredientInKitchen.id, ingredientIds)),
					{ prefix: "Erro ao buscar ciclo de entrega dos insumos" }
				)
			: Promise.resolve([]),
	])
	return {
		conservationByPurchaseItem: new Map(purchaseItems.map((r) => [r.id, r.conservationClass])),
		cycleByIngredient: new Map(ingredients.map((r) => [r.id, r.defaultDeliveryCycle])),
	}
}

type QuantityEstimateLimitsRow = { validityMonths: number | null; maxIncreasePercent: number; maxQuantityJustification: string | null; minQuotePercent: number }
type ItemRowFull = typeof quantityEstimateItemInProcurement.$inferSelect

/**
 * Quantidade máxima de cada item do anexo pela regra de agora (a mesma de `loadQuantityEstimateLimits`), por id
 * do item. Para quem precisa do número sem reimplementar a regra (o relatório de pesquisa de preços).
 */
export async function resolveQuantityEstimateMaxQuantities(db: SisubDb, quantityEstimateId: string): Promise<Map<string, number>> {
	return db.transaction(async (tx) => {
		const { items } = await loadQuantityEstimateLimits(tx, quantityEstimateId)
		return new Map(items.map(({ item, limits }) => [item.id, limits.maxQuantity]))
	})
}

/** Limites resolvidos de todos os itens de um anexo — mesma entrada para a trava de conclusão e o snapshot. */
async function loadQuantityEstimateLimits(
	tx: TxClient,
	quantityEstimateId: string
): Promise<{ list: QuantityEstimateLimitsRow | undefined; items: Array<{ item: ItemRowFull; limits: QuantityLimits }> }> {
	const [list] = await tx
		.select({
			validityMonths: quantityEstimateInProcurement.validityMonths,
			maxIncreasePercent: quantityEstimateInProcurement.maxIncreasePercent,
			maxQuantityJustification: quantityEstimateInProcurement.maxQuantityJustification,
			minQuotePercent: quantityEstimateInProcurement.minQuotePercent,
		})
		.from(quantityEstimateInProcurement)
		.where(eq(quantityEstimateInProcurement.id, quantityEstimateId))
	const rows = await tx.select().from(quantityEstimateItemInProcurement).where(eq(quantityEstimateItemInProcurement.quantityEstimateId, quantityEstimateId))
	const context = await fetchCycleContext(tx, rows)
	return {
		list,
		items: rows.map((item) => ({
			item,
			limits: computeQuantityEstimateItemLimits(
				{
					purchaseQuantity: item.purchaseQuantity == null ? null : Number(item.purchaseQuantity),
					estimatedQuantity: Number(item.estimatedQuantity),
					deliveryCycle: item.deliveryCycle,
					ingredientDeliveryCycle: item.ingredientId ? context.cycleByIngredient.get(item.ingredientId) : null,
					conservationClass: item.purchaseItemId ? context.conservationByPurchaseItem.get(item.purchaseItemId) : null,
					maxIncreasePercent: item.maxIncreasePercent,
					minOrderQuantity: item.minOrderQuantity == null ? null : Number(item.minOrderQuantity),
				},
				list ?? {}
			),
		})),
	}
}

type KitchenRow = { quantityEstimateSelectionInProcurements: Array<{ templateId: string }> }
type ItemRow = { computedAt: string | null }

/** Calcula defasagem (stale) do rascunho, validade da pesquisa e snapshot congelado (anexo concluído). */
async function computeQuantityEstimateMeta(
	db: SisubDb,
	status: string,
	quantityEstimateId: string,
	kitchens: KitchenRow[],
	items: ItemRow[],
	quantityEstimateUpdatedAt: string | null
): Promise<QuantityEstimateMeta> {
	const maxDate = (values: Array<string | null | undefined>): string | null => {
		const valid = values.filter((v): v is string => !!v)
		return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : null
	}

	// Defasagem: só faz sentido em rascunho com itens já calculados.
	let isStale = false
	const lastComputedAt = maxDate(items.map((i) => i.computedAt))
	if (status === "draft" && lastComputedAt) {
		const templateIds = [...new Set(kitchens.flatMap((k) => k.quantityEstimateSelectionInProcurements.map((s) => s.templateId)))]
		if (templateIds.length > 0) {
			// Sinal 1: edição da composição do cardápio/evento (updateTemplate faz delete-all + reinsert dos itens,
			// então created_at reflete headcount_override, receita escolhida, grupo etc.).
			const templateEdits = await runQuery(
				"QUERY_FAILED",
				() =>
					db
						.select({ createdAt: menuTemplateItemsInKitchen.createdAt, recipeId: menuTemplateItemsInKitchen.recipeId })
						.from(menuTemplateItemsInKitchen)
						.where(inArray(menuTemplateItemsInKitchen.menuTemplateId, templateIds)),
				{ prefix: "Erro ao verificar defasagem" }
			)
			let lastEdit = maxDate(templateEdits.map((e) => e.createdAt))

			// Sinal 2: edição do conteúdo das receitas referenciadas (recipe_ingredients reinseridos → created_at novo).
			const recipeIds = [...new Set(templateEdits.map((e) => e.recipeId).filter((id): id is string => !!id))]
			if (recipeIds.length > 0) {
				const recipeEdits = await runQuery(
					"QUERY_FAILED",
					() =>
						db
							.select({ createdAt: recipeIngredientsInKitchen.createdAt })
							.from(recipeIngredientsInKitchen)
							.where(inArray(recipeIngredientsInKitchen.recipeId, recipeIds)),
					{ prefix: "Erro ao verificar defasagem" }
				)
				lastEdit = maxDate([lastEdit, ...recipeEdits.map((e) => e.createdAt)])
			}

			// Sinal 3: efetivo base por (dia, refeição) — updateTemplate reescreve menu_template_meal.
			const mealEdits = await runQuery(
				"QUERY_FAILED",
				() =>
					db
						.select({ createdAt: menuTemplateMealInKitchen.createdAt })
						.from(menuTemplateMealInKitchen)
						.where(inArray(menuTemplateMealInKitchen.menuTemplateId, templateIds)),
				{ prefix: "Erro ao verificar defasagem" }
			)
			lastEdit = maxDate([lastEdit, ...mealEdits.map((e) => e.createdAt)])

			// Sinal 4: alteração das próprias seleções do anexo (repetições/cozinhas). quantity_estimate_selection não
			// tem timestamp, mas updateQuantityEstimateDraft carimba quantity_estimate.updated_at — conservador de propósito:
			// melhor um falso "desatualizado" do que concluir quantitativo calculado com repetições antigas.
			lastEdit = maxDate([lastEdit, quantityEstimateUpdatedAt])

			isStale = !!lastEdit && lastEdit > lastComputedAt
		}
	}

	// Validade legal da pesquisa de preço (não-bloqueante).
	const research = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({ createdAt: priceResearchInProcurement.createdAt })
				.from(priceResearchInProcurement)
				.where(eq(priceResearchInProcurement.quantityEstimateId, quantityEstimateId)),
		{ prefix: "Erro ao buscar pesquisas" }
	)
	const oldestResearchAt = research.length ? research.map((r) => r.createdAt).reduce((a, b) => (a < b ? a : b)) : null
	let isExpired = false
	if (oldestResearchAt) {
		const ageDays = (Date.now() - new Date(oldestResearchAt).getTime()) / 86_400_000
		isExpired = ageDays >= PRICE_RESEARCH_VALIDITY_DAYS
	}

	// Snapshot congelado (só existe após conclusão).
	let snapshot: QuantityEstimateMeta["snapshot"] = null
	if (status !== "draft") {
		const [selections, components] = await Promise.all([
			runQuery(
				"QUERY_FAILED",
				() =>
					db
						.select()
						.from(quantityEstimateSnapshotSelectionInProcurement)
						.where(eq(quantityEstimateSnapshotSelectionInProcurement.quantityEstimateId, quantityEstimateId)),
				{ prefix: "Erro ao buscar snapshot" }
			),
			runQuery(
				"QUERY_FAILED",
				() =>
					db
						.select()
						.from(quantityEstimateSnapshotComponentInProcurement)
						.where(eq(quantityEstimateSnapshotComponentInProcurement.quantityEstimateId, quantityEstimateId))
						// Mesma ordem dos itens do rascunho (fetchQuantityEstimateDetails): a numeração da tabela do TR e a do
						// relatório de pesquisa de preços têm de apontar o mesmo item.
						.orderBy(
							sql`${quantityEstimateSnapshotComponentInProcurement.folderDescription} asc nulls last`,
							asc(quantityEstimateSnapshotComponentInProcurement.ingredientName)
						),
				{ prefix: "Erro ao buscar snapshot" }
			),
		])
		if (selections.length || components.length) {
			snapshot = {
				selections: selections.map((s) => ({
					template_name: s.templateName,
					template_type: s.templateType,
					kitchen_id: s.kitchenId,
					kitchen_name: s.kitchenName,
					repetitions: s.repetitions,
					snapshot_source: s.snapshotSource,
				})),
				components: components.map((c) => ({
					ingredient_id: c.ingredientId,
					ingredient_name: c.ingredientName,
					folder_description: c.folderDescription,
					measure_unit: c.measureUnit,
					estimated_quantity: c.estimatedQuantity,
					purchase_item_description: c.purchaseItemDescription,
					purchase_measure_unit: c.purchaseMeasureUnit,
					purchase_quantity: c.purchaseQuantity,
					catmat_item_codigo: c.catmatItemCodigo,
					unit_price: c.unitPrice,
					snapshot_source: c.snapshotSource,
					max_increase_percent: c.maxIncreasePercent,
					max_quantity: c.maxQuantity,
					delivery_cycle: c.deliveryCycle,
					min_order_quantity: c.minOrderQuantity,
					min_quote_quantity: c.minQuoteQuantity,
				})),
			}
		}
	}

	return {
		is_stale: isStale,
		price_research: { oldest_research_at: oldestResearchAt, validity_days: PRICE_RESEARCH_VALIDITY_DAYS, is_expired: isExpired },
		snapshot,
	}
}

// ─── Snapshot da composição (congela ao concluir) ─────────────────────────────

/**
 * Materializa a composição resolvida do anexo em tabelas de snapshot próprias, tornando-a
 * autocontida e imune a edições/soft-delete posteriores de menu_template/receita/item.
 * Idempotente: substitui qualquer snapshot nativo anterior daquele anexo.
 */
async function buildQuantityEstimateSnapshot(tx: TxClient, quantityEstimateId: string): Promise<void> {
	// Recomeça do zero para permitir republicação sem duplicar.
	await tx
		.delete(quantityEstimateSnapshotSelectionInProcurement)
		.where(eq(quantityEstimateSnapshotSelectionInProcurement.quantityEstimateId, quantityEstimateId))
	await tx
		.delete(quantityEstimateSnapshotComponentInProcurement)
		.where(eq(quantityEstimateSnapshotComponentInProcurement.quantityEstimateId, quantityEstimateId))

	// Seleções resolvidas (nome/tipo do cardápio + nome da cozinha congelados).
	const selections = await tx
		.select({
			originTemplateId: quantityEstimateSelectionInProcurement.templateId,
			templateName: menuTemplateInKitchen.name,
			templateType: menuTemplateInKitchen.templateType,
			kitchenId: quantityEstimateKitchenInProcurement.kitchenId,
			kitchenName: kitchenInKitchen.displayName,
			repetitions: quantityEstimateSelectionInProcurement.repetitions,
		})
		.from(quantityEstimateSelectionInProcurement)
		.innerJoin(
			quantityEstimateKitchenInProcurement,
			eq(quantityEstimateSelectionInProcurement.quantityEstimateKitchenId, quantityEstimateKitchenInProcurement.id)
		)
		.leftJoin(menuTemplateInKitchen, eq(quantityEstimateSelectionInProcurement.templateId, menuTemplateInKitchen.id))
		.leftJoin(kitchenInKitchen, eq(quantityEstimateKitchenInProcurement.kitchenId, kitchenInKitchen.id))
		.where(eq(quantityEstimateKitchenInProcurement.quantityEstimateId, quantityEstimateId))

	if (selections.length > 0) {
		await tx.insert(quantityEstimateSnapshotSelectionInProcurement).values(
			selections.map((s) => ({
				quantityEstimateId,
				originTemplateId: s.originTemplateId,
				templateName: s.templateName,
				templateType: s.templateType,
				kitchenId: s.kitchenId,
				kitchenName: s.kitchenName,
				repetitions: s.repetitions,
				snapshotSource: "native",
			}))
		)
	}

	// Componentes (cópia imutável dos itens agregados), com os limites do anexo RESOLVIDOS:
	// o anexo concluído guarda o número com que foi concluído, não a regra que o produziu.
	const { list, items } = await loadQuantityEstimateLimits(tx, quantityEstimateId)
	if (items.length > 0) {
		await tx.insert(quantityEstimateSnapshotComponentInProcurement).values(
			items.map(({ item: i, limits }) => ({
				quantityEstimateId,
				ingredientId: i.ingredientId,
				ingredientName: i.ingredientName,
				folderDescription: i.folderDescription,
				measureUnit: i.measureUnit,
				estimatedQuantity: i.estimatedQuantity,
				purchaseItemId: i.purchaseItemId,
				purchaseItemDescription: i.purchaseItemDescription,
				purchaseMeasureUnit: i.purchaseMeasureUnit,
				purchaseQuantity: i.purchaseQuantity,
				catmatItemCodigo: i.catmatItemCodigo,
				unitPrice: i.unitPrice,
				snapshotSource: "native",
				computedAt: i.computedAt ?? new Date().toISOString(),
				maxIncreasePercent: limits.increasePercent,
				maxQuantity: limits.maxQuantity,
				deliveryCycle: limits.deliveryCycle,
				minOrderQuantity: limits.minOrderQuantity,
				// Quantidade mínima a ser cotada (art. 82, II) congelada junto com a máxima.
				minQuoteQuantity: computeMinQuoteQuantity(limits.maxQuantity, list?.minQuotePercent == null ? null : Number(list.minQuotePercent)),
			}))
		)
	}
}

// ─── Atualizar status do anexo ──────────────────────────────────────────────────

/**
 * Transiciona o status do anexo validando o ciclo de vida (draft → completed → archived; sem downgrade).
 * Ao concluir, congela a composição num snapshot próprio (memória de cálculo imutável).
 */
export async function updateQuantityEstimateStatus(db: SisubDb, ctx: UserContext, input: UpdateQuantityEstimateStatus): Promise<void> {
	await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId)

	await db.transaction(async (tx) => {
		const current = await getQuantityEstimateStatus(tx, input.quantityEstimateId)
		if (current === input.status) return // no-op idempotente

		const allowed = ALLOWED_STATUS_TRANSITIONS[current] ?? []
		if (!allowed.includes(input.status)) {
			throw new DomainError("INVALID_STATUS_TRANSITION", `Transição inválida: ${current} → ${input.status}`)
		}

		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar status: anexo quantitativo ${input.quantityEstimateId} não encontrado`,
			() =>
				tx
					.update(quantityEstimateInProcurement)
					.set({ status: input.status, updatedAt: new Date().toISOString() })
					.where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
					.returning({ id: quantityEstimateInProcurement.id }),
			{ prefix: "Erro ao atualizar status" }
		)

		// Anexo de uma contratação não conclui com item em conflito entre ela e outra: o item
		// ficaria fora de qualquer anexo, ou em dois (Lei 14.133/2021, art. 82, VIII).
		if (current === "draft" && input.status === "completed") {
			const lists = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ unitId: quantityEstimateInProcurement.unitId, segmentId: quantityEstimateInProcurement.segmentId })
					.from(quantityEstimateInProcurement)
					.where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
					.limit(1)
			)
			const list = lists[0]
			if (list?.segmentId) {
				const conflicts = await findSegmentConflicts(tx, list.unitId, list.segmentId)
				if (conflicts.length > 0) {
					throw new DomainError(
						"SEGMENT_CONFLICT",
						`Há ${conflicts.length} item(ns) em duas contratações (${conflicts.slice(0, 3).join("; ")}${conflicts.length > 3 ? "…" : ""}): ajuste a segmentação antes de concluir.`
					)
				}
			}
		}

		// A justificativa da quantidade máxima é exigida na CONCLUSÃO, uma vez por anexo. Arquivar
		// direto um rascunho não conclui nada, então não cobra.
		if (current === "draft" && input.status === "completed") {
			const { list, items } = await loadQuantityEstimateLimits(tx, input.quantityEstimateId)
			if (requiresMaxQuantityJustification(items.map((i) => i.limits)) && !list?.maxQuantityJustification?.trim()) {
				throw new DomainError(
					"MAX_QUANTITY_JUSTIFICATION_REQUIRED",
					"Há itens com acréscimo acima da referência: preencha a justificativa da quantidade máxima no anexo quantitativo antes de concluir."
				)
			}
		}

		// Congela o snapshot SÓ na saída do rascunho (concluir OU arquivar direto). Arquivar um anexo
		// concluído não pode recongelar: recalcularia máxima, ciclo e mínimo com a regra e o insumo de
		// hoje — e daria limites a anexos concluídos antes de os limites existirem.
		if (current === "draft") {
			await buildQuantityEstimateSnapshot(tx, input.quantityEstimateId)
		}
	})
}

// ─── Atualizar preços de itens de um anexo já salvo ───────────────────────────

/**
 * Todo preço gravado depois do rascunho tem de vir de uma pesquisa registrada DESTA unidade,
 * do MESMO item e do MESMO CATMAT, com o mesmo valor. O preço segue editável depois de concluir
 * o anexo (a pesquisa se refaz perto do edital: IN SEGES/ME 65/2021, art. 5º), mas nunca sem a
 * memória de cálculo que o sustenta: era o caminho do "Usar" por linha e da gravação que seguia
 * mesmo quando a pesquisa falhava ao salvar.
 *
 * O item e o CATMAT são conferidos na linha GRAVADA da pesquisa, não no vínculo do corpo: senão a
 * pesquisa do item A (mesmo valor) lastreava o preço do item B e era religada a ele.
 */
async function assertPricesBackedByResearch(tx: TxClient, unitId: number, input: UpdateQuantityEstimateItemPrices): Promise<void> {
	const ownLinks = await filterOwnResearchLinks(tx, unitId, input.researchLinks ?? [])
	const researchItemIds = [...new Set(ownLinks.map((l) => l.researchItemId))]
	const itemIds = [...new Set(input.updates.map((u) => u.quantityEstimateItemId))]

	const [research, items] = await Promise.all([
		researchItemIds.length === 0
			? []
			: runQuery("FETCH_FAILED", () =>
					tx
						.select({
							id: priceResearchItemInProcurement.id,
							quantityEstimateItemId: priceResearchItemInProcurement.quantityEstimateItemId,
							catmat: priceResearchItemInProcurement.catmatCodigo,
							referencePrice: priceResearchItemInProcurement.referencePrice,
						})
						.from(priceResearchItemInProcurement)
						.where(inArray(priceResearchItemInProcurement.id, researchItemIds))
				),
		runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: quantityEstimateItemInProcurement.id, catmat: quantityEstimateItemInProcurement.catmatItemCodigo })
				.from(quantityEstimateItemInProcurement)
				.where(and(inArray(quantityEstimateItemInProcurement.id, itemIds), eq(quantityEstimateItemInProcurement.quantityEstimateId, input.quantityEstimateId)))
		),
	])
	const researchById = new Map(research.map((r) => [r.id, r]))
	const catmatByItem = new Map(items.map((i) => [i.id, i.catmat]))

	for (const update of input.updates) {
		const backed = ownLinks.some((link) => {
			if (link.quantityEstimateItemId !== update.quantityEstimateItemId) return false
			const row = researchById.get(link.researchItemId)
			if (!row || row.referencePrice == null) return false
			// Pesquisa ainda solta (recém-feita) ou já deste item; nunca a de outro item.
			if (row.quantityEstimateItemId != null && row.quantityEstimateItemId !== update.quantityEstimateItemId) return false
			if (row.catmat == null || row.catmat !== catmatByItem.get(update.quantityEstimateItemId)) return false
			return isSamePrice(Number(row.referencePrice), update.price)
		})
		if (!backed) {
			throw new DomainError(
				"PRICE_WITHOUT_RESEARCH",
				`Preço do item ${update.quantityEstimateItemId} sem pesquisa de preços registrada para o mesmo item, CATMAT e valor: refaça a pesquisa do item.`
			)
		}
	}
}

export async function updateQuantityEstimateItemPrices(db: SisubDb, ctx: UserContext, input: UpdateQuantityEstimateItemPrices): Promise<void> {
	const unitId = await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId)

	await db.transaction(async (tx) => {
		await assertPricesBackedByResearch(tx, unitId, input)

		// Preço só em item DESTE anexo: o `quantityEstimateItemId` vem do corpo, e o update por id cru repreçava
		// o item de qualquer anexo — o guard acima prova só o anexo informado.
		for (const u of input.updates) {
			await mutateOrFail(
				"UPDATE_FAILED",
				`Erro ao atualizar preço: item ${u.quantityEstimateItemId} não pertence ao anexo quantitativo ${input.quantityEstimateId}`,
				() =>
					tx
						.update(quantityEstimateItemInProcurement)
						.set({ unitPrice: u.price })
						.where(
							and(
								eq(quantityEstimateItemInProcurement.id, u.quantityEstimateItemId),
								eq(quantityEstimateItemInProcurement.quantityEstimateId, input.quantityEstimateId)
							)
						)
						.returning({ id: quantityEstimateItemInProcurement.id }),
				{ prefix: "Erro ao atualizar preço" }
			)
		}

		if (input.researchLinks?.length) {
			// O item de destino do vínculo também tem de ser deste anexo.
			const linkItemIds = [...new Set(input.researchLinks.map((l) => l.quantityEstimateItemId))]
			const ownItems = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: quantityEstimateItemInProcurement.id })
					.from(quantityEstimateItemInProcurement)
					.where(
						and(inArray(quantityEstimateItemInProcurement.id, linkItemIds), eq(quantityEstimateItemInProcurement.quantityEstimateId, input.quantityEstimateId))
					)
			)
			const ownItemIds = new Set(ownItems.map((i) => i.id))
			const foreignItem = linkItemIds.find((id) => !ownItemIds.has(id))
			if (foreignItem)
				throw new DomainError("UPDATE_FAILED", `Erro ao vincular pesquisa: item ${foreignItem} não pertence ao anexo quantitativo ${input.quantityEstimateId}`)

			for (const link of await filterOwnResearchLinks(tx, unitId, input.researchLinks)) {
				await tx
					.update(priceResearchItemInProcurement)
					.set({ quantityEstimateItemId: link.quantityEstimateItemId })
					.where(eq(priceResearchItemInProcurement.id, link.researchItemId))
				await tx
					.update(priceResearchInProcurement)
					.set({ quantityEstimateId: input.quantityEstimateId })
					.where(eq(priceResearchInProcurement.id, link.researchId))
			}
		}
	})
}

// ─── Atualizar descrição de um item de anexo ───────────────────────────────────

export async function updateQuantityEstimateItemDescription(db: SisubDb, ctx: UserContext, input: UpdateQuantityEstimateItemDescription): Promise<void> {
	// Só o id do ITEM chega — o anexo dono sai do próprio item.
	const quantityEstimateId = await authorizeQuantityEstimateItem(db, ctx, input.quantityEstimateItemId)

	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao atualizar descrição: item ${input.quantityEstimateItemId} não encontrado`,
		() =>
			db
				.update(quantityEstimateItemInProcurement)
				.set({ itemDescription: input.description || null })
				.where(
					and(
						eq(quantityEstimateItemInProcurement.id, input.quantityEstimateItemId),
						eq(quantityEstimateItemInProcurement.quantityEstimateId, quantityEstimateId)
					)
				)
				.returning({ id: quantityEstimateItemInProcurement.id }),
		{ prefix: "Erro ao atualizar descrição" }
	)
}

// ─── Ajustar limites do anexo de quantitativos ───────────────────────────────

/**
 * Grava o acréscimo padrão e a justificativa do anexo e as escolhas por item (acréscimo, ciclo,
 * mínimo por pedido). Só em rascunho: concluir congela máxima e mínima no snapshot, e mexer
 * depois divergiria o documento do anexo concluído do que o sistema mostra.
 *
 * O predicado de cada item amarra o anexo dono (`quantity_estimate_id`): um id de item de outro anexo não
 * é atualizado, e a contagem denuncia a divergência em vez de engolir.
 */
export async function updateQuantityEstimateLimits(db: SisubDb, ctx: UserContext, input: UpdateQuantityEstimateLimits): Promise<void> {
	await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId)

	await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.quantityEstimateId)

		const quantityEstimatePatch: Partial<typeof quantityEstimateInProcurement.$inferInsert> = {}
		if (input.maxIncreasePercent !== undefined) quantityEstimatePatch.maxIncreasePercent = input.maxIncreasePercent
		if (input.maxQuantityJustification !== undefined) quantityEstimatePatch.maxQuantityJustification = input.maxQuantityJustification?.trim() || null
		if (input.minQuotePercent !== undefined) quantityEstimatePatch.minQuotePercent = input.minQuotePercent
		if (Object.keys(quantityEstimatePatch).length > 0) {
			// Sem `updated_at`: limite não muda a estimada, então não pode marcar o cálculo como defasado.
			await tx.update(quantityEstimateInProcurement).set(quantityEstimatePatch).where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
		}

		for (const item of input.items ?? []) {
			const patch: Partial<ItemInsert> = {}
			if (item.maxIncreasePercent !== undefined) patch.maxIncreasePercent = item.maxIncreasePercent
			if (item.deliveryCycle !== undefined) patch.deliveryCycle = item.deliveryCycle
			if (item.minOrderQuantity !== undefined) patch.minOrderQuantity = item.minOrderQuantity ?? null
			if (Object.keys(patch).length === 0) continue
			await mutateOrFail(
				"UPDATE_FAILED",
				`Erro ao ajustar limites: item ${item.quantityEstimateItemId} não pertence ao anexo quantitativo ${input.quantityEstimateId}`,
				() =>
					tx
						.update(quantityEstimateItemInProcurement)
						.set(patch)
						.where(
							and(
								eq(quantityEstimateItemInProcurement.id, item.quantityEstimateItemId),
								eq(quantityEstimateItemInProcurement.quantityEstimateId, input.quantityEstimateId)
							)
						)
						.returning({ id: quantityEstimateItemInProcurement.id }),
				{ prefix: "Erro ao ajustar limites" }
			)
		}
	})
}

// ─── Configuração dos documentos do anexo ─────────────────────────────────────

/**
 * Orçamento sigiloso (Lei 14.133/2021, art. 24; IN SEGES/ME 65/2021, art. 10): a tabela do anexo
 * copiada para o TR sai sem preço e valor. Muda só a saída dos documentos, não os números
 * congelados, então vale em qualquer status.
 */
export async function updateQuantityEstimateDocumentSettings(
	db: SisubDb,
	ctx: UserContext,
	input: { quantityEstimateId: string; isBudgetConfidential: boolean }
): Promise<void> {
	await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId)
	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao ajustar o anexo: ${input.quantityEstimateId} não encontrado`,
		() =>
			db
				.update(quantityEstimateInProcurement)
				.set({ isBudgetConfidential: input.isBudgetConfidential })
				.where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
				.returning({ id: quantityEstimateInProcurement.id }),
		{ prefix: "Erro ao ajustar o anexo" }
	)
}

// ─── Deletar anexo (soft delete) ────────────────────────────────────────────────

/** Exclusão lógica do anexo (`deleted_at`); cozinhas e itens ficam intactos. */
export async function deleteQuantityEstimate(db: SisubDb, ctx: UserContext, input: DeleteQuantityEstimate): Promise<void> {
	await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId)

	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar anexo quantitativo: ${input.quantityEstimateId} não encontrado`,
		() =>
			db
				.update(quantityEstimateInProcurement)
				.set({ deletedAt: new Date().toISOString() })
				.where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
				.returning({ id: quantityEstimateInProcurement.id }),
		{ prefix: "Erro ao deletar anexo quantitativo" }
	)
}
