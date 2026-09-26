/**
 * Procurement list (ATA) lifecycle operations: needs calculation, creation,
 * status transitions, soft-delete. Drizzle query layer (migração PostgREST→Drizzle).
 *
 * Auth: LEITURA exige `unit:1` na unidade dona da ata; ESCRITA, `unit:2`. Sete das dez escritas
 * recebem só um id — a unidade sai da linha persistida, nunca do input (ver `authorizeAtaList`/
 * `authorizeAtaItem` e `ata.authz.test.ts`). O que a ata CITA também é conferido contra ela:
 * cozinhas e planos de cardápio são da OM (`assertSelectionsBelongToUnit`), itens atualizados
 * por id são da própria ata (predicado com `list_id`), e pesquisa de preço só é religada quando
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
	procurementListInProcurement,
	procurementListItemInProcurement,
	procurementListKitchenInProcurement,
	procurementListSelectionInProcurement,
	procurementListSnapshotComponentInProcurement,
	procurementListSnapshotSelectionInProcurement,
	procurementPesquisaPrecoInProcurement,
	procurementPesquisaPrecoItemInProcurement,
	purchaseItemIngredientInProcurement,
	purchaseItemInProcurement,
	recipeIngredientsInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { canReachKitchen, type KitchenUnitRef, kitchenBelongsToUnit } from "../guards/kitchen-unit.ts"
import { requireUnit } from "../guards/require-permission.ts"
import type {
	CalculateAtaNeeds,
	CreateAta,
	CreateAtaDraft,
	DeleteAta,
	DraftItem,
	FetchAtaDetails,
	FetchAtaList,
	FinalizeAtaDraft,
	SaveAtaDraftItems,
	UpdateAtaDraft,
	UpdateAtaItemDescription,
	UpdateAtaItemPrices,
	UpdateAtaQuantityLimits,
	UpdateAtaStatus,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import type { ProcurementNeed } from "../types/procurement.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"
import { computeAtaItemLimits, type QuantityLimits, requiresMarginJustification, resolveDeliveryCycle } from "./ata-quantity-limits.ts"
import { resolveItemDemand, scaleIngredientQuantity } from "./demand-math.ts"
import { isSamePrice } from "./price-units.ts"
import { eventItemBase, fetchEventMealBases } from "./template-event-meals.ts"
import { fetchTemplateMealsSafe } from "./template-meals.ts"

/**
 * Idade a partir da qual a pesquisa de preço pede renovação. Referência: os 6 meses que a IN
 * SEGES/ME 65/2021 (art. 5º, III e IV) admite entre a coleta e a divulgação do edital. Não é
 * "vencimento" legal da pesquisa inteira: preço de sistema oficial conta 1 ano da data da pesquisa.
 */
const PRICE_RESEARCH_VALIDITY_DAYS = 180

/** Transições de status permitidas da ATA. Publicada e arquivada são terminais quanto a downgrade. */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
	draft: ["published", "archived"],
	published: ["archived"],
	archived: [],
}

type TxClient = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

/** Lê o status atual da lista ou lança se inexistente. */
async function getListStatus(client: SisubDb | TxClient, listId: string): Promise<string> {
	const rows = await client
		.select({ status: procurementListInProcurement.status })
		.from(procurementListInProcurement)
		.where(eq(procurementListInProcurement.id, listId))
	if (!rows[0]) throw new DomainError("NOT_FOUND", `anexo quantitativo ${listId} não encontrado`)
	return rows[0].status
}

/** Barra mutações de composição/quantitativo quando a ATA já saiu do rascunho. */
async function assertDraftEditable(client: SisubDb | TxClient, listId: string): Promise<void> {
	const status = await getListStatus(client, listId)
	if (status !== "draft") {
		throw new DomainError("ATA_NOT_DRAFT", `Anexo quantitativo ${listId} está ${status}: composição e quantitativos são imutáveis após a conclusão`)
	}
}

type ProcurementList = Tables<"procurement_list">
type ProcurementListItem = Tables<"procurement_list_item">
type ProcurementListKitchen = Tables<"procurement_list_kitchen">
type ProcurementListSelection = Tables<"procurement_list_selection">

type AtaSelectionWire = ProcurementListSelection & {
	template: { name: string | null; template_type: string; expected_monthly_occurrences: number | null } | null
}
type AtaKitchenWire = ProcurementListKitchen & { kitchen: { id: number; display_name: string | null } | null; selections: AtaSelectionWire[] }

type AtaSnapshotSelection = {
	template_name: string | null
	template_type: string | null
	kitchen_id: number | null
	kitchen_name: string | null
	repetitions: number
	snapshot_source: string
}
type AtaSnapshotComponent = {
	ingredient_id: string | null
	ingredient_name: string
	folder_description: string | null
	measure_unit: string | null
	total_quantity: number
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: number | null
	catmat_item_codigo: number | null
	unit_price: number | null
	snapshot_source: string
	max_margin_percent: number | null
	max_quantity: number | null
	delivery_cycle: string | null
	min_order_quantity: number | null
}
/** Metadados de integridade computados por request (não persistidos). */
type AtaMeta = {
	is_stale: boolean
	price_research: { oldest_research_at: string | null; validity_days: number; is_expired: boolean }
	snapshot: { selections: AtaSnapshotSelection[]; components: AtaSnapshotComponent[] } | null
}
/** Item com o que decide o ciclo quando a ata ainda não gravou o seu: padrão do insumo e conservação. */
type AtaItemWire = ProcurementListItem & { conservation_class: string | null; ingredient_delivery_cycle: string | null }
type AtaWithDetails = ProcurementList & { kitchens: AtaKitchenWire[]; items: AtaItemWire[]; meta: AtaMeta }

type ItemInsert = typeof procurementListItemInProcurement.$inferInsert

