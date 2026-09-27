/**
 * @module empenho-document.fn
 * Nota de empenho como documento com itens (change `sisub-flexible-expense-execution`, D3/D4):
 * NE criada a partir da contratação de origem ou da ARP, com um ou mais itens; e o REGISTRO
 * RÁPIDO — o mínimo (número, data, valor, favorecido) para quem precisa da NE no próprio lugar
 * (OF, recebimento, liquidação) e ela ainda não está no sistema. O import do SIAFI completa esse
 * registro pelo número depois, sem duplicar (`siafi_integration.apply_document_row`).
 *
 * Toda NE nova chama `siafi_integration.relink_waiting_rows`: a NS importada antes dela vira
 * liquidação sem nova ação.
 *
 * CLIENT: getDb via `insertPreparedEmpenho` (NE + itens numa transação) e getServerClient
 *   (leituras, registro rápido).
 * AUTH: `unit` nível 2 na unidade; o registro rápido aceita também `storage` nível 2 na cozinha
 *   que compra por aquela unidade (o almoxarife que monta a OF).
 * TABLES: finance.empenho, finance.empenho_item, procurement.procurement_arp(_item), procurement.acquisition.
 * @domain core
 * @migration 20260926214000_acquisition_origin
 */

import { EMPENHO_TYPES, normalizeEmpenhoNumber, resolvePurchaseUnitId } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import {
	type CreatedEmpenho,
	completeEmpenhoRegistration,
	empenhoAuditTarget,
	insertPreparedEmpenho,
	prepareEmpenhoRegistration,
	relinkWaitingRows,
} from "@/lib/empenho-registration.server"
import { normalizeDocument } from "@/lib/expense-execution"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

export type { CreatedEmpenho } from "@/lib/empenho-registration.server"

const finance = () => getServerClient("finance")
const procurement = () => getServerClient("procurement")
const kitchenDb = () => getServerClient("kitchen")

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const EmpenhoItemSchema = z.object({
	arpItemId: z.uuid().nullable().optional(),
	purchaseItemId: z.uuid().nullable().optional(),
	description: z.string().max(500).nullable().optional(),
	quantity: z.number().positive().nullable().optional(),
	unit: z.string().max(40).nullable().optional(),
	unitPrice: z.number().nonnegative().nullable().optional(),
	value: z.number().nonnegative(),
})

/**
 * Registra a NE com itens — a partir da contratação (com ou sem ARP) ou da ARP.
 *
 * O valor total é a soma dos itens. O núcleo (`empenho-registration.server`) é o mesmo do painel da
 * ARP (`createEmpenhoFn`). A conferência NE × ARP devolve avisos: a NE já existe no SIAFI, e o
 * sisub registra o fato.
 */
export const createEmpenhoWithItemsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			numeroEmpenho: z.string().trim().min(1, "Número do empenho obrigatório").max(30),
			dataEmpenho: z.string().regex(ISO_DATE, "Data inválida (YYYY-MM-DD)"),
			tipo: z.enum(EMPENHO_TYPES).nullable().optional(),
			acquisitionId: z.uuid().nullable().optional(),
			favorecidoCnpj: z.string().nullable().optional(),
			favorecidoNome: z.string().max(200).nullable().optional(),
			nd: z
				.string()
				.regex(/^\d{6,8}$/)
				.nullable()
				.optional(),
			ptres: z.string().max(20).nullable().optional(),
			fonte: z.string().max(20).nullable().optional(),
			ugEmitente: z.string().max(20).nullable().optional(),
			notaLancamento: z.string().max(1000).nullable().optional(),
			items: z.array(EmpenhoItemSchema).min(1, "Informe ao menos um item (ou só o valor)").max(200),
		})
	)
	.handler(async ({ data }): Promise<CreatedEmpenho> => {
		const ctx = await requireUnitScope(2, data.unitId)
		const prepared = await prepareEmpenhoRegistration(data)
		const empenhoId = await withSensitiveAudit(
			"createEmpenhoWithItemsFn",
			ctx,
			() => insertPreparedEmpenho("createEmpenhoWithItemsFn", ctx, prepared),
			(id) => empenhoAuditTarget(prepared, id)
		)
		return completeEmpenhoRegistration(ctx, prepared, empenhoId)
	})

