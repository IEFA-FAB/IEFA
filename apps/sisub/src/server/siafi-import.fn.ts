/**
 * @module siafi-import.fn
 * Importação de relatórios do Tesouro Gerencial (Fase 1 da execução
 * orçamentária): upload proxiado ao apps/api, listagem de lotes e
 * reprocessamento das linhas cruas quando o parser evolui.
 * CLIENT: getServerClient (service role, schema siafi_integration);
 *   fetch externo IEFA_API_BASE_URL (carimba ADMIN_SECRET — guard obrigatório).
 * AUTH: `unit` escopado — nível 1 leitura, 2 importar.
 * TABLES: siafi_integration.import_batch, import_row.
 * @domain external
 * @migration 20260731120000_siafi_import_staging
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen pós-migration
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")
const siafi = () => getServerClient("siafi_integration") as unknown as LooseClient

export const REPORT_TYPE_LABEL: Record<string, string> = {
	credito: "Crédito disponível",
	ne: "Notas de empenho",
	ns: "Notas de sistema (liquidação)",
	ob: "Ordens bancárias (pagamento)",
}

export interface ImportBatchRow {
	id: string
	report_type: string
	file_name: string
	competencia: string | null
	status: string
	total_rows: number
	recognized_rows: number
	applied_rows: number
	created_at: string
	applied_at: string | null
}

/** Sobe o arquivo ao proxy do api, que parseia e estaciona o lote. */
export const uploadSiafiReportFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			reportType: z.enum(["credito", "ne", "ns", "ob"]),
			fileName: z.string().min(1),
			/** conteúdo do arquivo em base64 (binário atravessa a server fn assim) */
			contentBase64: z.string().min(1),
			competencia: z
				.string()
				.regex(/^\d{4}-\d{2}$/)
				.optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireUnitScope(2, data.unitId)

		const params = new URLSearchParams({
			unit_id: String(data.unitId),
			report_type: data.reportType,
			file_name: data.fileName,
			created_by: userId,
		})
		if (data.competencia) params.set("competencia", data.competencia)

		const bytes = Uint8Array.from(atob(data.contentBase64), (char) => char.charCodeAt(0))
		const res = await fetch(`${API_BASE}/api/admin/siafi/import?${params}`, {
			method: "POST",
			headers: { "Content-Type": "application/octet-stream", "x-admin-secret": process.env.ADMIN_SECRET ?? "" },
			body: bytes as unknown as BodyInit,
		})
		const body = (await res.json().catch(() => ({}))) as {
			batch_id?: string
			error?: string
			total_rows?: number
			recognized_rows?: number
			invalid_rows?: number
			column_map?: Record<string, string>
		}
		if (res.status === 409) throw new Error(body.error ?? "Arquivo já importado")
		if (res.status === 422) throw new Error(body.error ?? "Layout do relatório não reconhecido")
		if (!res.ok || !body.batch_id) throw new Error(body.error ?? `API retornou ${res.status}`)

		return {
			batchId: body.batch_id,
			totalRows: body.total_rows ?? 0,
			recognizedRows: body.recognized_rows ?? 0,
			invalidRows: body.invalid_rows ?? 0,
			columnMap: body.column_map ?? {},
		}
	})

/** Lotes importados da unidade (mais recentes primeiro). */
export const listImportBatchesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<ImportBatchRow[]> => {
		await requireUnitScope(1, data.unitId)
		const { data: batches, error } = await siafi()
			.from("import_batch")
			.select("id, report_type, file_name, competencia, status, total_rows, recognized_rows, applied_rows, created_at, applied_at")
			.eq("unit_id", data.unitId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar lotes: ${error.message}`)
		return (batches ?? []) as ImportBatchRow[]
	})

/** Linhas de um lote — inclui as não reconhecidas, para diagnóstico de layout. */
export const fetchImportBatchFn = createServerFn({ method: "GET" })
	.validator(z.object({ batchId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const si = siafi()
		const { data: batch, error } = await si.from("import_batch").select("*").eq("id", data.batchId).single()
		if (error || !batch) throw new Error("Lote não encontrado")
		await requireUnitScope(1, Number(batch.unit_id))

		const { data: rows } = await si
			.from("import_row")
			.select("id, row_number, raw, parsed, parse_status, parse_error, applied_table, applied_id")
			.eq("batch_id", data.batchId)
			.order("row_number")
			.limit(500)
		return { ...batch, rows: rows ?? [] }
	})
