/**
 * @module opening-balance.fn
 * Carga de abertura do estoque: a cozinha que começa a usar o sisub já tem mercadoria na
 * prateleira, e este é o caminho para ela entrar com lote, validade, local e custo — sem virar
 * "achado" de inventário nem contaminar o relatório de perdas.
 *
 * Fluxo: planilha (livre ou a folha gerada do catálogo) → rascunho com as linhas válidas e as
 * recusadas com motivo → custo por linha (sugestão de ATA/pesquisa, "aceitar todas" ou digitado)
 * → lançamento por nível 3, que cria os lotes e os `adjustment_in` com motivo `opening_balance`.
 *
 * CLIENT: getServerClient (service role, schema inventory).
 * AUTH: `storage` nível 1 lê; nível 2 prepara (importa, custeia, cancela); nível 3 lança.
 *   A cozinha vem SEMPRE da linha do documento, nunca do input, em toda fn que recebe o id.
 * TABLES: inventory.opening_balance(_item), stock_cost (leitura), procurement.* (preços).
 * @domain kitchen
 * @migration 20260922100000_inventory_opening_balance
 */

import { CONSERVATION_CLASSES, OPENING_BALANCE_SOURCES, type OpeningBalanceSource, type OpeningCostSource } from "@iefa/sisub-domain"
import {
	buildIngredientIndex,
	buildOpeningCatalogSheet,
	OpeningSheetError,
	type OpeningSheetRejection,
	parseOpeningSheet,
	resolveOpeningSheet,
} from "@iefa/sisub-domain/opening-balance"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
	loadCanonicalUnits,
	loadConservationClasses,
	loadKitchenUnitId,
	loadMovedIngredientIds,
	loadOpeningCatalog,
	suggestOpeningCosts,
} from "@/lib/opening-balance.server"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

/** Teto do arquivo enviado: 5.000 linhas de CSV cabem com folga em 3 MB. */
const MAX_SHEET_CHARS = 3_000_000

interface OpeningDocRow {
	id: string
	kitchen_id: number
	status: "draft" | "posted" | "cancelled"
	source: OpeningBalanceSource
	source_filename: string | null
	import_rejections: OpeningSheetRejection[] | null
	created_at: string
	updated_at: string
	posted_at: string | null
	posted_value: number | string | null
	cancelled_at: string | null
}

interface OpeningItemRow {
	id: string
	line_number: number
	ingredient_id: string
	quantity: number | string
	lot_code: string | null
	expiry_date: string | null
	location: string | null
	unit_cost: number | string | null
	cost_source: OpeningCostSource | null
	cost_reference: string | null
}

/**
 * Documento pelo id, com a cozinha checada contra o nível pedido. A cozinha é a da LINHA — o
 * id vem do cliente, e aceitar a cozinha do input deixaria o nível 3 de uma cozinha lançar a
 * carga de outra.
 */
async function requireOpeningDoc(openingBalanceId: string, level: 1 | 2 | 3) {
	const { data, error } = await inventory().from("opening_balance").select("id, kitchen_id, status").eq("id", openingBalanceId).maybeSingle()
	if (error) throw new Error(`Erro ao carregar a carga de abertura: ${error.message}`)
	if (!data) throw new Error("Carga de abertura não encontrada")
	const kitchenId = Number(data.kitchen_id)
	const ctx = await requireStorageForKitchen(level, kitchenId)
	return { ctx, kitchenId, status: data.status as OpeningDocRow["status"] }
}

async function loadItems(openingBalanceId: string): Promise<OpeningItemRow[]> {
	return readAllPages<OpeningItemRow>("as linhas da carga", (from, to) =>
		inventory()
			.from("opening_balance_item")
			.select("id, line_number, ingredient_id, quantity, lot_code, expiry_date, location, unit_cost, cost_source, cost_reference")
			.eq("opening_balance_id", openingBalanceId)
			.order("line_number")
			.order("id")
			.range(from, to)
	)
}

const num = (value: number | string | null) => (value == null ? null : Number(value))

/**
 * Rascunho aberto da cozinha (com linhas, custo e sugestão por linha) e as últimas cargas.
 */
