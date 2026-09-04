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

/**
 * Aplica um lote NE/NS/OB ao domínio: documento novo é criado; existente é
 * enriquecido (campos ausentes) sem sobrescrever valor divergente.
 */
export const applyDocumentBatchFn = createServerFn({ method: "POST" })
	.validator(z.object({ batchId: z.uuid() }))
	.handler(async ({ data }) => {
		const si = siafi()
		const { data: batch, error: batchError } = await si.from("import_batch").select("*").eq("id", data.batchId).single()
		if (batchError || !batch) throw new Error("Lote não encontrado")
		await requireUnitScope(2, Number(batch.unit_id))
		if (batch.report_type === "credito") throw new Error("Use a aplicação de crédito para este lote")
		// reserva sob advisory lock: dois cliques simultâneos não aplicam duas vezes
		const { error: claimError } = await si.rpc("claim_import_batch", { p_batch_id: data.batchId })
		if (claimError) throw new Error(claimError.message)

		const { data: rows } = await si.from("import_row").select("id, parsed").eq("batch_id", data.batchId).eq("parse_status", "parsed")
		const parsedRows = (rows ?? []) as { id: string; parsed: Record<string, unknown> }[]
		if (parsedRows.length === 0) throw new Error("Lote sem linhas válidas para aplicar")

		const fin = finance()
		const now = new Date().toISOString()
		let created = 0
		let enriched = 0
		let divergent = 0

		for (const { id: rowId, parsed } of parsedRows) {
			if (batch.report_type === "ne") {
				const numero = String(parsed.numero_ne ?? "")
					.trim()
					.toUpperCase()
				if (!numero) continue
				const valor = Number(parsed.valor ?? 0)

				const { data: existing } = await fin
					.from("empenho")
					.select("id, valor_total, nd, ptres, fonte, favorecido_cnpj")
					.eq("unit_id", batch.unit_id)
					.eq("numero_empenho", numero)
					.maybeSingle()
				if (existing) {
					// enriquece o que falta; valor divergente NÃO é sobrescrito
					await fin
						.from("empenho")
						.update({
							nd: existing.nd ?? (parsed.nd as string) ?? null,
							ptres: existing.ptres ?? (parsed.ptres as string) ?? null,
							fonte: existing.fonte ?? (parsed.fonte as string) ?? null,
							favorecido_cnpj: existing.favorecido_cnpj ?? (parsed.favorecido_cnpj as string) ?? null,
							favorecido_nome: (parsed.favorecido_nome as string) ?? null,
							siafi_synced_at: now,
						})
						.eq("id", existing.id)
					if (Math.abs(Number(existing.valor_total) - valor) > 0.009) divergent++
					enriched++
					await si.from("import_row").update({ applied_table: "finance.empenho", applied_id: existing.id }).eq("id", rowId)
				} else {
					const { data: inserted } = await fin
						.from("empenho")
						.insert({
							unit_id: batch.unit_id,
							numero_empenho: numero,
							data_empenho: (parsed.data as string) ?? now.substring(0, 10),
							quantidade_empenhada: 1,
							valor_unitario: valor,
							valor_total: valor,
							nd: (parsed.nd as string) ?? null,
							ptres: (parsed.ptres as string) ?? null,
							fonte: (parsed.fonte as string) ?? null,
							favorecido_cnpj: (parsed.favorecido_cnpj as string) ?? null,
							favorecido_nome: (parsed.favorecido_nome as string) ?? null,
							exercicio: Number(String(parsed.data ?? now).substring(0, 4)),
							origem: "siafi",
							siafi_synced_at: now,
							import_batch_id: data.batchId,
						})
						.select("id")
						.maybeSingle()
					if (inserted) {
						created++
						await si.from("import_row").update({ applied_table: "finance.empenho", applied_id: inserted.id }).eq("id", rowId)
					}
				}
			} else {
				// NS e OB só entram quando o documento de origem existe no sisub —
				// sem empenho/liquidação não há onde pendurar a fase seguinte.
				const numero = String(parsed[batch.report_type === "ns" ? "numero_ns" : "numero_ob"] ?? "")
					.trim()
					.toUpperCase()
				if (!numero) continue
				const table = batch.report_type === "ns" ? "liquidacao" : "pagamento"
				const numberColumn = batch.report_type === "ns" ? "numero_ns" : "numero_ob"

				const { data: existing } = await fin.from(table).select("id").eq("unit_id", batch.unit_id).eq(numberColumn, numero).maybeSingle()
				if (existing) {
					await fin.from(table).update({ origem: "siafi" }).eq("id", existing.id)
					enriched++
					await si
						.from("import_row")
						.update({ applied_table: `finance.${table}`, applied_id: existing.id })
						.eq("id", rowId)
					continue
				}
				// documento só no SIAFI: fica visível na conciliação como
				// "apenas_siafi" — criar às cegas exigiria adivinhar o vínculo
				divergent++
			}
		}

		await si
			.from("import_batch")
			.update({ status: "applied", applied_rows: created + enriched, applied_at: now })
			.eq("id", data.batchId)
		return { created, enriched, divergent }
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
		const { userId } = await requireUnitScope(2, data.unitId)
		if (data.decisao === "mantido_local" && !data.justificativa?.trim()) {
			throw new Error("Manter o valor local exige justificativa")
		}
		const fin = finance()

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
				await fin.from("empenho").update({ origem: "siafi", siafi_synced_at: new Date().toISOString() }).eq("id", empenho.id)
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
	})