const DETAILS_RELATIONS: Record<string, string> = {
	procurementListSelectionInProcurements: "selections",
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
export async function calculateAtaNeeds(db: SisubDb, ctx: UserContext, input: CalculateAtaNeeds): Promise<ProcurementNeed[]> {
	const { kitchenSelections } = input
	// Não grava nada, mas LÊ planos, receitas e insumos das cozinhas citadas — que vinham do
	// corpo. Sem isto, qualquer sessão abria o plano local de qualquer cozinha pelo cálculo.
	await authorizeNeedsSelections(db, ctx, kitchenSelections)

	// Coletar as seleções dos três regimes (weekly, event, exception). `repetitions`
	// já chega normalizado como "vezes dentro da vigência da ata" — a projeção
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
	// Lido à parte, tolerante à tabela ausente (migração pendente → base vazia, sem quebrar a ATA).
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
		total_quantity: number
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

				// Aquisição: projeta o cardápio × repetições da seleção da ATA.
				const quantityNeeded = scaleIngredientQuantity(Number(ri.netQuantity ?? 0), headcount, portionYield, selection.repetitions)

				const existing = needsMap.get(ri.ingredientId)
				if (existing) {
					existing.total_quantity += quantityNeeded
				} else {
					needsMap.set(ri.ingredientId, { ingredient, total_quantity: quantityNeeded })
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
		const purchaseQuantity = pi ? Number((d.total_quantity / pi.conversion_factor).toFixed(4)) : null
		return {
			folder_id: d.ingredient.folder_id,
			folder_description: d.ingredient.folder?.description || null,
			ingredient_id: ingredientId,
			ingredient_name: d.ingredient.description || "",
			measure_unit: d.ingredient.measure_unit,
			total_quantity: Number(d.total_quantity.toFixed(4)),
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
			// O cálculo já decide o ciclo desta ata a partir do insumo; daqui em diante ele é
			// escolha GRAVADA no item, e mudar o insumo não mexe na ata montada.
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

/** Só a cozinha COM seleção entra na ata (as demais são puladas na gravação) — e só ela é conferida. */
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
 * (pertencer à OM da ata, ou ser alcançável por quem calcula).
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
 * A ata só compõe cozinhas da PRÓPRIA OM (lotação ou compra) com planos delas. O guard da
 * escrita prova só a unidade da ata; as cozinhas e os planos vinham do corpo, e a ata de uma
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

/** Cálculo sem ata: quem calcula precisa alcançar cada cozinha (`kitchen:1` nela ou `unit:1` numa OM dela). */
async function authorizeNeedsSelections(db: SisubDb, ctx: UserContext, kitchenSelections: SelectionScopeInput): Promise<void> {
	const kitchens = await loadSelectionScope(db, kitchenSelections)
	for (const kitchen of kitchens.values()) {
		if (!canReachKitchen(ctx, 1, kitchen)) throw new PermissionDeniedError("kitchen | unit", 1, { type: "kitchen", id: kitchen.id })
	}
}

// ─── Pesquisa de preço citada pela ata ────────────────────────────────────────

/**
 * Filtra os vínculos de pesquisa de preço que a ata pode reivindicar: cabeçalho e item SOLTOS
 * (recém-pesquisados no wizard) ou já ligados a uma ata da MESMA OM, e o item tem de ser do
 * cabeçalho citado.
 *
 * Os ids vinham do corpo e eram religados sem conferência: a ata de uma OM "roubava" a memória
 * de cálculo de outra — e a limpeza de órfãs em `persistDraftItems` depois a APAGAVA. O vínculo
 * alheio é DESCARTADO em vez de recusar a gravação: a chave de idempotência da pesquisa avulsa
 * (sem ata) é por CATMAT/dia/amostras, e duas OMs pesquisando o mesmo item no mesmo dia recebem
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
					id: procurementPesquisaPrecoInProcurement.id,
					ataId: procurementPesquisaPrecoInProcurement.ataId,
					unitId: procurementListInProcurement.unitId,
				})
				.from(procurementPesquisaPrecoInProcurement)
				.leftJoin(procurementListInProcurement, eq(procurementListInProcurement.id, procurementPesquisaPrecoInProcurement.ataId))
				.where(inArray(procurementPesquisaPrecoInProcurement.id, headerIds))
		),
		runQuery("FETCH_FAILED", () =>
			client
				.select({
					id: procurementPesquisaPrecoItemInProcurement.id,
					researchId: procurementPesquisaPrecoItemInProcurement.researchId,
					ataItemId: procurementPesquisaPrecoItemInProcurement.ataItemId,
					unitId: procurementListInProcurement.unitId,
				})
				.from(procurementPesquisaPrecoItemInProcurement)
				.leftJoin(procurementListItemInProcurement, eq(procurementListItemInProcurement.id, procurementPesquisaPrecoItemInProcurement.ataItemId))
				.leftJoin(procurementListInProcurement, eq(procurementListInProcurement.id, procurementListItemInProcurement.listId))
				.where(inArray(procurementPesquisaPrecoItemInProcurement.id, itemIds))
		),
	])

	const ownHeaders = new Set(headers.filter((h) => h.ataId == null || h.unitId === unitId).map((h) => h.id))
	const researchOfOwnItem = new Map(items.filter((i) => i.ataItemId == null || i.unitId === unitId).map((i) => [i.id, i.researchId]))
	return links.filter((l) => ownHeaders.has(l.researchId) && researchOfOwnItem.get(l.researchItemId) === l.researchId)
}

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

/**
 * Autoriza pela UNIDADE dona da ATA — ou do rascunho: são a mesma linha de `procurement_list`,
 * distinguidas por status —, lida do banco e nunca da requisição.
 *
 * Estas operações recebem só o id. Sem resolver o dono, qualquer detentor de `unit:2` numa OM
 * editava preço, descrição e status — ou apagava — a ATA de outra.
 */
async function authorizeAtaList(db: SisubDb, ctx: UserContext, listId: string, level: 1 | 2 = 2): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ unitId: procurementListInProcurement.unitId }).from(procurementListInProcurement).where(eq(procurementListInProcurement.id, listId)).limit(1)
	)
	const unitId = rows[0]?.unitId
	if (unitId == null) throw new DomainError("NOT_FOUND", `anexo quantitativo ${listId} não encontrado`)
	requireUnit(ctx, level, unitId)
	return unitId
}

/**
 * Idem, quando só o id do ITEM chega. Devolve a ATA dona para amarrar o predicado da mutação:
 * entre a checagem e a escrita o item pode ser reparentado, e um `where id = ?` cru aplicaria a
 * escrita a um item que já pertence a outra ATA.
 */
async function authorizeAtaItem(db: SisubDb, ctx: UserContext, ataItemId: string): Promise<string> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ listId: procurementListItemInProcurement.listId })
			.from(procurementListItemInProcurement)
			.where(eq(procurementListItemInProcurement.id, ataItemId))
			.limit(1)
	)
	const listId = rows[0]?.listId
	if (listId == null) throw new DomainError("NOT_FOUND", `item do anexo quantitativo ${ataItemId} não encontrado`)
	await authorizeAtaList(db, ctx, listId)
	return listId
}

