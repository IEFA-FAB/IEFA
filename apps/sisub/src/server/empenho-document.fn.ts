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
 * CLIENT: getDb (NE + itens numa transação) e getServerClient (leituras, registro rápido).
 * AUTH: `unit` nível 2 na unidade; o registro rápido aceita também `storage` nível 2 na cozinha
 *   que compra por aquela unidade (o almoxarife que monta a OF).
 * TABLES: finance.empenho, finance.empenho_item, procurement.procurement_arp(_item), procurement.acquisition.
 * @domain core
 * @migration 20260926214000_acquisition_origin
 */

import {
	type ArpConformityWarning,
	type ArpItemFacts,
	checkEmpenhoAgainstArp,
	EMPENHO_TYPES,
	empenhoItemProblems,
	normalizeEmpenhoNumber,
	resolveItemValue,
	resolvePurchaseUnitId,
	sumEmpenhoItems,
} from "@iefa/sisub-domain"
import { describeDriverError, unwrapPgError } from "@iefa/sisub-domain/utils"
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { resolveSaldoOficial } from "@/lib/arp-balance"
import { loadLocalCommitments } from "@/lib/arp-commitments.server"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { normalizeDocument } from "@/lib/expense-execution"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

const finance = () => getServerClient("finance")
const procurement = () => getServerClient("procurement")
const kitchenDb = () => getServerClient("kitchen")
const siafi = () => getServerClient("siafi_integration")

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

export interface CreatedEmpenho {
	empenhoId: string
	numeroEmpenho: string
	valorTotal: number
	/** Avisos da conferência NE × ARP (preço, saldo, vigência): registrados, não recusados. */
	warnings: ArpConformityWarning[]
	/** NS/OB estacionadas que a NE nova religou. */
	relinked: number
}

/**
 * Religa as NS/OB estacionadas da unidade — a MESMA função que o import de lote chama. Falha
 * aqui não desfaz a NE: a linha continua estacionada e a próxima gravação tenta de novo.
 */
async function relinkWaitingRows(unitId: number, actorId: string): Promise<number> {
	try {
		const { data, error } = await siafi().rpc("relink_waiting_rows", { p_unit_id: unitId, p_actor: actorId })
		if (error) throw new Error(error.message)
		const row = Array.isArray(data) ? data[0] : data
		return Number(row?.relinked ?? 0)
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: server-side — a religação é best-effort e fica no log
		console.error("[relinkWaitingRows]", error instanceof Error ? error.message : error)
		return 0
	}
}

