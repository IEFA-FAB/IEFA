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

import { brasiliaToday } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { hiddenByBlindCount } from "@/lib/blind-count.server"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

export interface StockLotBalanceRow {
	lot_id: string | null
	lot_code: string | null
	expiry_date: string | null
	balance: number
	balance_value: number
	/** Código da etiqueta interna — null no saldo sem lote (falta de alocação). */
	short_code: string | null
	location: string | null
	use_first: boolean
	quarantined: boolean
	derivation: string | null
}

export interface StockBalanceItem {
	ingredientId: string | null
	frozenPreparationId: string | null
	description: string
	measureUnit: string | null
	balance: number
	balanceValue: number
	lots: StockLotBalanceRow[]
	nextExpiry: string | null
	/** Parte do saldo que está em quarentena — existe, mas não é alocável. */
	quarantinedBalance: number
	/**
	 * Saldo preso em lote VENCIDO.
	 *
	 * A alocação de saída pula lote vencido, exatamente como pula quarentena.
	 * Uma tela que desconta só a quarentena oferece saldo que o banco nunca vai
	 * tocar: o operador pede 20 KG, existem 20 KG "disponíveis" todos vencidos,
	 * e a baixa sai inteira como movimento sem lote — estoque negativo, sem
	 * nenhum aviso.
	 */
	expiredBalance: number
}

/** Nomes de itens (insumos + preparações congeladas) para exibição. */
async function describeItems(ingredientIds: string[], frozenIds: string[]) {
	const kit = kitchen()
	const names = new Map<string, { description: string; measureUnit: string | null }>()
	if (ingredientIds.length > 0) {
		const { data } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
		for (const row of data ?? []) names.set(`i:${row.id}`, { description: row.description ?? "(sem descrição)", measureUnit: row.measure_unit })
	}
	if (frozenIds.length > 0) {
		const { data } = await kit.from("frozen_preparation").select("id, description, measure_unit").in("id", frozenIds)
		for (const row of data ?? []) names.set(`f:${row.id}`, { description: row.description ?? "(sem descrição)", measureUnit: row.measure_unit })
	}
	return names
}

/** Saldo por item (com lotes) de uma cozinha, a partir da view do ledger. */
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
		const ctx = await requireStorageForKitchen(data.operation ? 2 : 1, data.kitchenId)
		const inv = inventory()

		// páginas até o fim: o PostgREST corta em 1000 linhas calado, e cozinha
		// com muitos lotes perdia item do painel
		// biome-ignore lint/suspicious/noExplicitAny: linha da view fora dos tipos gerados
		const rows = await readAllPages<any>("o saldo", (from, to) =>
			inv
				.from("v_stock_balance")
				.select("*")
				.eq("kitchen_id", data.kitchenId)
				.order("ingredient_id", { ascending: true, nullsFirst: false })
				.order("frozen_preparation_id", { ascending: true, nullsFirst: false })
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
		const hidden = data.operation ? new Set<string>() : await hiddenByBlindCount(data.kitchenId, ctx)

		// A view é a soma do ledger e não conhece o lote além do código: quarentena,
		// etiqueta, local e "usar primeiro" vêm da tabela. Sem isso a tela mostra
		// saldo de lote em quarentena como disponível — e ele não é alocável.
		const lotIds = [...new Set((rows ?? []).map((row: { lot_id: string | null }) => row.lot_id).filter(Boolean))] as string[]
		const lotMeta = new Map<
			string,
			{ short_code: string; location: string | null; use_first: boolean; quarantined_at: string | null; derivation: string | null }
		>()
		for (const lot of await readAllPagesIn<{
			id: string
			short_code: string
			location: string | null
			use_first: boolean
			quarantined_at: string | null
			derivation: string | null
		}>("os lotes", lotIds, (chunk, from, to) =>
			inv.from("stock_lot").select("id, short_code, location, use_first, quarantined_at, derivation").in("id", chunk).order("id").range(from, to)
		)) {
			lotMeta.set(lot.id, lot)
		}

		const byItem = new Map<string, StockBalanceItem>()
		for (const row of rows ?? []) {
			const key = row.ingredient_id ? `i:${row.ingredient_id}` : `f:${row.frozen_preparation_id}`
			const item: StockBalanceItem = byItem.get(key) ?? {
				ingredientId: row.ingredient_id,
				frozenPreparationId: row.frozen_preparation_id,
				description: "",
				measureUnit: null,
				balance: 0,
				balanceValue: 0,
				lots: [],
				nextExpiry: null,
				quarantinedBalance: 0,
				expiredBalance: 0,
			}
			item.balance += Number(row.balance ?? 0)
			item.balanceValue += Number(row.balance_value ?? 0)
			const meta = row.lot_id ? lotMeta.get(row.lot_id) : undefined
			item.lots.push({
				lot_id: row.lot_id,
				lot_code: row.lot_code,
				expiry_date: row.expiry_date,
				balance: Number(row.balance ?? 0),
				balance_value: Number(row.balance_value ?? 0),
				short_code: meta?.short_code ?? null,
				location: meta?.location ?? null,
				use_first: meta?.use_first ?? false,
				quarantined: meta?.quarantined_at != null,
				derivation: meta?.derivation ?? null,
			})
			if (meta?.quarantined_at != null) item.quarantinedBalance += Number(row.balance ?? 0)
			// vencido na data civil de Brasília, como a alocação mede
			else if (row.expiry_date != null && row.expiry_date < brasiliaToday()) item.expiredBalance += Number(row.balance ?? 0)
			if (row.expiry_date && Number(row.balance ?? 0) > 0 && meta?.quarantined_at == null && (item.nextExpiry == null || row.expiry_date < item.nextExpiry)) {
				item.nextExpiry = row.expiry_date
			}
			byItem.set(key, item)
		}

		const names = await describeItems(
			[...byItem.values()].map((i) => i.ingredientId).filter((id): id is string => id != null),
			[...byItem.values()].map((i) => i.frozenPreparationId).filter((id): id is string => id != null)
		)
		for (const [key, item] of byItem) {
			const meta = names.get(key)
			item.description = meta?.description ?? key
			item.measureUnit = meta?.measureUnit ?? null
			item.lots.sort((a, b) => ((a.expiry_date ?? "9999") < (b.expiry_date ?? "9999") ? -1 : 1))
		}
		const visible = [...byItem.values()].filter((item) => !hidden.has(item.ingredientId ?? item.frozenPreparationId ?? ""))
		return visible.sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))
	})