export async function createAtaDraft(db: SisubDb, ctx: UserContext, input: CreateAtaDraft): Promise<{ id: string }> {
	requireUnit(ctx, 2, input.unitId)

	const ata = await insertOneOrFail(
		"INSERT_FAILED",
		"Erro ao criar rascunho: no row returned",
		() =>
			db
				.insert(procurementListInProcurement)
				.values({ unitId: input.unitId, title: "Sem nome", status: "draft", wizardStep: 1 })
				.returning({ id: procurementListInProcurement.id }),
		{ prefix: "Erro ao criar rascunho" }
	)
	return { id: ata.id }
}

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export async function updateAtaDraft(db: SisubDb, ctx: UserContext, input: UpdateAtaDraft): Promise<void> {
	const unitId = await authorizeAtaList(db, ctx, input.draftId)
	if (input.kitchenSelections !== undefined) await assertSelectionsBelongToUnit(db, unitId, input.kitchenSelections)

	await db.transaction(async (tx) => {
		const updateData: Partial<typeof procurementListInProcurement.$inferInsert> = { updatedAt: new Date().toISOString() }
		if (input.title !== undefined) updateData.title = input.title
		if (input.notes !== undefined) updateData.notes = input.notes || null
		if (input.wizardStep !== undefined) updateData.wizardStep = input.wizardStep
		if (input.validityMonths !== undefined) updateData.validityMonths = input.validityMonths

		// Detecta draft inexistente (deletado mid-session) em vez de no-op silencioso — paridade com updateAtaStatus/deleteAta.
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set(updateData)
					.where(eq(procurementListInProcurement.id, input.draftId))
					.returning({ id: procurementListInProcurement.id }),
			{ prefix: "Erro ao atualizar rascunho" }
		)

		if (input.kitchenSelections !== undefined) {
			// Substituição destrutiva (delete-all + re-insert) das cozinhas → seleções cascateiam via FK.
			await tx.delete(procurementListKitchenInProcurement).where(eq(procurementListKitchenInProcurement.listId, input.draftId))

			for (const ks of input.kitchenSelections) {
				const allSels = [...ks.templateSelections, ...ks.eventSelections, ...(ks.exceptionSelections ?? [])]
				if (allSels.length === 0) continue

				const ataKitchen = await insertOneOrFail(
					"INSERT_FAILED",
					"Erro ao salvar cozinha: no row returned",
					() =>
						tx
							.insert(procurementListKitchenInProcurement)
							.values({ listId: input.draftId, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
							.returning({ id: procurementListKitchenInProcurement.id }),
					{ prefix: "Erro ao salvar cozinha" }
				)

				const selRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInProcurement).values(selRows), { prefix: "Erro ao salvar seleções" })
			}
		}
	})
}

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

function buildItemPayload(item: DraftItem, draftId: string, computedAt: string): ItemInsert {
	return {
		listId: draftId,
		ingredientId: item.ingredient_id || null,
		ingredientName: item.ingredient_name,
		folderId: item.folder_id || null,
		folderDescription: item.folder_description || null,
		measureUnit: item.measure_unit || null,
		totalQuantity: item.total_quantity,
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
		// Ausente não entra no payload: o update preserva a escolha gravada. Recalcular o alvo
		// não pode apagar a margem ou o mínimo que alguém ajustou no item.
		...(item.max_margin_percent !== undefined && { maxMarginPercent: item.max_margin_percent }),
		...(item.delivery_cycle !== undefined && { deliveryCycle: item.delivery_cycle }),
		...(item.min_order_quantity !== undefined && { minOrderQuantity: item.min_order_quantity ?? null }),
	}
}

/**
 * Replace-all dos itens (update existentes por id, insere novos, deleta removidos), tudo numa
 * transação; opcionalmente relinka pesquisas de preço dos itens novos; seta wizard_step 4.
 * Retorna o mapeamento ingredient_id → ata_item_id para o cliente atualizar o estado local.
 */
export async function saveAtaDraftItems(
	db: SisubDb,
	ctx: UserContext,
	input: SaveAtaDraftItems
): Promise<{ savedIds: Array<{ ingredientId: string; ataItemId: string }>; unlinkedResearchCount: number }> {
	const unitId = await authorizeAtaList(db, ctx, input.draftId)

	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>() // ingredient_id → new item id
	// Um único carimbo para computed_at e updated_at: evita que o próprio save marque o rascunho como defasado.
	const stamp = new Date().toISOString()

	const { unlinkedResearchCount } = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		const result = await persistDraftItems(tx, input.draftId, unitId, existing, toInsert, insertedItemsById, input.researchLinks, stamp)
		await runQuery(
			"UPDATE_FAILED",
			// Passo 5 = "Itens": salvar os quantitativos leva o rascunho para a revisão de itens.
			() => tx.update(procurementListInProcurement).set({ wizardStep: 5, updatedAt: stamp }).where(eq(procurementListInProcurement.id, input.draftId)),
			{ prefix: "Erro ao atualizar rascunho" }
		)
		return result
	})

	const savedIds: Array<{ ingredientId: string; ataItemId: string }> = [
		...existing.map((item) => ({ ingredientId: item.ingredient_id ?? "", ataItemId: item.ata_item_id as string })),
		...Array.from(insertedItemsById.entries()).map(([ingredientId, ataItemId]) => ({ ingredientId, ataItemId })),
	]
	return { savedIds, unlinkedResearchCount }
}

type ResearchLink = { ingredientId: string; researchId: string; researchItemId: string }

/**
 * Chave de negócio de um item para reconciliar pesquisa de preço.
 * Ingrediente tem prioridade (identidade real do item, única por ATA); CATMAT é só fallback
 * para itens sem ingrediente — evita remapear pesquisa entre ingredientes que compartilham CATMAT.
 */
function itemBusinessKey(catmat: number | null | undefined, ingredientId: string | null | undefined): string | null {
	if (ingredientId) return `i:${ingredientId}`
	if (catmat != null) return `c:${catmat}`
	return null
}