export interface QuickEmpenhoResult {
	empenhoId: string
	numeroEmpenho: string
	valorTotal: number
	/** false = a NE já estava no sistema (o registro rápido não duplica). */
	created: boolean
	/** A NE já existia com outro valor: a diferença aparece na conciliação. */
	valueDiffers: boolean
	relinked: number
}

/**
 * Registro rápido da NE que falta: número, data, valor e favorecido. Idempotente pelo número —
 * se a NE já está no sistema (importada ou registrada por outro), devolve a existente. Fica
 * `origem = 'manual'` e sem contratação de origem (pendência "vincular"), usável na OF e na
 * liquidação. O import do SIAFI completa a classificação pelo número.
 *
 * `kitchenId` (em vez de `unitId`): quem registra é o almoxarife com `storage:2` na cozinha, e a
 * unidade é a COMPRADORA da cozinha — a mesma que `createSupplyOrderFn` confere.
 */
export const quickRegisterEmpenhoFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				unitId: z.number().int().positive().optional(),
				kitchenId: z.number().int().positive().optional(),
				numeroEmpenho: z.string().trim().min(1, "Número do empenho obrigatório").max(30),
				dataEmpenho: z.string().regex(ISO_DATE, "Data inválida (YYYY-MM-DD)"),
				valor: z.number().positive("Valor deve ser positivo"),
				favorecidoCnpj: z.string().nullable().optional(),
				favorecidoNome: z.string().max(200).nullable().optional(),
				acquisitionId: z.uuid().nullable().optional(),
			})
			.refine((v) => v.unitId != null || v.kitchenId != null, { message: "Informe a unidade ou a cozinha", path: ["unitId"] })
	)
	.handler(async ({ data }): Promise<QuickEmpenhoResult> => {
		let unitId: number
		const ctx =
			data.kitchenId != null
				? await requireStorageForKitchen(2, data.kitchenId)
				: // biome-ignore lint/style/noNonNullAssertion: o refine garante unitId sem kitchenId
					await requireUnitScope(2, data.unitId!)
		if (data.kitchenId != null) {
			const { data: kitchenRow, error } = await kitchenDb().from("kitchen").select("unit_id, purchase_unit_id").eq("id", data.kitchenId).maybeSingle()
			if (error) throw new Error(`Erro ao conferir a cozinha: ${error.message}`)
			const purchaseUnit = resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null })
			if (purchaseUnit == null) throw new Error("A cozinha não tem unidade compradora")
			if (data.unitId != null && data.unitId !== purchaseUnit) throw new Error("A NE só pode ser da unidade compradora desta cozinha")
			unitId = purchaseUnit
		} else {
			unitId = data.unitId as number
		}

		const numero = normalizeEmpenhoNumber(data.numeroEmpenho)
		const fin = finance()
		const { data: existing, error: lookupError } = await fin
			.from("empenho")
			.select("id, valor_total")
			.eq("unit_id", unitId)
			.eq("numero_empenho", numero)
			.maybeSingle()
		if (lookupError) throw new Error(`Erro ao procurar o empenho: ${lookupError.message}`)
		if (existing) {
			return {
				empenhoId: existing.id,
				numeroEmpenho: numero,
				valorTotal: Number(existing.valor_total),
				created: false,
				valueDiffers: Math.abs(Number(existing.valor_total) - data.valor) > 0.009,
				relinked: 0,
			}
		}

		if (data.acquisitionId) {
			const { data: acq, error } = await procurement().from("acquisition").select("unit_id").eq("id", data.acquisitionId).is("deleted_at", null).maybeSingle()
			if (error) throw new Error(`Erro ao conferir a contratação: ${error.message}`)
			if (!acq || Number(acq.unit_id) !== unitId) throw new Error("A contratação de origem não pertence a esta unidade")
		}

		const cnpj = normalizeDocument(data.favorecidoCnpj)
		const created = await withSensitiveAudit(
			"quickRegisterEmpenhoFn",
			ctx,
			async (): Promise<{ id: string }> => {
				// Um insert só (uma transação PostgREST): o item único nasce no commit, pelo trigger
				// `empenho_ensure_item`, com o valor do cabeçalho.
				const { data: row, error } = await fin
					.from("empenho")
					.insert({
						unit_id: unitId,
						numero_empenho: numero,
						data_empenho: data.dataEmpenho,
						valor_total: data.valor,
						favorecido_cnpj: cnpj?.length === 14 ? cnpj : null,
						favorecido_nome: data.favorecidoNome?.trim() || null,
						acquisition_id: data.acquisitionId ?? null,
						exercicio: Number(data.dataEmpenho.slice(0, 4)),
						status: "ativo",
						origem: "manual",
						created_by: ctx.userId,
					})
					.select("id")
					.single()
				if (error) {
					if (error.code === "23505") throw new Error(`O empenho ${numero} acabou de ser registrado por outra pessoa: busque-o de novo`)
					throw new Error(`Erro ao registrar o empenho: ${error.message}`)
				}
				return { id: row.id as string }
			},
			(row) => ({ empenhoId: row.id, unitId, numeroEmpenho: numero, valorTotal: data.valor, kitchenId: data.kitchenId ?? null })
		)

		const relinked = await relinkWaitingRows(unitId, ctx.userId)
		return { empenhoId: created.id, numeroEmpenho: numero, valorTotal: data.valor, created: true, valueDiffers: false, relinked }
	})

