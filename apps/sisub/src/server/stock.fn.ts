/**
 * @module stock.fn
 * Motor de estoque (Fase 3): saldo, movimentos, ajustes, transferência e
 * contagem física. O ledger é append-only (trigger no banco); custo médio
 * ponderado mantido por triggers; transferência/confirmação de contagem são
 * funções SQL (atômicas).
 * CLIENT: getServerClient (service role, schemas inventory/kitchen/core).
 * AUTH: `storage` nível 1 leitura, 2 movimentar, 3 ajustar/contar.
 * TABLES: inventory.stock_lot, stock_movement, stock_cost, inventory_count(_item).
 * @domain kitchen
 * @migration 20260729160000_inventory_stock_core
 */

import { hasPermission } from "@iefa/pbac"
import { getBrasiliaToday } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { hiddenByBlindCount } from "@/lib/blind-count.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { itemDescription } from "@/lib/item-description"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import {
	aggregateStockBalance,
	applyStockItemNames,
	collectLotIds,
	listDescribableIds,
	type StockBalanceItem,
	type StockBalanceViewRow,
	type StockLotBalanceRow,
	type StockLotMeta,
	selectVisibleStockItems,
} from "@/lib/stock-balance"
import { classifyFoodItems, foodRefOf } from "@/lib/stock-item.server"
import { requireStockForKitchen, requireStockForLocation, resolveKitchenLocation } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"
import { transferDestinationProblem } from "@/lib/transfer-destination"

const inventory = () => getServerClient("inventory")
const kitchen = () => getServerClient("kitchen")

export type { StockBalanceItem, StockLotBalanceRow }

/** Nomes de itens (insumos + preparações congeladas) para exibição. */
async function describeItems(ingredientIds: string[], frozenIds: string[]) {
	const kit = kitchen()
	const names = new Map<string, { description: string; measureUnit: string | null }>()
	// Fatiados: o painel tem centenas de itens, e todos os ids num `.in()` só estouram a URL.
	const [ingredients, frozen] = await Promise.all([
		readAllPagesIn("os insumos", ingredientIds, (chunk, from, to) =>
			kit.from("ingredient").select("id, description, measure_unit").in("id", chunk).order("id").range(from, to)
		),
		readAllPagesIn("as preparações", frozenIds, (chunk, from, to) =>
			kit.from("frozen_preparation").select("id, description, measure_unit").in("id", chunk).order("id").range(from, to)
		),
	])
	for (const row of ingredients) names.set(`i:${row.id}`, { description: itemDescription(row.description), measureUnit: row.measure_unit })
	for (const row of frozen) names.set(`f:${row.id}`, { description: itemDescription(row.description), measureUnit: row.measure_unit })
	return names
}