/**
 * Núcleo compartilhado por saveAtaDraftItems/finalizeAtaDraft: replace-all dos itens + reconciliação de pesquisas.
 *
 * Reconciliação por chave de negócio (CATMAT→ingrediente): itens existentes preservam o id (e o link);
 * quando um item some mas outro de mesma chave sobrevive/entra, a pesquisa é remapeada em vez de orfanada.
 * Pesquisas realmente órfãs (`ata_item_id` nulo) desta ATA são removidas. Retorna a contagem desvinculada.
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
	const keepIds = new Set(existing.map((i) => i.ata_item_id as string))

	// Itens atuais com chave de negócio (para reconciliar pesquisas antes de deletar).
	const currentItems = await tx
		.select({
			id: procurementListItemInProcurement.id,
			ingredientId: procurementListItemInProcurement.ingredientId,
			catmat: procurementListItemInProcurement.catmatItemCodigo,
		})
		.from(procurementListItemInProcurement)
		.where(eq(procurementListItemInProcurement.listId, draftId))
	const keyByCurrentId = new Map(currentItems.map((r) => [r.id, itemBusinessKey(r.catmat, r.ingredientId)]))
	const toDelete = currentItems.filter((row) => !keepIds.has(row.id)).map((row) => row.id)

	// Mapa chave → item sobrevivente (existentes mantêm id).
	const survivorByKey = new Map<string, string>()
	for (const item of existing) {
		const key = itemBusinessKey(item.catmat_item_codigo, item.ingredient_id)
		if (key) survivorByKey.set(key, item.ata_item_id as string)
	}

	// Atualizar existentes (preserva IDs, logo preserva pesquisa_preco_item.ata_item_id).
	// O predicado amarra a ata (`list_id`): o `ata_item_id` vem do corpo, e um `where id = ?`
	// cru reescrevia — e, pelo `listId` do payload, SEQUESTRAVA — o item de outra ata. Item que
	// não é desta ata derruba a transação inteira em vez de sumir calado.
	for (const item of existing) {
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao salvar itens: item ${item.ata_item_id} não pertence à ata ${draftId}`,
			() =>
				tx
					.update(procurementListItemInProcurement)
					.set(buildItemPayload(item, draftId, stamp))
					.where(and(eq(procurementListItemInProcurement.id, item.ata_item_id as string), eq(procurementListItemInProcurement.listId, draftId)))
					.returning({ id: procurementListItemInProcurement.id }),
			{ prefix: "Erro ao salvar itens" }
		)
	}

	// Inserir novos.
	if (toInsert.length > 0) {
		const insertedItems = await runQuery(
			"INSERT_FAILED",
			() =>
				tx
					.insert(procurementListItemInProcurement)
					.values(toInsert.map((item) => buildItemPayload(item, draftId, stamp)))
					.returning({
						id: procurementListItemInProcurement.id,
						ingredientId: procurementListItemInProcurement.ingredientId,
						catmat: procurementListItemInProcurement.catmatItemCodigo,
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
	// de auditoria, e o cabeçalho segue ligado à ata. Apagá-la sumia com a memória de cálculo de
	// uma pesquisa que de fato aconteceu. A contagem avisa só as desvinculadas NESTE salvamento.
	const unlinkedResearch = new Set<string>()
	if (toDelete.length > 0) {
		const deleteSet = new Set(toDelete)
		const research = await tx
			.select({ id: procurementPesquisaPrecoItemInProcurement.id, ataItemId: procurementPesquisaPrecoItemInProcurement.ataItemId })
			.from(procurementPesquisaPrecoItemInProcurement)
			.where(inArray(procurementPesquisaPrecoItemInProcurement.ataItemId, toDelete))
		for (const r of research) {
			const key = r.ataItemId ? keyByCurrentId.get(r.ataItemId) : null
			const target = key ? survivorByKey.get(key) : undefined
			if (target && !deleteSet.has(target)) {
				await tx.update(procurementPesquisaPrecoItemInProcurement).set({ ataItemId: target }).where(eq(procurementPesquisaPrecoItemInProcurement.id, r.id))
			} else {
				unlinkedResearch.add(r.id)
			}
		}
		// Deletar itens removidos (o que não foi remapeado vira ata_item_id NULL via ON DELETE SET NULL).
		await tx.delete(procurementListItemInProcurement).where(inArray(procurementListItemInProcurement.id, toDelete))
	}

	// Linkar pesquisas de preço aos itens da ATA (cliente reconcilia estado local).
	// Cobre item NOVO e item JÁ EXISTENTE: no wizard, a pesquisa acontece no step 4,
	// quando todos os itens já foram inseridos pelo cálculo — restringir a inseridos
	// deixaria a memória de cálculo órfã justamente no fluxo principal.
	if (researchLinks?.length) {
		const itemIdByIngredient = new Map(insertedItemsById)
		for (const item of existing) {
			if (item.ingredient_id) itemIdByIngredient.set(item.ingredient_id, item.ata_item_id as string)
		}
		for (const link of await filterOwnResearchLinks(tx, unitId, researchLinks)) {
			const newItemId = itemIdByIngredient.get(link.ingredientId)
			if (!newItemId) continue
			await tx
				.update(procurementPesquisaPrecoItemInProcurement)
				.set({ ataItemId: newItemId })
				.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
			await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: draftId }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
			// Religada ao item reinserido no mesmo salvamento: não ficou desvinculada.
			unlinkedResearch.delete(link.researchItemId)
		}
	}

	return { unlinkedResearchCount: unlinkedResearch.size }
}

// ─── Finalizar rascunho (wizard_step → null, ata pronta para publicação) ──────

export async function finalizeAtaDraft(db: SisubDb, ctx: UserContext, input: FinalizeAtaDraft): Promise<ProcurementList> {
	const unitId = await authorizeAtaList(db, ctx, input.draftId)

	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>()
	// Um único carimbo para computed_at e updated_at (ver saveAtaDraftItems).
	const stamp = new Date().toISOString()

	const ata = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		await persistDraftItems(tx, input.draftId, unitId, existing, toInsert, insertedItemsById, input.researchLinks, stamp)

		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao finalizar anexo quantitativo: ${input.draftId} não encontrado`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set({ title: input.title, notes: input.notes || null, wizardStep: null, updatedAt: stamp })
					.where(eq(procurementListInProcurement.id, input.draftId))
					.returning(),
			{ prefix: "Erro ao finalizar anexo quantitativo" }
		)
		return updated
	})

	return toWire<ProcurementList>(ata)
}

// ─── Criar ATA (persiste tudo) ────────────────────────────────────────────────

/**
 * Persists a complete procurement list with its kitchen assignments, template selections and pre-calculated items across 4 tables.
 *
 * SIDE EFFECTS: inserts procurement_list (1), procurement_list_kitchen (n), procurement_list_selection (m), procurement_list_item (p).
 * Tudo numa transação Drizzle: falha parcial desfaz tudo (bug fix vs original sem transação). Status default "draft".
 */