export interface EmpenhoItemView {
	id: string
	position: number
	arpItemId: string | null
	arpItemNumber: number | null
	purchaseItemId: string | null
	description: string | null
	quantity: number | null
	unit: string | null
	unitPrice: number | null
	value: number
}

/** Itens de uma NE, com o número do item da ARP quando houver. */
export const fetchEmpenhoItemsFn = createServerFn({ method: "GET" })
	.validator(z.object({ empenhoId: z.uuid() }))
	.handler(async ({ data }): Promise<EmpenhoItemView[]> => {
		await requireAuth()
		const fin = finance()
		const { data: empenho, error: lookupError } = await fin.from("empenho").select("unit_id").eq("id", data.empenhoId).maybeSingle()
		if (lookupError) throw new Error(`Erro ao buscar o empenho: ${lookupError.message}`)
		if (!empenho) throw new Error("Empenho não encontrado")
		await requireUnitScope(1, Number(empenho.unit_id))

		const { data: rows, error } = await fin
			.from("empenho_item")
			.select("id, position, arp_item_id, purchase_item_id, description, quantity, unit, unit_price, value")
			.eq("empenho_id", data.empenhoId)
			.order("position")
		if (error) throw new Error(`Erro ao ler os itens do empenho: ${error.message}`)
		const items = rows ?? []
		const arpIds = [...new Set(items.map((item) => item.arp_item_id).filter((id): id is string => Boolean(id)))]
		const numberByArpItem = new Map<string, number | null>()
		if (arpIds.length > 0) {
			const { data: arpRows, error: arpError } = await procurement().from("procurement_arp_item").select("id, numero_item").in("id", arpIds)
			if (arpError) throw new Error(`Erro ao ler os itens da ARP: ${arpError.message}`)
			for (const row of arpRows ?? []) numberByArpItem.set(row.id, row.numero_item)
		}
		return items.map((item) => ({
			id: item.id,
			position: item.position,
			arpItemId: item.arp_item_id,
			arpItemNumber: item.arp_item_id ? (numberByArpItem.get(item.arp_item_id) ?? null) : null,
			purchaseItemId: item.purchase_item_id,
			description: item.description,
			quantity: item.quantity == null ? null : Number(item.quantity),
			unit: item.unit,
			unitPrice: item.unit_price == null ? null : Number(item.unit_price),
			value: Number(item.value),
		}))
	})