/** Saldo por item (com lotes) do local de estoque da cozinha, a partir da view do ledger. */
export const fetchStockBalanceFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			/**
			 * Tela de OPERAÇÃO (saída, ajuste): exige nível 2 e não esconde item em
			 * contagem cega. A cozinha não para durante a contagem, e sem o saldo o
			 * operador não escolhe lote. A cegueira protege contra o viés de quem
			 * conta, não contra quem procura o número numa tela de operação — a
			 * defesa contra isso é a recontagem por outra pessoa e a segregação.
			 */
			operation: z.boolean().default(false),
		})
	)
	.handler(async ({ data }): Promise<StockBalanceItem[]> => {
		const { ctx, location } = await requireStockForKitchen(data.operation ? 2 : 1, data.kitchenId)
		const inv = inventory()

		// páginas até o fim: o PostgREST corta em 1000 linhas calado, e cozinha
		// com muitos lotes perdia item do painel
		// biome-ignore lint/suspicious/noExplicitAny: linha da view fora dos tipos gerados
		const rows = await readAllPages<any>("o saldo", (from, to) =>
			inv
				.from("v_stock_balance")
				.select("*")
				.eq("location_id", location.id)
				.order("item_id", { ascending: true, nullsFirst: false })
				.order("lot_id", { ascending: true, nullsFirst: true })
				.range(from, to)
		)

		// Contagem cega alcança TODA leitura de saldo, e não só a folha.
		//
		// Esconder o número na folha e deixá-lo no painel de estoque não é
		// contagem cega: é um clique a mais. O operador abre a outra tela, lê o
		// esperado e volta para "confirmar" — que é exatamente o que a cegueira
		// existe para impedir, porque contagem que confirma o sistema não acha
		// erro nenhum.
		//
		// Quem revisa e aprova (nível 3) continua vendo: é ele que compara. Para os
		// demais, a ocultação vale enquanto a contagem está aberta, inclusive em
		// revisão — é dali que sai a recontagem (`lib/blind-count.server.ts`).
		const hidden = data.operation ? new Set<string>() : await hiddenByBlindCount(data.kitchenId, ctx, location.id)

		// A view é a soma do ledger e não conhece o lote além do código: quarentena,
		// etiqueta, local e "usar primeiro" vêm da tabela. Sem isso a tela mostra
		// saldo de lote em quarentena como disponível — e ele não é alocável.
		const lotIds = collectLotIds(rows ?? [])
		const lotMeta = new Map<string, StockLotMeta>()
		for (const lot of await readAllPagesIn<StockLotMeta & { id: string }>("os lotes", lotIds, (chunk, from, to) =>
			inv.from("stock_lot").select("id, short_code, location, use_first, quarantined_at, derivation").in("id", chunk).order("id").range(from, to)
		)) {
			lotMeta.set(lot.id, lot)
		}

		// A view é por `item_id`; a agregação fala a língua da tela (insumo ou preparação congelada).
		const refs = await classifyFoodItems((rows ?? []).map((row: { item_id: string }) => row.item_id))
		const viewRows: StockBalanceViewRow[] = (rows ?? []).map(
			({ item_id, ...row }: { item_id: string } & Omit<StockBalanceViewRow, "ingredient_id" | "frozen_preparation_id">) => {
				const ref = foodRefOf(refs, item_id)
				return { ...row, ingredient_id: ref.ingredientId, frozen_preparation_id: ref.frozenPreparationId }
			}
		)
		const byItem = aggregateStockBalance(viewRows, lotMeta, getBrasiliaToday)

		const { ingredientIds, frozenIds } = listDescribableIds(byItem)
		const names = await describeItems(ingredientIds, frozenIds)
		applyStockItemNames(byItem, names)
		return selectVisibleStockItems(byItem, hidden)
	})