export async function createAta(db: SisubDb, ctx: UserContext, input: CreateAta): Promise<ProcurementList> {
	requireUnit(ctx, 2, input.unitId)

	const { unitId, title, notes, kitchenSelections, items } = input
	const stamp = new Date().toISOString()
	await assertSelectionsBelongToUnit(db, unitId, kitchenSelections)

	const ata = await db.transaction(async (tx) => {
		// 1. Criar lista de compras.
		const created = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao criar lista: no row returned",
			() =>
				tx
					.insert(procurementListInProcurement)
					.values({ unitId, title, notes: notes || null, status: "draft" })
					.returning(),
			{ prefix: "Erro ao criar lista" }
		)

		// 2. Para cada cozinha com seleções, criar procurement_list_kitchen + selections.
		for (const ks of kitchenSelections) {
			const allSels = [...ks.templateSelections, ...ks.eventSelections, ...(ks.exceptionSelections ?? [])]
			if (allSels.length === 0) continue

			const ataKitchen = await insertOneOrFail(
				"INSERT_FAILED",
				"Erro ao associar cozinha: no row returned",
				() =>
					tx
						.insert(procurementListKitchenInProcurement)
						.values({ listId: created.id, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
						.returning({ id: procurementListKitchenInProcurement.id }),
				{ prefix: "Erro ao associar cozinha" }
			)

			const selectionRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInProcurement).values(selectionRows), { prefix: "Erro ao salvar seleções" })
		}

		// 3. Inserir itens calculados.
		if (items.length > 0) {
			const itemRows: ItemInsert[] = items.map((item) => buildItemPayload(item, created.id, stamp))
			const insertedItems = await runQuery(
				"INSERT_FAILED",
				() =>
					tx
						.insert(procurementListItemInProcurement)
						.values(itemRows)
						.returning({ id: procurementListItemInProcurement.id, ingredientId: procurementListItemInProcurement.ingredientId }),
				{ prefix: "Erro ao salvar itens" }
			)

			// 4. Linkar registros de auditoria de pesquisa de preços (se houver).
			if (input.researchLinks?.length && insertedItems.length) {
				for (const link of await filterOwnResearchLinks(tx, unitId, input.researchLinks)) {
					const ataItem = insertedItems.find((i) => i.ingredientId === link.ingredientId)
					if (!ataItem) continue
					await tx
						.update(procurementPesquisaPrecoItemInProcurement)
						.set({ ataItemId: ataItem.id })
						.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
					await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: created.id }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
				}
			}
		}

		return created
	})

	return toWire<ProcurementList>(ata)
}

// ─── Listar ATAs da unidade ───────────────────────────────────────────────────

/** Lists all non-deleted ATAs for a unit, ordered by creation date descending. */
export async function fetchAtaList(db: SisubDb, ctx: UserContext, input: FetchAtaList): Promise<ProcurementList[]> {
	requireUnit(ctx, 1, input.unitId)
	const lists = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(procurementListInProcurement)
				.where(and(eq(procurementListInProcurement.unitId, input.unitId), isNull(procurementListInProcurement.deletedAt)))
				.orderBy(sql`${procurementListInProcurement.createdAt} desc`),
		{ prefix: "Erro ao buscar listas" }
	)
	return lists.map((r) => toWire<ProcurementList>(r))
}

// ─── Buscar ATA com detalhes ──────────────────────────────────────────────────

/**
 * Fetches full ATA details including kitchens, template selections and calculated items. Returns null if ATA row not found.
 *
 * Returns null only on missing ATA; kitchen/items failures still throw.
 */
