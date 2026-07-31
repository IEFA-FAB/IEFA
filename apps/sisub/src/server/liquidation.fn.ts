/**
 * @module liquidation.fn
 * Liquidação (NS) e pagamento (OB) — 2ª e 3ª fases da despesa (Lei 4.320).
 * A liquidação é o elo entre o recebimento definitivo (físico, MCASP) e o
 * empenho. NUNCA é criada automaticamente: o sistema apenas SUGERE o valor a
 * partir do recebimento; liquidar é ato do ordenador e a NS nasce no SIAFI.
 * CLIENT: getServerClient (service role, schemas finance/inventory).
 * AUTH: `unit` escopado — 1 leitura, 2 lançar.
 * TABLES: finance.liquidacao, finance.pagamento, inventory.goods_receipt(_item).
 * @domain core
 * @migration 20260731150000_finance_liquidacao_pagamento
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const finance = () => getServerClient("finance") as unknown as LooseClient
const inventory = () => getServerClient("inventory") as unknown as LooseClient

export interface LiquidacaoRow {
	id: string
	numero_ns: string
	data: string
	valor: number
	empenho_id: string
	goods_receipt_id: string | null
	origem: string
	pago: number
	a_pagar: number
	dias_em_aberto: number | null
}

export const listLiquidacoesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<LiquidacaoRow[]> => {
		await requireUnitScope(1, data.unitId)
		const fin = finance()

		const { data: rows, error } = await fin
			.from("liquidacao")
			.select("id, numero_ns, data, valor, empenho_id, goods_receipt_id, origem")
			.eq("unit_id", data.unitId)
			.order("data", { ascending: false })
			.limit(200)
		if (error) throw new Error(`Erro ao listar liquidações: ${error.message}`)
		const liquidacoes = rows ?? []
		if (liquidacoes.length === 0) return []

		const { data: pagamentos } = await fin
			.from("pagamento")
			.select("liquidacao_id, valor")
			.in(
				"liquidacao_id",
				liquidacoes.map((l: { id: string }) => l.id)
			)
		const pagoByLiquidacao = new Map<string, number>()
		for (const pag of pagamentos ?? []) {
			pagoByLiquidacao.set(pag.liquidacao_id, (pagoByLiquidacao.get(pag.liquidacao_id) ?? 0) + Number(pag.valor))
		}

		const today = Date.now()
		return liquidacoes.map((row: { id: string; valor: number; data: string }) => {
			const pago = Number((pagoByLiquidacao.get(row.id) ?? 0).toFixed(2))
			const aPagar = Number((Number(row.valor) - pago).toFixed(2))
			return {
				...(row as unknown as LiquidacaoRow),
				valor: Number(row.valor),
				pago,
				a_pagar: aPagar,
				dias_em_aberto: aPagar > 0 ? Math.floor((today - Date.parse(`${row.data}T00:00:00Z`)) / 86_400_000) : null,
			}
		})
	})

/**
 * Valor sugerido para liquidar um recebimento definitivo: Σ (quantidade
 * recebida × custo unitário). Sugestão — o número da NS vem do SIAFI.
 */
export const suggestLiquidationFromReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt } = await inv
			.from("goods_receipt")
			.select("id, kitchen_id, status, definitive_at, empenho_id, nfe_document_id, liquidacao_id")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")

		const core = getServerClient("core") as unknown as LooseClient
		const { data: kitchenRow } = await core.from("kitchen").select("unit_id, purchase_unit_id").eq("id", receipt.kitchen_id).single()
		const unitId = Number(kitchenRow?.purchase_unit_id ?? kitchenRow?.unit_id)
		await requireUnitScope(1, unitId)

		const { data: items } = await inv.from("goods_receipt_item").select("received_qty_base, unit_cost").eq("receipt_id", data.receiptId)
		const valor = Number(
			(items ?? [])
				.reduce(
					(acc: number, item: { received_qty_base: number; unit_cost: number | null }) => acc + Number(item.received_qty_base) * Number(item.unit_cost ?? 0),
					0
				)
				.toFixed(2)
		)

		return {
			unitId,
			valorSugerido: valor,
			empenhoId: receipt.empenho_id as string | null,
			nfeDocumentId: receipt.nfe_document_id as string | null,
			jaLiquidado: receipt.liquidacao_id != null,
			definitivo: receipt.definitive_at != null,
		}
	})