/**
 * Registra a NE com itens — a partir da contratação (com ou sem ARP) ou da ARP.
 *
 * O valor total é a soma dos itens. Com um item só, as colunas antigas do empenho espelham o item
 * (trigger do banco), e a tela antiga do painel da ARP continua lendo. A conferência NE × ARP
 * devolve avisos: a NE já existe no SIAFI, e o sisub registra o fato.
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
		const problems = empenhoItemProblems(data.items)
		if (problems.length > 0) throw new Error(problems.map((p) => p.message).join("; "))

		const numero = normalizeEmpenhoNumber(data.numeroEmpenho)
		const proc = procurement()

		// Contratação da mesma unidade — a unidade sai da LINHA, não do corpo.
		let acquisitionId = data.acquisitionId ?? null
		let acquisitionSupplier: { cnpj: string | null; name: string | null } | null = null
		if (acquisitionId) {
			const { data: acq, error } = await proc
				.from("acquisition")
				.select("unit_id, supplier_cnpj, supplier_name, nd")
				.eq("id", acquisitionId)
				.is("deleted_at", null)
				.maybeSingle()
			if (error) throw new Error(`Erro ao conferir a contratação: ${error.message}`)
			if (!acq || Number(acq.unit_id) !== data.unitId) throw new Error("A contratação de origem não pertence a esta unidade")
			acquisitionSupplier = { cnpj: acq.supplier_cnpj, name: acq.supplier_name }
		}

		// Itens de ARP: todos da unidade; a contratação da ARP vira a da NE quando ela não veio.
		const arpItemIds = [...new Set(data.items.map((item) => item.arpItemId).filter((id): id is string => Boolean(id)))]
		const arpItems = new Map<string, ArpItemFacts>()
		const suppliers = new Set<string>()
		let supplierName: string | null = null
		let arpSynced = true
		if (arpItemIds.length > 0) {
			const { data: itemRows, error: itemError } = await proc
				.from("procurement_arp_item")
				.select(
					"id, arp_id, numero_item, descricao_item, ni_fornecedor, nome_fornecedor, valor_unitario, quantidade_homologada, quantidade_empenhada, saldo_empenho, medida_catmat"
				)
				.in("id", arpItemIds)
			if (itemError) throw new Error(`Erro ao conferir os itens da ARP: ${itemError.message}`)
			const rows = itemRows ?? []
			if (rows.length !== arpItemIds.length) throw new Error("Item da ARP não encontrado")
			const arpIds = [...new Set(rows.map((row) => row.arp_id))]
			const { data: arpRows, error: arpError } = await proc
				.from("procurement_arp")
				.select("id, unit_id, acquisition_id, data_vigencia_inicio, data_vigencia_fim, last_synced_at, source")
				.in("id", arpIds)
			if (arpError) throw new Error(`Erro ao conferir as ARPs: ${arpError.message}`)
			const arpById = new Map((arpRows ?? []).map((arp) => [arp.id, arp]))
			// Já empenhado AQUI em NEs ativas: numa ARP cadastrada à mão o saldo oficial é o
			// homologado cheio até a primeira sincronização, e sem o local duas NEs passariam do total.
			const committed = await loadLocalCommitments(arpItemIds)
			for (const row of rows) {
				const arp = arpById.get(row.arp_id)
				if (!arp || Number(arp.unit_id) !== data.unitId) throw new Error("O item da ARP informado não pertence a esta unidade")
				if (arp.last_synced_at == null) arpSynced = false
				arpItems.set(row.id, {
					id: row.id,
					numeroItem: row.numero_item,
					description: row.descricao_item,
					unitPrice: row.valor_unitario == null ? null : Number(row.valor_unitario),
					officialBalance: row.quantidade_homologada == null && row.saldo_empenho == null ? null : resolveSaldoOficial(row),
					homologatedQuantity: row.quantidade_homologada == null ? null : Number(row.quantidade_homologada),
					localCommitted: committed.get(row.id)?.quantidade ?? 0,
					validFrom: arp.data_vigencia_inicio,
					validTo: arp.data_vigencia_fim,
				})
				const cnpj = normalizeDocument(row.ni_fornecedor)
				if (cnpj) suppliers.add(cnpj)
				supplierName = supplierName ?? row.nome_fornecedor
			}
			const arpAcquisitions = [...new Set([...arpById.values()].map((arp) => arp.acquisition_id).filter(Boolean))]
			if (!acquisitionId && arpAcquisitions.length === 1) acquisitionId = arpAcquisitions[0] as string
		}

		const warnings = checkEmpenhoAgainstArp({ empenhoDate: data.dataEmpenho, items: data.items, arpItems, arpSynced })

		// Favorecido: o informado; senão o da contratação; senão o fornecedor único dos itens da ARP.
		const favorecidoCnpj =
			normalizeDocument(data.favorecidoCnpj) ?? normalizeDocument(acquisitionSupplier?.cnpj) ?? (suppliers.size === 1 ? ([...suppliers][0] as string) : null)
		// `empenho.favorecido_cnpj` aceita só CNPJ (14 dígitos): CPF de pessoa física fica no nome.
		const favorecidoCnpj14 = favorecidoCnpj?.length === 14 ? favorecidoCnpj : null
		const favorecidoNome = data.favorecidoNome?.trim() || acquisitionSupplier?.name || (suppliers.size <= 1 ? supplierName : null)
		const valorTotal = sumEmpenhoItems(data.items)

		const result = await withSensitiveAudit(
			"createEmpenhoWithItemsFn",
			ctx,
			async () => {
				try {
					return await getDb().transaction(async (tx) => {
						const [header] = await tx.execute<{ id: string }>(sql`
							insert into finance.empenho (
								unit_id, numero_empenho, data_empenho, valor_total, tipo, acquisition_id,
								favorecido_cnpj, favorecido_nome, nd, ptres, fonte, ug_emitente, exercicio,
								nota_lancamento, status, origem, created_by
							) values (
								${data.unitId}, ${numero}, ${data.dataEmpenho}::date, ${valorTotal}, ${data.tipo ?? null}, ${acquisitionId}::uuid,
								${favorecidoCnpj14}, ${favorecidoNome ?? null}, ${data.nd ?? null}, ${data.ptres?.trim() || null}, ${data.fonte?.trim() || null},
								${data.ugEmitente?.trim() || null}, ${Number(data.dataEmpenho.slice(0, 4))},
								${data.notaLancamento?.trim() || null}, 'ativo', 'manual', ${ctx.userId}::uuid
							)
							returning id
						`)
						if (!header) throw new Error("Empenho não retornado após inserção")
						let position = 1
						for (const item of data.items) {
							await tx.execute(sql`
								insert into finance.empenho_item (empenho_id, arp_item_id, purchase_item_id, position, description, quantity, unit, unit_price, value)
								values (
									${header.id}::uuid, ${item.arpItemId ?? null}::uuid, ${item.purchaseItemId ?? null}::uuid, ${position},
									${item.description?.trim() || null}, ${item.quantity ?? null}, ${item.unit?.trim() || null},
									${item.unitPrice ?? null}, ${resolveItemValue(item)}
								)
							`)
							position++
						}
						return header.id
					})
				} catch (error) {
					throw toEmpenhoWriteError(error, numero)
				}
			},
			(empenhoId) => ({ empenhoId, unitId: data.unitId, numeroEmpenho: numero, valorTotal, itens: data.items.length, acquisitionId })
		)

		const relinked = await relinkWaitingRows(data.unitId, ctx.userId)
		return { empenhoId: result, numeroEmpenho: numero, valorTotal, warnings, relinked }
	})

function toEmpenhoWriteError(error: unknown, numero: string): Error {
	const pg = unwrapPgError(error)
	if (pg.code === "23505") return new Error(`O empenho ${numero} já está no sistema: abra-o em Empenhos para completar`)
	if (pg.code === "23514" && pg.message) return new Error(pg.message)
	// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
	console.error("[createEmpenhoWithItemsFn]", describeDriverError(error))
	return new Error("Erro ao registrar a nota de empenho. Tente novamente.")
}

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
