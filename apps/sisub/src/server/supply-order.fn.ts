/**
 * @module supply-order.fn
 * Ordem de Fornecimento (Fase 4): distribui um empenho da unidade para entrega
 * numa cozinha, com data prevista (insumo do lead time). Emissão valida o saldo
 * do empenho via constraint trigger no banco — pelo VALOR VIGENTE (reforço e
 * anulação contam) desde 20260926214000. A OF pode sair AGUARDANDO empenho
 * (a emergência acontece): fica a pendência "regularize a NE" (Lei 4.320/1964,
 * art. 60), e a NE se vincula depois (`linkSupplyOrderEmpenhoFn`).
 * CLIENT: getServerClient (service role, schemas procurement/finance).
 * AUTH: `storage` nível 2.
 * TABLES: procurement.supply_order(_item), finance.empenho (leitura).
 * @domain kitchen
 * @migration 20260926214000_acquisition_origin
 */

import { resolvePurchaseUnitId } from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { checkSupplierSicaf } from "@/lib/sicaf.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"
import { supplyOrderLinkProblems } from "@/lib/supply-order-gate"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration (task 2.4)
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const procurement = () => getServerClient("procurement") as unknown as LooseClient

/** OFs de uma cozinha, com itens e dados do empenho. */
export const listSupplyOrdersFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const proc = procurement()

		const { data: orders, error } = await proc
			.from("supply_order")
			.select("id, empenho_id, number, sent_at, expected_delivery, status, sicaf_status, notes, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar OFs: ${error.message}`)
		const list = orders ?? []
		if (list.length === 0) return []

		const { data: items } = await proc
			.from("supply_order_item")
			.select("id, supply_order_id, arp_item_id, purchase_item_id, ordered_qty, unit_price")
			.in(
				"supply_order_id",
				list.map((o: { id: string }) => o.id)
			)

		// OF aguardando empenho tem `empenho_id` nulo: fica fora da consulta e sai com `empenho: null`.
		const empenhoIds = [...new Set(list.map((o: { empenho_id: string | null }) => o.empenho_id).filter((id: string | null): id is string => id != null))]
		const empenhoById = new Map<string, unknown>()
		if (empenhoIds.length > 0) {
			const { data: empenhos, error: empenhoError } = await (getServerClient("finance") as unknown as LooseClient)
				.from("empenho")
				.select("id, numero_empenho, quantidade_empenhada, valor_total, status")
				.in("id", empenhoIds)
			if (empenhoError) throw new Error(`Erro ao ler os empenhos das OFs: ${empenhoError.message}`)
			for (const e of empenhos ?? []) empenhoById.set(e.id, e)
		}

		return list.map((order: { id: string; empenho_id: string | null }) => ({
			...order,
			empenho: order.empenho_id ? (empenhoById.get(order.empenho_id) ?? null) : null,
			awaitingEmpenho: order.empenho_id == null,
			items: (items ?? []).filter((item: { supply_order_id: string }) => item.supply_order_id === order.id),
		}))
	})

/**
 * arp_item → purchase_item pelo código CATMAT. Devolve só o que resolve sem
 * ambiguidade: dois itens de compra com o mesmo CATMAT significam que o elo
 * não é conhecido, e gravar um deles seria inventar rastreabilidade.
 */
async function resolvePurchaseItemsByArpItem(arpItemIds: readonly string[]): Promise<Map<string, string>> {
	const resolved = new Map<string, string>()
	const ids = [...new Set(arpItemIds)]
	if (ids.length === 0) return resolved
	const proc = procurement()

	const { data: arpItems } = await proc.from("procurement_arp_item").select("id, catmat_item_codigo").in("id", ids)
	const catmatByArpItem = new Map<string, string>()
	for (const row of arpItems ?? []) {
		if (row.catmat_item_codigo) catmatByArpItem.set(row.id as string, String(row.catmat_item_codigo))
	}
	const catmats = [...new Set(catmatByArpItem.values())]
	if (catmats.length === 0) return resolved

	const { data: purchaseItems } = await proc.from("purchase_item").select("id, catmat_item_codigo").in("catmat_item_codigo", catmats)
	const byCatmat = new Map<string, string[]>()
	for (const row of purchaseItems ?? []) {
		const key = String(row.catmat_item_codigo)
		byCatmat.set(key, [...(byCatmat.get(key) ?? []), row.id as string])
	}
	for (const [arpItemId, catmat] of catmatByArpItem) {
		const candidates = byCatmat.get(catmat) ?? []
		if (candidates.length === 1) resolved.set(arpItemId, candidates[0] as string)
	}
	return resolved
}