export const fetchOpeningBalanceFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()

		const {
			data: docs,
			error,
			count,
		} = await inv
			.from("opening_balance")
			.select("id, kitchen_id, status, source, source_filename, import_rejections, created_at, updated_at, posted_at, posted_value, cancelled_at", {
				count: "exact",
			})
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(20)
		if (error) throw new Error(`Erro ao carregar as cargas de abertura: ${error.message}`)
		const rows = (docs ?? []) as OpeningDocRow[]
		const draftRow = rows.find((row) => row.status === "draft") ?? null

		let draft = null
		if (draftRow) {
			const items = await loadItems(draftRow.id)
			const ingredientIds = [...new Set(items.map((item) => item.ingredient_id))]
			const described = await readAllPagesIn<{ id: string; description: string | null; measure_unit: string | null }>(
				"os insumos da carga",
				ingredientIds,
				(chunk, from, to) => kitchen().from("ingredient").select("id, description, measure_unit").in("id", chunk).order("id").range(from, to)
			)
			const ingredientById = new Map(described.map((row) => [row.id, row]))
			const suggestions = await suggestOpeningCosts(ingredientIds, await loadKitchenUnitId(data.kitchenId))

			const lines = items.map((item) => {
				const ingredient = ingredientById.get(item.ingredient_id)
				const suggestion = suggestions.get(item.ingredient_id) ?? null
				return {
					id: item.id,
					lineNumber: item.line_number,
					ingredientId: item.ingredient_id,
					description: ingredient?.description ?? item.ingredient_id,
					unit: ingredient?.measure_unit ?? null,
					quantity: Number(item.quantity),
					lotCode: item.lot_code,
					expiryDate: item.expiry_date,
					location: item.location,
					unitCost: num(item.unit_cost),
					costSource: item.cost_source,
					costReference: item.cost_reference,
					suggestion: suggestion ? { unitCost: suggestion.unitCost, source: suggestion.source, reference: suggestion.reference } : null,
				}
			})
			const missingCost = lines.filter((line) => line.unitCost == null).length
			draft = {
				id: draftRow.id,
				source: draftRow.source,
				sourceFilename: draftRow.source_filename,
				updatedAt: draftRow.updated_at,
				rejections: draftRow.import_rejections ?? [],
				lines,
				missingCost,
				suggestible: lines.filter((line) => line.unitCost == null && line.suggestion != null).length,
				value: lines.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.quantity, 0),
			}
		}

		const history = rows
			.filter((row) => row.status !== "draft")
			.map((row) => ({
				id: row.id,
				status: row.status,
				sourceFilename: row.source_filename,
				createdAt: row.created_at,
				postedAt: row.posted_at,
				cancelledAt: row.cancelled_at,
				postedValue: num(row.posted_value),
			}))

		return { draft, history, total: count ?? rows.length }
	})

/**
 * Folha para preencher, gerada do catálogo — opcionalmente só uma classe de conservação, que é
 * como a contagem física acontece (câmara fria de uma vez, almoxarifado seco de outra). Itens
 * que já movimentaram na cozinha ficam de fora: seriam recusados na volta.
 */
export const downloadOpeningCatalogSheetFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			conservationClass: z.enum(CONSERVATION_CLASSES).optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(2, data.kitchenId)
		const [catalog, moved, classes] = await Promise.all([
			loadOpeningCatalog(),
			loadMovedIngredientIds(data.kitchenId),
			data.conservationClass ? loadConservationClasses() : Promise.resolve(null),
		])
		const selected = catalog
			.filter((ingredient) => !moved.has(ingredient.id))
			.filter((ingredient) => !classes || classes.get(ingredient.id) === data.conservationClass)
			.sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))
		const suffix = data.conservationClass ? `-${data.conservationClass}` : ""
		return {
			fileName: `carga-inicial-cozinha-${data.kitchenId}${suffix}.csv`,
			content: buildOpeningCatalogSheet(selected),
			count: selected.length,
		}
	})

/**
 * Importa a planilha para o rascunho da cozinha. Linha inválida volta com o motivo e não
 * impede as válidas; reimportar substitui as linhas do rascunho (os custos de linhas iguais
 * são mantidos pelo banco).
 */
export const importOpeningSheetFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			fileName: z.string().trim().min(1).max(200),
			content: z.string().max(MAX_SHEET_CHARS, "Arquivo grande demais para uma carga de abertura — divida a planilha"),
			source: z.enum(OPENING_BALANCE_SOURCES),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)

		let parsed: ReturnType<typeof parseOpeningSheet>
		try {
			parsed = parseOpeningSheet(data.content)
		} catch (error) {
			if (error instanceof OpeningSheetError) throw new Error(error.message)
			throw error
		}

		const [catalog, canonicalUnits, movedIngredientIds] = await Promise.all([
			loadOpeningCatalog(),
			loadCanonicalUnits(),
			loadMovedIngredientIds(data.kitchenId),
		])
		const { lines, rejections } = resolveOpeningSheet(parsed, buildIngredientIndex(catalog), { canonicalUnits, movedIngredientIds })
		if (lines.length === 0) {
			throw new Error(
				rejections.length > 0
					? `Nenhuma linha válida: ${rejections.length} recusada(s). Primeira: linha ${rejections[0]?.lineNumber} — ${rejections[0]?.reason}`
					: "Nenhuma linha preenchida — informe a quantidade dos itens que a cozinha tem"
			)
		}

		const { data: openingBalanceId, error } = await inventory().rpc("save_opening_balance_draft", {
			p_kitchen_id: data.kitchenId,
			p_actor: userId,
			p_source: data.source,
			p_source_filename: data.fileName,
			p_items: lines.map((line) => ({
				line_number: line.lineNumber,
				ingredient_id: line.ingredientId,
				quantity: line.quantity,
				lot_code: line.lotCode,
				expiry_date: line.expiryDate,
				location: line.location,
			})),
			p_rejections: rejections,
		})
		if (error) throw new Error(`Erro ao salvar o rascunho da carga: ${error.message}`)

		return { openingBalanceId: openingBalanceId as string, accepted: lines.length, rejected: rejections.length }
	})