/** Registra a NS. O banco garante que não excede o empenho vigente. */
export const createLiquidacaoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			empenhoId: z.string().uuid(),
			numeroNs: z.string().min(1),
			data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			valor: z.number().positive(),
			goodsReceiptId: z.string().uuid().optional(),
			nfeDocumentId: z.string().uuid().optional(),
			observacao: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireUnitScope(2, data.unitId)
		const fin = finance()

		const { data: liquidacao, error } = await fin
			.from("liquidacao")
			.insert({
				unit_id: data.unitId,
				empenho_id: data.empenhoId,
				numero_ns: data.numeroNs.trim().toUpperCase(),
				data: data.data,
				valor: data.valor,
				competencia: `${data.data.substring(0, 7)}-01`,
				goods_receipt_id: data.goodsReceiptId ?? null,
				nfe_document_id: data.nfeDocumentId ?? null,
				observacao: data.observacao?.trim() || null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !liquidacao) {
			if (error?.code === "23505") throw new Error(`NS "${data.numeroNs}" já registrada nesta unidade`)
			if (error?.message?.includes("excede o empenho")) throw new Error(error.message)
			throw new Error(`Erro ao registrar liquidação: ${error?.message}`)
		}

		// espelha o vínculo no recebimento (o estoque passa a saber que liquidou)
		if (data.goodsReceiptId) {
			await inventory().from("goods_receipt").update({ liquidacao_id: liquidacao.id }).eq("id", data.goodsReceiptId)
		}
		return { liquidacaoId: liquidacao.id as string }
	})

/** Registra a OB. O banco garante que não excede a liquidação. */
export const createPagamentoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			liquidacaoId: z.string().uuid(),
			numeroOb: z.string().min(1),
			data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			valor: z.number().positive(),
			banco: z.string().optional(),
			agencia: z.string().optional(),
			conta: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireUnitScope(2, data.unitId)
		const { data: pagamento, error } = await finance()
			.from("pagamento")
			.insert({
				unit_id: data.unitId,
				liquidacao_id: data.liquidacaoId,
				numero_ob: data.numeroOb.trim().toUpperCase(),
				data: data.data,
				valor: data.valor,
				banco: data.banco?.trim() || null,
				agencia: data.agencia?.trim() || null,
				conta: data.conta?.trim() || null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !pagamento) {
			if (error?.code === "23505") throw new Error(`OB "${data.numeroOb}" já registrada nesta unidade`)
			if (error?.message?.includes("excede a liquidação")) throw new Error(error.message)
			throw new Error(`Erro ao registrar pagamento: ${error?.message}`)
		}
		return { pagamentoId: pagamento.id as string }
	})

/** Contas a pagar + prazo médio por fornecedor (liquidação → pagamento). */
export const fetchPaymentPanelFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireUnitScope(1, data.unitId)
		const fin = finance()

		const liquidacoes = await listLiquidacoesFn({ data: { unitId: data.unitId } })
		const empenhoIds = [...new Set(liquidacoes.map((l) => l.empenho_id))]
		const supplierByEmpenho = new Map<string, string>()
		if (empenhoIds.length > 0) {
			const { data: empenhos } = await fin.from("empenho").select("id, favorecido_nome, favorecido_cnpj").in("id", empenhoIds)
			for (const empenho of empenhos ?? []) {
				supplierByEmpenho.set(empenho.id, empenho.favorecido_nome ?? empenho.favorecido_cnpj ?? "(sem favorecido)")
			}
		}

		// prazo médio: liquidação → primeiro pagamento, por fornecedor
		const { data: pagamentos } = await fin.from("pagamento").select("liquidacao_id, data").eq("unit_id", data.unitId).limit(500)
		const firstPaymentByLiquidacao = new Map<string, string>()
		for (const pag of pagamentos ?? []) {
			const current = firstPaymentByLiquidacao.get(pag.liquidacao_id)
			if (!current || pag.data < current) firstPaymentByLiquidacao.set(pag.liquidacao_id, pag.data)
		}

		const daysBySupplier = new Map<string, number[]>()
		for (const liquidacao of liquidacoes) {
			const paidAt = firstPaymentByLiquidacao.get(liquidacao.id)
			if (!paidAt) continue
			const supplier = supplierByEmpenho.get(liquidacao.empenho_id) ?? "(sem favorecido)"
			const days = Math.round((Date.parse(`${paidAt}T00:00:00Z`) - Date.parse(`${liquidacao.data}T00:00:00Z`)) / 86_400_000)
			const list = daysBySupplier.get(supplier) ?? []
			list.push(days)
			daysBySupplier.set(supplier, list)
		}

		return {
			openLiquidations: liquidacoes
				.filter((l) => l.a_pagar > 0)
				.map((l) => ({ ...l, fornecedor: supplierByEmpenho.get(l.empenho_id) ?? "(sem favorecido)" }))
				.sort((a, b) => (b.dias_em_aberto ?? 0) - (a.dias_em_aberto ?? 0)),
			averageDays: [...daysBySupplier.entries()]
				.map(([fornecedor, days]) => ({
					fornecedor,
					dias: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
					amostras: days.length,
				}))
				.sort((a, b) => b.dias - a.dias),
		}
	})
