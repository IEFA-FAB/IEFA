/**
 * @module reconciliation.fn
 * Aplicação de lotes NE/NS/OB ao domínio e conciliação SIAFI × sisub (Fase 5).
 *
 * Regra central: a conciliação MOSTRA divergência, nunca decide. Documento
 * novo do SIAFI é criado; documento existente é ENRIQUECIDO (preenche campos
 * ausentes) mas o valor divergente NÃO é sobrescrito em silêncio — vira
 * divergência para o operador resolver explicitamente.
 * CLIENT: getServerClient (service role, schemas finance/siafi_integration).
 * AUTH: `unit` escopado — 1 leitura, 2 aplicar/resolver.
 * @domain core
 * @migration 20260731160000_finance_siafi_reconciliation
 */

import { roundToCents } from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const finance = () => getServerClient("finance") as unknown as LooseClient
const siafi = () => getServerClient("siafi_integration") as unknown as LooseClient

export interface ReconciliationRow {
	documento_tipo: string
	numero_documento: string
	valor_sisub: number | null
	valor_siafi: number | null
	situacao: "apenas_sisub" | "apenas_siafi" | "divergente" | "conciliado"
	diferenca: number
	decisao: string | null
	justificativa: string | null
	decisao_vigente: boolean
	lote_em: string | null
}

/** Ordem de severidade: divergência primeiro, depois faltantes de cada lado. */
const SEVERITY: Record<string, number> = { divergente: 0, apenas_siafi: 1, apenas_sisub: 2, conciliado: 3 }

/** Painel de divergências por documento (decisões vigentes saem da lista ativa). */
export const fetchReconciliationFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), includeResolved: z.boolean().default(false) }))
	.handler(async ({ data }): Promise<ReconciliationRow[]> => {
		await requireUnitScope(1, data.unitId)
		const { data: rows, error } = await finance().from("v_siafi_reconciliation").select("*").eq("unit_id", data.unitId).limit(500)
		if (error) throw new Error(`Erro ao consultar conciliação: ${error.message}`)

		return ((rows ?? []) as ReconciliationRow[])
			.filter((row) => row.situacao !== "conciliado")
			.filter((row) => data.includeResolved || !row.decisao_vigente)
			.sort((a, b) => (SEVERITY[a.situacao] ?? 9) - (SEVERITY[b.situacao] ?? 9) || Math.abs(b.diferenca) - Math.abs(a.diferenca))
	})

/** Recebimento definitivo × liquidação (pendência contábil e diferença de valor). */
export const fetchPhysicalAccountingFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), minDays: z.number().int().default(0) }))
	.handler(async ({ data }) => {
		await requireUnitScope(1, data.unitId)
		const kitchenDb = getServerClient("kitchen") as unknown as LooseClient
		const { data: kitchens } = await kitchenDb.from("kitchen").select("id").or(`unit_id.eq.${data.unitId},purchase_unit_id.eq.${data.unitId}`)
		const kitchenIds = (kitchens ?? []).map((k: { id: number }) => k.id)
		if (kitchenIds.length === 0) return []

		const { data: rows, error } = await finance()
			.from("v_physical_accounting_reconciliation")
			.select("*")
			.in("kitchen_id", kitchenIds)
			.neq("situacao", "conciliado")
			.gte("dias_desde_recebimento", data.minDays)
			.order("dias_desde_recebimento", { ascending: false })
			.limit(200)
		if (error) throw new Error(`Erro ao consultar conciliação físico × contábil: ${error.message}`)
		return rows ?? []
	})

export interface DocumentBatchResult {
	created: number
	enriched: number
	/** NE com valor diferente do registrado, ou NS/OB sem o documento de origem no relatório. */
	divergent: number
	/** Linhas deste lote estacionadas à espera do documento pai (NE da NS, NS da OB). */
	waiting: number
	unlinked: number
	/** Linhas estacionadas (deste e de lotes anteriores) religadas agora. */
	relinked: number
	/** Estacionadas que continuam esperando. */
	stillWaiting: number
}