/** Itens de ARP cobertos pela NE — pelos itens dela; o cabeçalho antigo conta enquanto o item não existe. */
async function coveredArpItemIds(empenhoId: string, headerArpItemId: string | null): Promise<string[]> {
	const { data, error } = await (getServerClient("finance") as unknown as LooseClient).from("empenho_item").select("arp_item_id").eq("empenho_id", empenhoId)
	if (error) throw new Error(`Erro ao ler os itens do empenho: ${error.message}`)
	const ids = (data ?? []).map((row: { arp_item_id: string | null }) => row.arp_item_id).filter((id: string | null): id is string => id != null)
	if (headerArpItemId && !ids.includes(headerArpItemId)) ids.push(headerArpItemId)
	return ids
}

/** CNPJ do fornecedor para o SICAF: o favorecido da NE; sem ele, o fornecedor único dos itens de ARP. */
async function supplierCnpjFor(favorecidoCnpj: string | null, arpItemIds: readonly string[]): Promise<string | null> {
	const direct = favorecidoCnpj?.replace(/\D/g, "") ?? ""
	if (direct.length === 14) return direct
	if (arpItemIds.length === 0) return null
	const { data, error } = await procurement()
		.from("procurement_arp_item")
		.select("ni_fornecedor")
		.in("id", [...arpItemIds])
	if (error) throw new Error(`Erro ao ler o fornecedor da ARP: ${error.message}`)
	const cnpjs = new Set(
		(data ?? []).map((row: { ni_fornecedor: string | null }) => row.ni_fornecedor?.replace(/\D/g, "") ?? "").filter((c: string) => c.length === 14)
	)
	return cnpjs.size === 1 ? ([...cnpjs][0] as string) : null
}

/**
 * Emite uma OF contra um empenho — ou AGUARDANDO empenho (`empenhoId` ausente). O trigger do banco
 * garante soma das OFs ≤ valor vigente do empenho e recusa empenho anulado.
 */