export async function fetchAtaDetails(db: SisubDb, ctx: UserContext, input: FetchAtaDetails): Promise<AtaWithDetails | null> {
	const ata = await runQuery(
		"QUERY_FAILED",
		() => db.query.procurementListInProcurement.findFirst({ where: eq(procurementListInProcurement.id, input.ataId) }),
		{
			prefix: "Erro ao buscar ata",
		}
	)
	if (!ata) return null
	// A unidade sai da LINHA: qualquer sessão lia a ata — preços, pesquisa, cozinhas — de
	// qualquer OM sabendo o id.
	requireUnit(ctx, 1, ata.unitId)

	// Cozinha → seleções → template em queries SEPARADAS, juntadas em JS.
	// A relational query aninhada gerava o alias
	// `procurementListKitchenInProcurement_procurementListSelectionInProcurements`
	// (73 chars): o Postgres trunca em NAMEDATALEN (63) e o SQL emitido continua
	// referenciando o nome inteiro → 42703 `column ... .template_id does not exist`.
	// Na prática, toda ATA com pelo menos uma cozinha respondia 400.
	const kitchenRows = await runQuery(
		"QUERY_FAILED",
		() => db.select().from(procurementListKitchenInProcurement).where(eq(procurementListKitchenInProcurement.listId, input.ataId)),
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
							.from(procurementListSelectionInProcurement)
							.where(
								inArray(
									procurementListSelectionInProcurement.listKitchenId,
									kitchenRows.map((k) => k.id)
								)
							),
					{ prefix: "Erro ao buscar seleções" }
				)
			: Promise.resolve([]),
	])

	// expectedMonthlyOccurrences vem junto para o wizard reprojetar as seleções de
	// exceção quando a vigência da ata muda, sem uma segunda consulta.
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
		const bucket = selectionsByKitchen.get(sel.listKitchenId)
		if (bucket) bucket.push(withTemplate)
		else selectionsByKitchen.set(sel.listKitchenId, [withTemplate])
	}

	// Chaves iguais às da relational query — DETAILS_RELATIONS mapeia para o contrato de wire.
	const kitchens = kitchenRows.map((k) => ({
		...k,
		kitchenInKitchen: (k.kitchenId != null ? coreKitchenById.get(k.kitchenId) : null) ?? null,
		procurementListSelectionInProcurements: selectionsByKitchen.get(k.id) ?? [],
	}))

	const items = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(procurementListItemInProcurement)
				.where(eq(procurementListItemInProcurement.listId, input.ataId))
				.orderBy(sql`${procurementListItemInProcurement.folderDescription} asc nulls last`, asc(procurementListItemInProcurement.ingredientName)),
		{ prefix: "Erro ao buscar itens" }
	)

	const cycleContext = await fetchCycleContext(db, items)
	const meta = await computeAtaMeta(db, ata.status, input.ataId, kitchens, items, ata.updatedAt ?? null)

	return {
		...toWire<ProcurementList>(ata),
		kitchens: kitchens.map((k) => toWire<AtaKitchenWire>(k, DETAILS_RELATIONS)),
		items: items.map((i) => ({
			...toWire<ProcurementListItem>(i),
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

type ListLimitsRow = { validityMonths: number | null; maxMarginPercent: number; marginJustification: string | null }
type ItemRowFull = typeof procurementListItemInProcurement.$inferSelect

/** Limites resolvidos de todos os itens de uma ata — mesma entrada para a trava de publicação e o snapshot. */
async function loadAtaLimits(
	tx: TxClient,
	listId: string
): Promise<{ list: ListLimitsRow | undefined; items: Array<{ item: ItemRowFull; limits: QuantityLimits }> }> {
	const [list] = await tx
		.select({
			validityMonths: procurementListInProcurement.validityMonths,
			maxMarginPercent: procurementListInProcurement.maxMarginPercent,
			marginJustification: procurementListInProcurement.marginJustification,
		})
		.from(procurementListInProcurement)
		.where(eq(procurementListInProcurement.id, listId))
	const rows = await tx.select().from(procurementListItemInProcurement).where(eq(procurementListItemInProcurement.listId, listId))
	const context = await fetchCycleContext(tx, rows)
	return {
		list,
		items: rows.map((item) => ({
			item,
			limits: computeAtaItemLimits(
				{
					purchaseQuantity: item.purchaseQuantity == null ? null : Number(item.purchaseQuantity),
					totalQuantity: Number(item.totalQuantity),
					deliveryCycle: item.deliveryCycle,
					ingredientDeliveryCycle: item.ingredientId ? context.cycleByIngredient.get(item.ingredientId) : null,
					conservationClass: item.purchaseItemId ? context.conservationByPurchaseItem.get(item.purchaseItemId) : null,
					maxMarginPercent: item.maxMarginPercent,
					minOrderQuantity: item.minOrderQuantity == null ? null : Number(item.minOrderQuantity),
				},
				list ?? {}
			),
		})),
	}
}

type KitchenRow = { procurementListSelectionInProcurements: Array<{ templateId: string }> }
type ItemRow = { computedAt: string | null }

/** Calcula defasagem (stale) do rascunho, validade da pesquisa e snapshot congelado (ATA publicada). */
async function computeAtaMeta(
	db: SisubDb,
	status: string,
	listId: string,
	kitchens: KitchenRow[],
	items: ItemRow[],
	listUpdatedAt: string | null
): Promise<AtaMeta> {
	const maxDate = (values: Array<string | null | undefined>): string | null => {
		const valid = values.filter((v): v is string => !!v)
		return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : null
	}

	// Defasagem: só faz sentido em rascunho com itens já calculados.
	let isStale = false
	const lastComputedAt = maxDate(items.map((i) => i.computedAt))
	if (status === "draft" && lastComputedAt) {
		const templateIds = [...new Set(kitchens.flatMap((k) => k.procurementListSelectionInProcurements.map((s) => s.templateId)))]
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

			// Sinal 4: alteração das próprias seleções da ATA (repetições/cozinhas). procurement_list_selection não
			// tem timestamp, mas updateAtaDraft carimba procurement_list.updated_at — conservador de propósito:
			// melhor um falso "desatualizado" do que publicar quantitativo calculado com repetições antigas.
			lastEdit = maxDate([lastEdit, listUpdatedAt])

			isStale = !!lastEdit && lastEdit > lastComputedAt
		}
	}

	// Validade legal da pesquisa de preço (não-bloqueante).
	const research = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({ createdAt: procurementPesquisaPrecoInProcurement.createdAt })
				.from(procurementPesquisaPrecoInProcurement)
				.where(eq(procurementPesquisaPrecoInProcurement.ataId, listId)),
		{ prefix: "Erro ao buscar pesquisas" }
	)
	const oldestResearchAt = research.length ? research.map((r) => r.createdAt).reduce((a, b) => (a < b ? a : b)) : null
	let isExpired = false
	if (oldestResearchAt) {
		const ageDays = (Date.now() - new Date(oldestResearchAt).getTime()) / 86_400_000
		isExpired = ageDays >= PRICE_RESEARCH_VALIDITY_DAYS
	}

	// Snapshot congelado (só existe após publicação).
	let snapshot: AtaMeta["snapshot"] = null
	if (status !== "draft") {
		const [selections, components] = await Promise.all([
			runQuery(
				"QUERY_FAILED",
				() => db.select().from(procurementListSnapshotSelectionInProcurement).where(eq(procurementListSnapshotSelectionInProcurement.listId, listId)),
				{ prefix: "Erro ao buscar snapshot" }
			),
			runQuery(
				"QUERY_FAILED",
				() => db.select().from(procurementListSnapshotComponentInProcurement).where(eq(procurementListSnapshotComponentInProcurement.listId, listId)),
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
					total_quantity: c.totalQuantity,
					purchase_item_description: c.purchaseItemDescription,
					purchase_measure_unit: c.purchaseMeasureUnit,
					purchase_quantity: c.purchaseQuantity,
					catmat_item_codigo: c.catmatItemCodigo,
					unit_price: c.unitPrice,
					snapshot_source: c.snapshotSource,
					max_margin_percent: c.maxMarginPercent,
					max_quantity: c.maxQuantity,
					delivery_cycle: c.deliveryCycle,
					min_order_quantity: c.minOrderQuantity,
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

// ─── Snapshot da composição (congela ao publicar) ─────────────────────────────

/**
 * Materializa a composição resolvida da ATA em tabelas de snapshot próprias, tornando-a
 * autocontida e imune a edições/soft-delete posteriores de menu_template/receita/item.
 * Idempotente: substitui qualquer snapshot nativo anterior daquela ATA.
 */
async function buildAtaSnapshot(tx: TxClient, listId: string): Promise<void> {
	// Recomeça do zero para permitir republicação sem duplicar.
	await tx.delete(procurementListSnapshotSelectionInProcurement).where(eq(procurementListSnapshotSelectionInProcurement.listId, listId))
	await tx.delete(procurementListSnapshotComponentInProcurement).where(eq(procurementListSnapshotComponentInProcurement.listId, listId))

	// Seleções resolvidas (nome/tipo do cardápio + nome da cozinha congelados).
	const selections = await tx
		.select({
			originTemplateId: procurementListSelectionInProcurement.templateId,
			templateName: menuTemplateInKitchen.name,
			templateType: menuTemplateInKitchen.templateType,
			kitchenId: procurementListKitchenInProcurement.kitchenId,
			kitchenName: kitchenInKitchen.displayName,
			repetitions: procurementListSelectionInProcurement.repetitions,
		})
		.from(procurementListSelectionInProcurement)
		.innerJoin(procurementListKitchenInProcurement, eq(procurementListSelectionInProcurement.listKitchenId, procurementListKitchenInProcurement.id))
		.leftJoin(menuTemplateInKitchen, eq(procurementListSelectionInProcurement.templateId, menuTemplateInKitchen.id))
		.leftJoin(kitchenInKitchen, eq(procurementListKitchenInProcurement.kitchenId, kitchenInKitchen.id))
		.where(eq(procurementListKitchenInProcurement.listId, listId))

	if (selections.length > 0) {
		await tx.insert(procurementListSnapshotSelectionInProcurement).values(
			selections.map((s) => ({
				listId,
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
	// a ata publicada guarda o número que foi publicado, não a regra que o produziu.
	const { items } = await loadAtaLimits(tx, listId)
	if (items.length > 0) {
		await tx.insert(procurementListSnapshotComponentInProcurement).values(
			items.map(({ item: i, limits }) => ({
				listId,
				ingredientId: i.ingredientId,
				ingredientName: i.ingredientName,
				folderDescription: i.folderDescription,
				measureUnit: i.measureUnit,
				totalQuantity: i.totalQuantity,
				purchaseItemId: i.purchaseItemId,
				purchaseItemDescription: i.purchaseItemDescription,
				purchaseMeasureUnit: i.purchaseMeasureUnit,
				purchaseQuantity: i.purchaseQuantity,
				catmatItemCodigo: i.catmatItemCodigo,
				unitPrice: i.unitPrice,
				snapshotSource: "native",
				computedAt: i.computedAt ?? new Date().toISOString(),
				maxMarginPercent: limits.marginPercent,
				maxQuantity: limits.maxQuantity,
				deliveryCycle: limits.deliveryCycle,
				minOrderQuantity: limits.minOrderQuantity,
			}))
		)
	}
}

// ─── Atualizar status da ATA ──────────────────────────────────────────────────

/**
 * Transiciona o status da ATA validando o ciclo de vida (draft → published → archived; sem downgrade).
 * Ao publicar, congela a composição num snapshot próprio (memória de cálculo imutável).
 */
export async function updateAtaStatus(db: SisubDb, ctx: UserContext, input: UpdateAtaStatus): Promise<void> {
	await authorizeAtaList(db, ctx, input.ataId)

	await db.transaction(async (tx) => {
		const current = await getListStatus(tx, input.ataId)
		if (current === input.status) return // no-op idempotente

		const allowed = ALLOWED_STATUS_TRANSITIONS[current] ?? []
		if (!allowed.includes(input.status)) {
			throw new DomainError("INVALID_STATUS_TRANSITION", `Transição inválida: ${current} → ${input.status}`)
		}

		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar status: anexo quantitativo ${input.ataId} não encontrado`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set({ status: input.status, updatedAt: new Date().toISOString() })
					.where(eq(procurementListInProcurement.id, input.ataId))
					.returning({ id: procurementListInProcurement.id }),
			{ prefix: "Erro ao atualizar status" }
		)

		// A justificativa da margem é exigida na PUBLICAÇÃO, uma vez por ata. Arquivar direto
		// um rascunho não publica nada, então não cobra.
		if (current === "draft" && input.status === "published") {
			const { list, items } = await loadAtaLimits(tx, input.ataId)
			if (requiresMarginJustification(items.map((i) => i.limits)) && !list?.marginJustification?.trim()) {
				throw new DomainError(
					"MARGIN_JUSTIFICATION_REQUIRED",
					"Há itens com acréscimo acima da referência: preencha a justificativa da quantidade máxima no anexo quantitativo antes de concluir."
				)
			}
		}

		// Congela o snapshot SÓ na saída do rascunho (publicar OU arquivar direto). Arquivar uma ata
		// publicada não pode recongelar: recalcularia máxima, ciclo e mínimo com a regra e o insumo de
		// hoje — e daria limites a atas publicadas antes do anexo existir.
		if (current === "draft") {
			await buildAtaSnapshot(tx, input.ataId)
		}
	})
}

// ─── Atualizar preços de itens de uma ATA já salva ───────────────────────────

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
async function assertPricesBackedByResearch(tx: TxClient, unitId: number, input: UpdateAtaItemPrices): Promise<void> {
	const ownLinks = await filterOwnResearchLinks(tx, unitId, input.researchLinks ?? [])
	const researchItemIds = [...new Set(ownLinks.map((l) => l.researchItemId))]
	const itemIds = [...new Set(input.updates.map((u) => u.ataItemId))]

	const [research, items] = await Promise.all([
		researchItemIds.length === 0
			? []
			: runQuery("FETCH_FAILED", () =>
					tx
						.select({
							id: procurementPesquisaPrecoItemInProcurement.id,
							ataItemId: procurementPesquisaPrecoItemInProcurement.ataItemId,
							catmat: procurementPesquisaPrecoItemInProcurement.catmatCodigo,
							referencePrice: procurementPesquisaPrecoItemInProcurement.referencePrice,
						})
						.from(procurementPesquisaPrecoItemInProcurement)
						.where(inArray(procurementPesquisaPrecoItemInProcurement.id, researchItemIds))
				),
		runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: procurementListItemInProcurement.id, catmat: procurementListItemInProcurement.catmatItemCodigo })
				.from(procurementListItemInProcurement)
				.where(and(inArray(procurementListItemInProcurement.id, itemIds), eq(procurementListItemInProcurement.listId, input.ataId)))
		),
	])
	const researchById = new Map(research.map((r) => [r.id, r]))
	const catmatByItem = new Map(items.map((i) => [i.id, i.catmat]))

	for (const update of input.updates) {
		const backed = ownLinks.some((link) => {
			if (link.ataItemId !== update.ataItemId) return false
			const row = researchById.get(link.researchItemId)
			if (!row || row.referencePrice == null) return false
			// Pesquisa ainda solta (recém-feita) ou já deste item; nunca a de outro item.
			if (row.ataItemId != null && row.ataItemId !== update.ataItemId) return false
			if (row.catmat == null || row.catmat !== catmatByItem.get(update.ataItemId)) return false
			return isSamePrice(Number(row.referencePrice), update.price)
		})
		if (!backed) {
			throw new DomainError(
				"PRICE_WITHOUT_RESEARCH",
				`Preço do item ${update.ataItemId} sem pesquisa de preços registrada para o mesmo item, CATMAT e valor: refaça a pesquisa do item.`
			)
		}
	}
}

export async function updateAtaItemPrices(db: SisubDb, ctx: UserContext, input: UpdateAtaItemPrices): Promise<void> {
	const unitId = await authorizeAtaList(db, ctx, input.ataId)

	await db.transaction(async (tx) => {
		await assertPricesBackedByResearch(tx, unitId, input)

		// Preço só em item DESTA ata: o `ataItemId` vem do corpo, e o update por id cru repreçava
		// o item de qualquer ata — o guard acima prova só a ata informada.
		for (const u of input.updates) {
			await mutateOrFail(
				"UPDATE_FAILED",
				`Erro ao atualizar preço: item ${u.ataItemId} não pertence ao anexo quantitativo ${input.ataId}`,
				() =>
					tx
						.update(procurementListItemInProcurement)
						.set({ unitPrice: u.price })
						.where(and(eq(procurementListItemInProcurement.id, u.ataItemId), eq(procurementListItemInProcurement.listId, input.ataId)))
						.returning({ id: procurementListItemInProcurement.id }),
				{ prefix: "Erro ao atualizar preço" }
			)
		}

		if (input.researchLinks?.length) {
			// O item de destino do vínculo também tem de ser desta ata.
			const linkItemIds = [...new Set(input.researchLinks.map((l) => l.ataItemId))]
			const ownItems = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: procurementListItemInProcurement.id })
					.from(procurementListItemInProcurement)
					.where(and(inArray(procurementListItemInProcurement.id, linkItemIds), eq(procurementListItemInProcurement.listId, input.ataId)))
			)
			const ownItemIds = new Set(ownItems.map((i) => i.id))
			const foreignItem = linkItemIds.find((id) => !ownItemIds.has(id))
			if (foreignItem)
				throw new DomainError("UPDATE_FAILED", `Erro ao vincular pesquisa: item ${foreignItem} não pertence ao anexo quantitativo ${input.ataId}`)

			for (const link of await filterOwnResearchLinks(tx, unitId, input.researchLinks)) {
				await tx
					.update(procurementPesquisaPrecoItemInProcurement)
					.set({ ataItemId: link.ataItemId })
					.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
				await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: input.ataId }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
			}
		}
	})
}

// ─── Atualizar descrição de um item de ATA ───────────────────────────────────

export async function updateAtaItemDescription(db: SisubDb, ctx: UserContext, input: UpdateAtaItemDescription): Promise<void> {
	// Só o id do ITEM chega — a ATA dona sai do próprio item.
	const listId = await authorizeAtaItem(db, ctx, input.ataItemId)

	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao atualizar descrição: item ${input.ataItemId} não encontrado`,
		() =>
			db
				.update(procurementListItemInProcurement)
				.set({ itemDescription: input.description || null })
				.where(and(eq(procurementListItemInProcurement.id, input.ataItemId), eq(procurementListItemInProcurement.listId, listId)))
				.returning({ id: procurementListItemInProcurement.id }),
		{ prefix: "Erro ao atualizar descrição" }
	)
}

// ─── Ajustar limites do anexo de quantitativos ───────────────────────────────

/**
 * Grava a margem padrão e a justificativa da ata e as escolhas por item (margem, ciclo,
 * mínimo por pedido). Só em rascunho: publicar congela máxima e mínima no snapshot, e mexer
 * depois divergiria o documento publicado do que o sistema mostra.
 *
 * O predicado de cada item amarra a ATA dona (`list_id`): um id de item de outra ata não
 * é atualizado, e a contagem denuncia a divergência em vez de engolir.
 */
export async function updateAtaQuantityLimits(db: SisubDb, ctx: UserContext, input: UpdateAtaQuantityLimits): Promise<void> {
	await authorizeAtaList(db, ctx, input.ataId)

	await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.ataId)

		const listPatch: Partial<typeof procurementListInProcurement.$inferInsert> = {}
		if (input.maxMarginPercent !== undefined) listPatch.maxMarginPercent = input.maxMarginPercent
		if (input.marginJustification !== undefined) listPatch.marginJustification = input.marginJustification?.trim() || null
		if (Object.keys(listPatch).length > 0) {
			// Sem `updated_at`: limite não muda o alvo, então não pode marcar o cálculo como defasado.
			await tx.update(procurementListInProcurement).set(listPatch).where(eq(procurementListInProcurement.id, input.ataId))
		}

		for (const item of input.items ?? []) {
			const patch: Partial<ItemInsert> = {}
			if (item.maxMarginPercent !== undefined) patch.maxMarginPercent = item.maxMarginPercent
			if (item.deliveryCycle !== undefined) patch.deliveryCycle = item.deliveryCycle
			if (item.minOrderQuantity !== undefined) patch.minOrderQuantity = item.minOrderQuantity ?? null
			if (Object.keys(patch).length === 0) continue
			await mutateOrFail(
				"UPDATE_FAILED",
				`Erro ao ajustar limites: item ${item.ataItemId} não pertence ao anexo quantitativo ${input.ataId}`,
				() =>
					tx
						.update(procurementListItemInProcurement)
						.set(patch)
						.where(and(eq(procurementListItemInProcurement.id, item.ataItemId), eq(procurementListItemInProcurement.listId, input.ataId)))
						.returning({ id: procurementListItemInProcurement.id }),
				{ prefix: "Erro ao ajustar limites" }
			)
		}
	})
}

// ─── Deletar ATA (soft delete) ────────────────────────────────────────────────

/** Soft-deletes an ATA by setting deleted_at — kitchen associations and items remain intact. */
export async function deleteAta(db: SisubDb, ctx: UserContext, input: DeleteAta): Promise<void> {
	await authorizeAtaList(db, ctx, input.ataId)

	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar anexo quantitativo: ${input.ataId} não encontrado`,
		() =>
			db
				.update(procurementListInProcurement)
				.set({ deletedAt: new Date().toISOString() })
				.where(eq(procurementListInProcurement.id, input.ataId))
				.returning({ id: procurementListInProcurement.id }),
		{ prefix: "Erro ao deletar anexo quantitativo" }
	)
}