/** Movimentos recentes do local de estoque da cozinha (com descrição do item). */
export const fetchStockMovementsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(50) }))
	.handler(async ({ data }) => {
		const { location } = await requireStockForKitchen(1, data.kitchenId)
		const { data: rows, error } = await inventory()
			.from("stock_movement")
			.select("id, item_id, lot_id, type, quantity, unit_cost, total_cost, justification, created_at")
			.eq("location_id", location.id)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao consultar movimentos: ${publicDbMessage(error)}`)

		const refs = await classifyFoodItems((rows ?? []).map((m) => m.item_id))
		const movements = (rows ?? []).map(({ item_id, ...m }) => {
			const ref = foodRefOf(refs, item_id)
			return { ...m, ingredient_id: ref.ingredientId, frozen_preparation_id: ref.frozenPreparationId }
		})
		const names = await describeItems(
			[...new Set(movements.map((m) => m.ingredient_id).filter(Boolean))] as string[],
			[...new Set(movements.map((m) => m.frozen_preparation_id).filter(Boolean))] as string[]
		)
		return movements.map((m) => ({
			...m,
			description: names.get(m.ingredient_id ? `i:${m.ingredient_id}` : `f:${m.frozen_preparation_id}`)?.description ?? "—",
		}))
	})

// O ajuste manual saiu daqui: virou DOCUMENTO em `adjustment.fn.ts`, com motivo
// tipado, alçada e segregação checadas no banco. O que existia aqui criava o
// lote numa request e o movimento na outra — a falha da segunda deixava lote
// órfão — e gravava só texto livre, que não vira relatório de perdas.

/**
 * Transferência atômica entre cozinhas (função SQL: par transfer_out/in). A tela escolhe a
 * cozinha de destino; a função recebe o LOCAL de estoque dela.
 */
export const createTransferFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), toKitchenId: z.number().int().positive(), quantity: z.number().positive() }))
	.handler(async ({ data }) => {
		// escopo pela cozinha de ORIGEM do lote (quem cede precisa da permissão): o lote guarda o
		// local de estoque, e a cozinha sai do local
		const { data: lotRow, error: lotRowError } = await inventory().from("stock_lot").select("location_id").eq("id", data.lotId).maybeSingle()
		if (lotRowError) throw new Error(`Erro ao carregar o lote: ${publicDbMessage(lotRowError)}`)
		if (!lotRow) throw new Error("Lote não encontrado")
		const { ctx, location: originLocation } = await requireStockForLocation(2, Number(lotRow.location_id))
		const originKitchenId = originLocation.kitchenId
		const { userId } = ctx

		// O destino vinha do corpo sem conferência nenhuma — ver `transferDestinationProblem`.
		const { data: kitchenRows, error: kitchenError } = await kitchen()
			.from("kitchen")
			.select("id, unit_id, purchase_unit_id")
			.in("id", originKitchenId == null ? [data.toKitchenId] : [originKitchenId, data.toKitchenId])
		if (kitchenError) throw new Error(`Erro ao conferir as cozinhas da transferência: ${publicDbMessage(kitchenError)}`)
		type KitchenUnitRow = { id: number; unit_id: number | null; purchase_unit_id: number | null }
		const toUnits = (row: KitchenUnitRow | undefined) =>
			row
				? { unitId: row.unit_id == null ? null : Number(row.unit_id), purchaseUnitId: row.purchase_unit_id == null ? null : Number(row.purchase_unit_id) }
				: null
		const byId = new Map<number, KitchenUnitRow>((kitchenRows ?? []).map((row) => [Number(row.id), row]))
		const problem = transferDestinationProblem({
			origin: toUnits(originKitchenId == null ? undefined : byId.get(originKitchenId)),
			destination: toUnits(byId.get(data.toKitchenId)),
			// OPERAR o estoque de destino é escrita: nível 2, como todo lançamento do módulo.
			// Nível 1 é só leitura e não autoriza lançar no livro de outra OM.
			callerOperatesDestination: hasPermission(ctx.permissions, "storage", 2, { type: "kitchen", id: data.toKitchenId }),
		})
		if (problem) throw new Error(problem)

		const destination = await resolveKitchenLocation(data.toKitchenId)
		const { data: result, error } = await inventory().rpc("transfer_stock", {
			p_lot_id: data.lotId,
			p_to_location: destination.id,
			p_quantity: data.quantity,
			p_user: userId,
		})
		if (error) throw new Error(`Transferência falhou: ${publicDbMessage(error)}`)
		return { transferPairId: result?.[0]?.transfer_pair_id ?? null }
	})

// ─── Inventário físico ────────────────────────────────────────────────────────

// ── A contagem física mudou de casa ────────────────────────────────────────
// `createInventoryCountFn`, `upsertCountItemFn`, `confirmInventoryCountFn` e
// `fetchInventoryCountsFn` viviam aqui e sumiram: a contagem deixou de ser uma
// folha plana de lote × quantidade e virou documento com escopo, cegueira,
// rodadas e aprovação por quem não contou. O caminho novo é `count.fn.ts`.
//
// A tabela `inventory_count_item` e a função `confirm_inventory_count`
// continuam no banco, sem nenhum chamador, e saem na migration de limpeza —
// derrubá-las junto quebraria toda branch aberta que as referencia no mesmo
// instante em que a migration alcançasse o banco compartilhado.