export const createSupplyOrderFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			/** Ausente = OF aguardando empenho (pendência "regularize a NE"). */
			empenhoId: z.uuid().nullable().optional(),
			kitchenId: z.number().int().positive(),
			number: z.string().optional(),
			expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			items: z
				.array(
					z.object({
						arpItemId: z.uuid().optional(),
						purchaseItemId: z.uuid().optional(),
						orderedQty: z.number().positive(),
						unitPrice: z.number().nonnegative().optional(),
					})
				)
				.min(1),
			sicafStatus: z.string().optional(),
			sicafAcknowledged: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const proc = procurement()

		// SICAF SERVER-SIDE (review: evidência vinda do cliente podia ser de
		// outro fornecedor/defasada): o CNPJ vem do fornecedor do EMPENHO
		// (favorecido da NE, ou o fornecedor dos itens de ARP) e a consulta acontece
		// aqui, na emissão. OF aguardando empenho não tem fornecedor conhecido ainda.
		let sicafStatus: string | null = null
		const finance = getServerClient("finance") as unknown as LooseClient
		let empenhoRow: { arp_item_id: string | null; unit_id: number | null; status: string; favorecido_cnpj: string | null } | null = null
		if (data.empenhoId) {
			const { data: row, error: empenhoError } = await finance
				.from("empenho")
				.select("arp_item_id, unit_id, status, favorecido_cnpj")
				.eq("id", data.empenhoId)
				.maybeSingle()
			if (empenhoError) throw new Error(`Erro ao conferir o empenho: ${empenhoError.message}`)
			if (!row) throw new Error("Empenho não encontrado")
			empenhoRow = row
		}
		const covered = empenhoRow && data.empenhoId ? await coveredArpItemIds(data.empenhoId, empenhoRow.arp_item_id) : []

		// O guard acima prova só a cozinha. O empenho vinha do corpo e o `unit_id`
		// dele era lido sem comparação: a OF consumia o saldo de outra OM. A unidade
		// compradora é calculada como em `listEmpenhosForKitchenFn`, de onde a tela
		// tira o empenho — e ANTES do SICAF, que não deve consultar fornecedor alheio.
		const kitchenDb = getServerClient("kitchen") as unknown as LooseClient
		const { data: kitchenRow, error: kitchenError } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).maybeSingle()
		if (kitchenError) throw new Error(`Erro ao conferir a cozinha: ${kitchenError.message}`)
		const problems = supplyOrderLinkProblems({
			kitchenPurchaseUnitId: resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null }),
			empenho: empenhoRow
				? { unitId: empenhoRow.unit_id == null ? null : Number(empenhoRow.unit_id), status: String(empenhoRow.status), coveredArpItemIds: covered }
				: null,
			itemArpItemIds: data.items.map((item) => item.arpItemId),
		})
		if (problems.length > 0) throw new Error(problems.join("; "))

		if (empenhoRow) {
			const cnpj = await supplierCnpjFor(empenhoRow.favorecido_cnpj, covered)
			if (cnpj) {
				const sicaf = await checkSupplierSicaf(cnpj)
				sicafStatus = `${sicaf.status}: ${sicaf.detail} (CNPJ ${cnpj}, verificado na emissão)`
				if (sicaf.status !== "regular" && !data.sicafAcknowledged) {
					throw new Error(`Fornecedor ${cnpj} com situação "${sicaf.detail}" no SICAF — confirme explicitamente para emitir mesmo assim`)
				}
			}
		}

		const { data: order, error } = await proc
			.from("supply_order")
			.insert({
				empenho_id: data.empenhoId ?? null,
				kitchen_id: data.kitchenId,
				number: data.number?.trim() || null,
				sent_at: new Date().toISOString().substring(0, 10),
				expected_delivery: data.expectedDelivery,
				status: "sent",
				sicaf_status: sicafStatus,
				sicaf_ack_by: data.sicafAcknowledged ? userId : null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !order) throw new Error(`Erro ao emitir OF: ${error?.message}`)

		// O MRP conta como "em trânsito" só o item que tem purchase_item_id: OF
		// emitida pela tela gravava apenas arp_item_id, e o trânsito saía ZERO.
		// O elo entre os dois é o CATMAT; ambíguo (mais de um item de compra com
		// o mesmo código) fica nulo em vez de chutar.
		const resolvedPurchaseItems = await resolvePurchaseItemsByArpItem(data.items.map((item) => item.arpItemId).filter((id): id is string => Boolean(id)))

		const { error: itemsError } = await proc.from("supply_order_item").insert(
			data.items.map((item) => ({
				supply_order_id: order.id,
				arp_item_id: item.arpItemId ?? null,
				purchase_item_id: item.purchaseItemId ?? (item.arpItemId ? (resolvedPurchaseItems.get(item.arpItemId) ?? null) : null),
				ordered_qty: item.orderedQty,
				unit_price: item.unitPrice ?? null,
			}))
		)
		if (itemsError) {
			const { error: undoError } = await proc.from("supply_order").delete().eq("id", order.id)
			if (undoError) throw new Error(`Erro nos itens da OF (${itemsError.message}) e ao desfazer a OF (${undoError.message})`)
			// O trigger do teto (valor vigente, empenho anulado, OF sem preço) já diz o que fazer.
			const isGate = /excede|anulado|preço/.test(itemsError.message)
			throw new Error(isGate ? itemsError.message : `Erro nos itens da OF: ${itemsError.message}`)
		}
		return { supplyOrderId: order.id as string, awaitingEmpenho: data.empenhoId == null }
	})

/**
 * Vincula a NE a uma OF emitida aguardando empenho — a ação da pendência "regularize a NE". As
 * mesmas regras da emissão (unidade compradora, item coberto, empenho ativo) e o teto pelo valor
 * vigente, conferido pelo trigger do banco no momento do vínculo.
 */