/**
 * Aplica um lote NE/NS/OB ao domínio, numa transação só (`siafi_integration.apply_document_batch`):
 *
 * - NE nova entra sem contratação de origem (pendência "vincular"), usável na OF e na liquidação;
 *   NE já registrada (registro rápido, manual) é COMPLETADA pelo número na classificação e no
 *   favorecido — o valor nunca é sobrescrito, e a diferença aparece na conciliação;
 * - NS/OB cujo documento pai ainda não está no sistema fica estacionada e é religada sozinha
 *   quando ele chega (por lote ou por registro rápido);
 * - erro de gravação em QUALQUER linha não grava nada: o lote fica `failed` com a mensagem e pode
 *   ser aplicado de novo. Antes, a NE sem item de ARP morria na constraint, o erro era ignorado e
 *   o lote ficava `applied` sem o documento.
 */
export const applyDocumentBatchFn = createServerFn({ method: "POST" })
	.validator(z.object({ batchId: z.uuid() }))
	.handler(async ({ data }): Promise<DocumentBatchResult> => {
		await requireAuth()
		const si = siafi()
		const { data: batch, error: batchError } = await si.from("import_batch").select("unit_id, report_type, status").eq("id", data.batchId).maybeSingle()
		if (batchError) throw new Error(`Erro ao buscar o lote: ${batchError.message}`)
		if (!batch) throw new Error("Lote não encontrado")
		const ctx = await requireUnitScope(2, Number(batch.unit_id))
		if (batch.report_type === "credito") throw new Error("Use a aplicação de crédito para este lote")
		if (batch.status === "applied") throw new Error("Lote já aplicado")

		return withSensitiveAudit(
			"applyDocumentBatchFn",
			ctx,
			async (): Promise<DocumentBatchResult> => {
				const { data: result, error } = await si.rpc("apply_document_batch", { p_batch_id: data.batchId, p_actor: ctx.userId })
				if (error) {
					// A transação do lote já foi desfeita; marcar `failed` é uma escrita à parte, e um
					// lote aplicado por outro clique no meio do caminho não pode virar `failed`.
					const { error: markError } = await si
						.from("import_batch")
						.update({ status: "failed", error_message: error.message })
						.eq("id", data.batchId)
						.neq("status", "applied")
					if (markError) throw new Error(`Lote não aplicado (${error.message}) e não marcado como falho (${markError.message})`)
					throw new Error(`Lote não aplicado: ${error.message}. Nada foi gravado; corrija e aplique de novo.`)
				}
				const summary = (result ?? {}) as Partial<DocumentBatchResult>
				return {
					created: Number(summary.created ?? 0),
					enriched: Number(summary.enriched ?? 0),
					divergent: Number(summary.divergent ?? 0),
					waiting: Number(summary.waiting ?? 0),
					unlinked: Number(summary.unlinked ?? 0),
					relinked: Number(summary.relinked ?? 0),
					stillWaiting: Number(summary.stillWaiting ?? 0),
				}
			},
			// O lote é o alvo: as linhas que ele criou e enriqueceu estão em
			// `siafi_integration.import_row`, apontando para cada documento aplicado.
			(result) => ({ batchId: data.batchId, unitId: Number(batch.unit_id), reportType: batch.report_type, ...result })
		)
	})

export interface WaitingDocument {
	rowId: string
	reportType: "ns" | "ob"
	numero: string
	parentNumber: string | null
	valor: number | null
	message: string | null
	batchCreatedAt: string
}