/** Movimentos recentes de uma cozinha (com descrição do item). */
export const fetchStockMovementsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(50) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: rows, error } = await inventory()
			.from("stock_movement")
			.select("id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, total_cost, justification, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao consultar movimentos: ${error.message}`)

		const movements = rows ?? []
		const names = await describeItems(
			[...new Set(movements.map((m: { ingredient_id: string | null }) => m.ingredient_id).filter(Boolean))] as string[],
			[...new Set(movements.map((m: { frozen_preparation_id: string | null }) => m.frozen_preparation_id).filter(Boolean))] as string[]
		)
		return movements.map((m: Record<string, unknown>) => ({
			...m,
			description: names.get(m.ingredient_id ? `i:${m.ingredient_id}` : `f:${m.frozen_preparation_id}`)?.description ?? "—",
		}))
	})

// O ajuste manual saiu daqui: virou DOCUMENTO em `adjustment.fn.ts`, com motivo
// tipado, alçada e segregação checadas no banco. O que existia aqui criava o
// lote numa request e o movimento na outra — a falha da segunda deixava lote
// órfão — e gravava só texto livre, que não vira relatório de perdas.

/** Transferência atômica entre cozinhas (função SQL: par transfer_out/in). */
export const createTransferFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), toKitchenId: z.number().int().positive(), quantity: z.number().positive() }))
	.handler(async ({ data }) => {
		// escopo pela cozinha de ORIGEM do lote (quem cede precisa da permissão)
		const { data: lotRow } = await inventory().from("stock_lot").select("kitchen_id").eq("id", data.lotId).maybeSingle()
		if (!lotRow) throw new Error("Lote não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(lotRow.kitchen_id))
		const { data: result, error } = await inventory().rpc("transfer_stock", {
			p_lot_id: data.lotId,
			p_to_kitchen: data.toKitchenId,
			p_quantity: data.quantity,
			p_user: userId,
		})
		if (error) throw new Error(`Transferência falhou: ${error.message}`)
		return { transferPairId: result?.[0]?.transfer_pair_id ?? null }
	})

// ─── Contagem física ─────────────────────────────────────────────────────────

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