export const linkSupplyOrderEmpenhoFn = createServerFn({ method: "POST" })
	.validator(z.object({ supplyOrderId: z.uuid(), empenhoId: z.uuid() }))
	.handler(async ({ data }): Promise<void> => {
		await requireAuth()
		const { data: order, error: orderError } = await procurement()
			.from("supply_order")
			.select("kitchen_id, empenho_id, status")
			.eq("id", data.supplyOrderId)
			.maybeSingle()
		if (orderError) throw new Error(`Erro ao buscar a OF: ${orderError.message}`)
		if (!order) throw new Error("OF não encontrada")
		await requireStorageForKitchen(2, Number(order.kitchen_id))
		if (order.empenho_id != null) throw new Error("A OF já tem empenho vinculado")
		if (order.status === "cancelled") throw new Error("OF cancelada não recebe empenho")

		const finance = getServerClient("finance") as unknown as LooseClient
		const { data: empenhoRow, error: empenhoError } = await finance
			.from("empenho")
			.select("arp_item_id, unit_id, status")
			.eq("id", data.empenhoId)
			.maybeSingle()
		if (empenhoError) throw new Error(`Erro ao conferir o empenho: ${empenhoError.message}`)
		if (!empenhoRow) throw new Error("Empenho não encontrado")
		const { data: kitchenRow, error: kitchenError } = await (getServerClient("kitchen") as unknown as LooseClient)
			.from("kitchen")
			.select("unit_id, purchase_unit_id")
			.eq("id", order.kitchen_id)
			.maybeSingle()
		if (kitchenError) throw new Error(`Erro ao conferir a cozinha: ${kitchenError.message}`)
		const { data: items, error: itemsError } = await procurement().from("supply_order_item").select("arp_item_id").eq("supply_order_id", data.supplyOrderId)
		if (itemsError) throw new Error(`Erro ao ler os itens da OF: ${itemsError.message}`)

		const problems = supplyOrderLinkProblems({
			kitchenPurchaseUnitId: resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null }),
			empenho: {
				unitId: empenhoRow.unit_id == null ? null : Number(empenhoRow.unit_id),
				status: String(empenhoRow.status),
				coveredArpItemIds: await coveredArpItemIds(data.empenhoId, empenhoRow.arp_item_id),
			},
			itemArpItemIds: (items ?? []).map((item: { arp_item_id: string | null }) => item.arp_item_id),
		})
		if (problems.length > 0) throw new Error(problems.join("; "))

		const { error } = await procurement()
			.from("supply_order")
			.update({ empenho_id: data.empenhoId, updated_at: new Date().toISOString() })
			.eq("id", data.supplyOrderId)
			.is("empenho_id", null)
		if (error) throw new Error(/excede|anulado|preço/.test(error.message) ? error.message : `Erro ao vincular o empenho: ${error.message}`)
	})

/** Empenhos ativos da unidade da cozinha (para emitir OF). */
export const listEmpenhosForKitchenFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const kitchenDb = getServerClient("kitchen") as unknown as LooseClient
		const finance = getServerClient("finance") as unknown as LooseClient

		const { data: kitchenRow } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).single()
		// Mesma regra que `createSupplyOrderFn` confere na emissão: o que se lista aqui
		// é exatamente o que se pode usar lá.
		const unitId = resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null })
		if (unitId == null) return []

		const { data: empenhos, error } = await finance
			.from("empenho")
			.select("id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total, arp_item_id, favorecido_nome")
			.eq("unit_id", unitId)
			.eq("status", "ativo")
			.order("data_empenho", { ascending: false })
			.limit(100)
		if (error) throw new Error(`Erro ao listar empenhos: ${error.message}`)
		const list = empenhos ?? []

		// fornecedor vem da ARP (ou do favorecido, na NE sem ata) — query separada: embed cross-schema
		// (finance → procurement) não resolve no PostgREST (pego pelo E2E)
		const arpItemIds = [...new Set(list.map((e: { arp_item_id: string | null }) => e.arp_item_id).filter(Boolean))]
		const supplierByArpItem = new Map<string, { ni_fornecedor: string | null; nome_fornecedor: string | null }>()
		if (arpItemIds.length > 0) {
			const { data: arpItems } = await procurement().from("procurement_arp_item").select("id, ni_fornecedor, nome_fornecedor").in("id", arpItemIds)
			for (const item of arpItems ?? []) supplierByArpItem.set(item.id, item)
		}
		return list.map((e: { arp_item_id: string | null }) => ({ ...e, arp_item: e.arp_item_id ? (supplierByArpItem.get(e.arp_item_id) ?? null) : null }))
	})

export const cancelSupplyOrderFn = createServerFn({ method: "POST" })
	.validator(z.object({ supplyOrderId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: order } = await procurement().from("supply_order").select("kitchen_id").eq("id", data.supplyOrderId).maybeSingle()
		if (!order) throw new Error("OF não encontrada")
		await requireStorageForKitchen(2, Number(order.kitchen_id))
		const { error } = await procurement()
			.from("supply_order")
			.update({ status: "cancelled", updated_at: new Date().toISOString() })
			.eq("id", data.supplyOrderId)
			.in("status", ["draft", "sent"])
		if (error) throw new Error(`Erro ao cancelar OF: ${error.message}`)
	})