/** NS e OB estacionadas da unidade, à espera do documento pai — para a pendência e a tela do SIAFI. */
export const listWaitingDocumentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<WaitingDocument[]> => {
		await requireUnitScope(1, data.unitId)
		const si = siafi()
		const { data: batches, error: batchError } = await si
			.from("import_batch")
			.select("id, report_type, created_at")
			.eq("unit_id", data.unitId)
			.in("report_type", ["ns", "ob"])
			.order("created_at", { ascending: false })
			.limit(200)
		if (batchError) throw new Error(`Erro ao listar lotes: ${batchError.message}`)
		const byBatch = new Map(((batches ?? []) as Array<{ id: string; report_type: "ns" | "ob"; created_at: string }>).map((b) => [b.id, b]))
		if (byBatch.size === 0) return []
		const { data: rows, error } = await si
			.from("import_row")
			.select("id, batch_id, parsed, parse_error")
			.in("batch_id", [...byBatch.keys()])
			.eq("parse_status", "waiting_parent")
			.limit(500)
		if (error) throw new Error(`Erro ao listar documentos estacionados: ${error.message}`)
		return ((rows ?? []) as Array<{ id: string; batch_id: string; parsed: Record<string, unknown> | null; parse_error: string | null }>).map((row) => {
			const batch = byBatch.get(row.batch_id) as { report_type: "ns" | "ob"; created_at: string }
			const parsed = row.parsed ?? {}
			const isNs = batch.report_type === "ns"
			const parent = isNs ? (parsed.ne_origem ?? parsed.numero_ne) : (parsed.ns_origem ?? parsed.numero_ns)
			return {
				rowId: row.id,
				reportType: batch.report_type,
				numero: String((isNs ? parsed.numero_ns : parsed.numero_ob) ?? ""),
				parentNumber: parent == null ? null : String(parent).trim().toUpperCase(),
				valor: parsed.valor == null ? null : Number(parsed.valor),
				message: row.parse_error,
				batchCreatedAt: batch.created_at,
			}
		})
	})

/** Resolução explícita: adotar o valor do SIAFI ou manter o local com justificativa. */
export const resolveDivergenceFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			documentoTipo: z.enum(["ne", "ns", "ob"]),
			numeroDocumento: z.string().min(1),
			decisao: z.enum(["adotado_siafi", "mantido_local"]),
			justificativa: z.string().optional(),
			valorSisub: z.number().nullable().optional(),
			valorSiafi: z.number().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const { userId } = ctx
		if (data.decisao === "mantido_local" && !data.justificativa?.trim()) {
			throw new Error("Manter o valor local exige justificativa")
		}
		const fin = finance()

		return withSensitiveAudit(
			"resolveDivergenceFn",
			ctx,
			async () => {
				// adotar o SIAFI num empenho entra como EVENTO (o valor nunca é editado)
				if (data.decisao === "adotado_siafi" && data.documentoTipo === "ne" && data.valorSiafi != null && data.valorSisub != null) {
					const { data: empenho } = await fin.from("empenho").select("id").eq("unit_id", data.unitId).eq("numero_empenho", data.numeroDocumento).maybeSingle()
					if (empenho) {
						const delta = roundToCents(data.valorSiafi - data.valorSisub)
						if (Math.abs(delta) > 0.009) {
							const { error } = await fin.from("empenho_event").insert({
								empenho_id: empenho.id,
								tipo: delta > 0 ? "reforco" : "anulacao",
								valor: Math.abs(delta),
								data: new Date().toISOString().substring(0, 10),
								justificativa: `Conciliação SIAFI: valor ajustado de ${data.valorSisub.toFixed(2)} para ${data.valorSiafi.toFixed(2)}`,
								origem: "siafi",
								created_by: userId,
							})
							if (error) throw new Error(`Erro ao ajustar empenho: ${error.message}`)
						}
						const { error: originError } = await fin.from("empenho").update({ origem: "siafi", siafi_synced_at: new Date().toISOString() }).eq("id", empenho.id)
						if (originError) throw new Error(`Erro ao marcar a origem do empenho: ${originError.message}`)
					}
				}

				const { error } = await fin.from("reconciliation_decision").upsert(
					{
						unit_id: data.unitId,
						documento_tipo: data.documentoTipo,
						numero_documento: data.numeroDocumento,
						valor_sisub: data.valorSisub ?? null,
						valor_siafi: data.valorSiafi ?? null,
						decisao: data.decisao,
						justificativa: data.justificativa?.trim() || null,
						decided_by: userId,
						decided_at: new Date().toISOString(),
					},
					{ onConflict: "unit_id,documento_tipo,numero_documento" }
				)
				if (error) throw new Error(`Erro ao registrar decisão: ${error.message}`)
			},
			// A decisão e os dois valores confrontados entram no alvo: "adotou o SIAFI" sem
			// dizer de quanto para quanto não responde à pergunta que a conciliação levanta.
			() => ({
				unitId: data.unitId,
				documentoTipo: data.documentoTipo,
				numeroDocumento: data.numeroDocumento,
				decisao: data.decisao,
				valorSisub: data.valorSisub ?? null,
				valorSiafi: data.valorSiafi ?? null,
			})
		)
	})