/**
 * "Aceitar todas as sugestões": aplica a sugestão de custo a toda linha que ainda não tem custo.
 * A sugestão é RECALCULADA aqui, no servidor — se viesse do cliente, a fonte "ATA" gravada no
 * documento seria só o que o navegador disse que era.
 */
export const applyOpeningCostSuggestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ openingBalanceId: z.uuid() }))
	.handler(async ({ data }) => {
		const { ctx, kitchenId, status } = await requireOpeningDoc(data.openingBalanceId, 2)
		if (status !== "draft") throw new Error("Só a carga em rascunho recebe custo")

		const pending = (await loadItems(data.openingBalanceId)).filter((item) => item.unit_cost == null)
		if (pending.length === 0) return { applied: 0, remaining: 0 }

		const suggestions = await suggestOpeningCosts([...new Set(pending.map((item) => item.ingredient_id))], await loadKitchenUnitId(kitchenId))
		const costs = pending.flatMap((item) => {
			const suggestion = suggestions.get(item.ingredient_id)
			return suggestion
				? [{ item_id: item.id, unit_cost: suggestion.unitCost, cost_source: suggestion.source, cost_reference: suggestion.reference.slice(0, 200) }]
				: []
		})
		if (costs.length > 0) {
			const { error } = await inventory().rpc("set_opening_balance_costs", { p_opening_balance_id: data.openingBalanceId, p_actor: ctx.userId, p_costs: costs })
			if (error) throw new Error(`Erro ao aplicar as sugestões de custo: ${error.message}`)
		}
		return { applied: costs.length, remaining: pending.length - costs.length }
	})

/** Custo de uma linha, digitado. A fonte gravada é `manual`, com a observação de quem digitou. */
export const setOpeningItemCostFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			openingBalanceId: z.uuid(),
			itemId: z.uuid(),
			unitCost: z.number().positive("Custo precisa ser maior que zero").max(99_999_999),
			reference: z.string().trim().max(200).optional(),
		})
	)
	.handler(async ({ data }) => {
		const { ctx, status } = await requireOpeningDoc(data.openingBalanceId, 2)
		if (status !== "draft") throw new Error("Só a carga em rascunho recebe custo")
		const { error } = await inventory().rpc("set_opening_balance_costs", {
			p_opening_balance_id: data.openingBalanceId,
			p_actor: ctx.userId,
			p_costs: [
				{ item_id: data.itemId, unit_cost: Math.round(data.unitCost * 10_000) / 10_000, cost_source: "manual", cost_reference: data.reference || null },
			],
		})
		if (error) throw new Error(`Erro ao gravar o custo: ${error.message}`)
		return { saved: true }
	})

/**
 * Lança a carga: nível 3, uma aprovação. O banco recusa se faltar custo, se algum item já tiver
 * movimentado na cozinha ou se o documento não estiver mais em rascunho.
 */
export const postOpeningBalanceFn = createServerFn({ method: "POST" })
	.validator(z.object({ openingBalanceId: z.uuid() }))
	.handler(async ({ data }) => {
		const { ctx } = await requireOpeningDoc(data.openingBalanceId, 3)
		const { data: result, error } = await inventory().rpc("post_opening_balance", { p_opening_balance_id: data.openingBalanceId, p_actor: ctx.userId })
		if (error) throw new Error(`Erro ao lançar a carga de abertura: ${error.message}`)
		const row = (Array.isArray(result) ? result[0] : result) as { movements: number; value: number | string | null } | undefined
		return { movements: Number(row?.movements ?? 0), value: Number(row?.value ?? 0) }
	})

/** Descarta o rascunho. Nada foi lançado, então nada a desfazer no ledger. */
export const cancelOpeningBalanceFn = createServerFn({ method: "POST" })
	.validator(z.object({ openingBalanceId: z.uuid() }))
	.handler(async ({ data }) => {
		const { ctx } = await requireOpeningDoc(data.openingBalanceId, 2)
		const { error } = await inventory().rpc("cancel_opening_balance", { p_opening_balance_id: data.openingBalanceId, p_actor: ctx.userId })
		if (error) throw new Error(`Erro ao cancelar o rascunho: ${error.message}`)
		return { cancelled: true }
	})
