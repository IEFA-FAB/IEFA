/**
 * Rotas admin SIAFI: importação de relatórios do Tesouro Gerencial
 * (crédito, NE, NS, OB) para o staging `siafi_integration`.
 *
 * O SIAFI não tem API pública de escrita e a leitura programática depende de
 * credencial institucional — nesta fase o dado entra por arquivo exportado.
 * Este endpoint apenas PARSEIA e ESTACIONA: a aplicação ao domínio `finance`
 * é decisão do gestor, feita depois de revisar o resumo (fase 5).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { secureCompare } from "../../lib/secure-compare.ts"
import { parseSiafiRows, SiafiParseError, type SiafiReportType } from "../../workers/siafi/parse.ts"
import { readSiafiFile } from "../../workers/siafi/read-file.ts"

type SiafiClient = ReturnType<typeof getSupabase>

function requiredEnv(name: "API_SUPABASE_URL" | "API_SUPABASE_SERVICE_ROLE_KEY") {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

function getSupabase() {
	return createClient(requiredEnv("API_SUPABASE_URL"), requiredEnv("API_SUPABASE_SERVICE_ROLE_KEY"), {
		db: { schema: "siafi_integration" },
		auth: { persistSession: false },
	})
}

const ErrorSchema = z.object({ error: z.string() })

const ImportResultSchema = z.object({
	batch_id: z.string(),
	report_type: z.string(),
	total_rows: z.number(),
	recognized_rows: z.number(),
	invalid_rows: z.number(),
	column_map: z.record(z.string(), z.string()),
})

const importRoute = createRoute({
	method: "post",
	path: "/import",
	tags: ["Admin — SIAFI"],
	summary: "Import Tesouro Gerencial report",
	description:
		"Recebe o relatório exportado do Tesouro Gerencial (CSV ou XLSX, body binário), parseia e estaciona em siafi_integration. Não aplica ao domínio — isso é ação separada do gestor.",
	security: [{ AdminSecret: [] }],
	request: {
		body: {
			content: {
				"application/octet-stream": { schema: z.string() },
				"text/csv": { schema: z.string() },
			},
			required: true,
		},
		query: z.object({
			unit_id: z.coerce.number().int().positive(),
			report_type: z.enum(["credito", "ne", "ns", "ob"]),
			file_name: z.string().min(1),
			competencia: z
				.string()
				.regex(/^\d{4}-\d{2}$/)
				.optional(),
			created_by: z.uuid().optional(),
		}),
	},
	responses: {
		201: { content: { "application/json": { schema: ImportResultSchema } }, description: "Lote importado e estacionado" },
		409: {
			content: { "application/json": { schema: ErrorSchema.extend({ batch_id: z.string().optional() }) } },
			description: "Arquivo já importado (mesmo hash)",
		},
		422: { content: { "application/json": { schema: ErrorSchema } }, description: "Layout não reconhecido ou tipo incompatível" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

export interface SiafiAdminRoutesDeps {
	adminSecret?: string
	getSupabase?: () => SiafiClient
}

export function createSiafiAdminRoutes(deps: SiafiAdminRoutesDeps = {}) {
	const siafiAdminRoutes = new OpenAPIHono()
	const adminSecret = deps.adminSecret ?? process.env.ADMIN_SECRET
	const createSupabase = deps.getSupabase ?? getSupabase

	siafiAdminRoutes.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secureCompare(secret, adminSecret)) return c.json({ error: "Unauthorized" }, 401)
		return next()
	})

	siafiAdminRoutes.openapi(importRoute, async (c) => {
		const { unit_id, report_type, file_name, competencia, created_by } = c.req.valid("query")
		const bytes = new Uint8Array(await c.req.arrayBuffer())
		if (bytes.length === 0) return c.json({ error: "Arquivo vazio" }, 422)

		const contentHash = await sha256Hex(bytes)
		const supabase = createSupabase()

		// mesmo arquivo já importado nesta unidade → no-op idempotente
		const { data: existing } = await supabase.from("import_batch").select("id").eq("unit_id", unit_id).eq("content_hash", contentHash).maybeSingle()
		if (existing) return c.json({ error: "Este arquivo já foi importado", batch_id: existing.id as string }, 409)

		let report: ReturnType<typeof parseSiafiRows>
		try {
			const rows = readSiafiFile(bytes, file_name)
			report = parseSiafiRows(rows, report_type as SiafiReportType)
		} catch (err) {
			if (err instanceof SiafiParseError) return c.json({ error: err.message }, 422)
			throw err
		}

		const invalidRows = report.rows.filter((row) => row.status !== "parsed").length

		const { data: batch, error: batchError } = await supabase
			.from("import_batch")
			.insert({
				unit_id,
				report_type,
				file_name,
				content_hash: contentHash,
				competencia: competencia ? `${competencia}-01` : null,
				total_rows: report.totalRows,
				recognized_rows: report.recognizedRows,
				created_by: created_by ?? null,
			})
			.select("id")
			.single()
		if (batchError || !batch) throw new Error(`Falha ao criar lote: ${batchError?.message}`)

		const { error: rowsError } = await supabase.from("import_row").insert(
			report.rows.map((row) => ({
				batch_id: batch.id,
				row_number: row.rowNumber,
				raw: row.raw,
				parsed: row.parsed,
				parse_status: row.status,
				parse_error: row.error ?? null,
			}))
		)
		if (rowsError) {
			// sem linhas o lote é inútil e ainda reserva o hash — remove
			await supabase.from("import_batch").delete().eq("id", batch.id)
			throw new Error(`Falha ao gravar linhas: ${rowsError.message}`)
		}

		console.log(`[siafi-admin] Lote ${report_type} importado: ${report.recognizedRows}/${report.totalRows} linhas reconhecidas`)
		return c.json(
			{
				batch_id: batch.id as string,
				report_type,
				total_rows: report.totalRows,
				recognized_rows: report.recognizedRows,
				invalid_rows: invalidRows,
				column_map: report.columnMap,
			},
			201
		)
	})

	return siafiAdminRoutes
}

export const siafiAdminRoutes = createSiafiAdminRoutes()
