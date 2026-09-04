import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"
import { secureCompare } from "../../lib/secure-compare.ts"
import { hasLiveSync, SYNC_SOURCES } from "../../lib/sync-log.ts"
import { COMAER_CNPJ, runPcaSync, SYNC_ALREADY_RUNNING } from "../../workers/pncp-pca-sync/index.ts"

/**
 * @module pncp-pca-admin
 * Disparo e acompanhamento da ingestão do Plano de Contratações Anual do PNCP.
 *
 * Espelha `compras-admin.ts`, inclusive o guard por `x-admin-secret`. Toda consulta a
 * `compras_sync_log` filtra por `source` — a tabela é compartilhada com o sync do Compras.gov.
 */

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "compras_gov_integration" },
		auth: { persistSession: false },
	})
}

const SyncLogSchema = z
	.object({
		id: z.number(),
		status: z.string(),
		started_at: z.string(),
		finished_at: z.string().nullable(),
		total_steps: z.number(),
		completed_steps: z.number(),
		failed_steps: z.number(),
		total_upserted: z.number(),
		error_message: z.string().nullable(),
	})
	.openapi("PncpPcaSyncLog")

const triggerRoute = createRoute({
	method: "post",
	path: "/sync",
	summary: "Dispara a ingestão do PCA",
	description: "Uma requisição por par órgão/ano. Padrão: CNPJ raiz do COMAER, exercício corrente e o seguinte.",
	request: {
		body: {
			required: false,
			content: {
				"application/json": {
					schema: z.object({
						cnpj: z.string().length(14).optional(),
						anos: z.array(z.number().int().min(2020).max(2100)).min(1).max(5).optional(),
					}),
				},
			},
		},
	},
	responses: {
		202: { description: "Ingestão iniciada", content: { "application/json": { schema: z.object({ sync_id: z.number().nullable() }) } } },
		409: { description: "Já em andamento", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
		401: { description: "Não autorizado", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
	},
})

const latestRoute = createRoute({
	method: "get",
	path: "/sync/latest",
	summary: "Última ingestão do PCA",
	responses: {
		200: { description: "Log", content: { "application/json": { schema: SyncLogSchema.nullable() } } },
		401: { description: "Não autorizado", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
	},
})

export const pncpPcaAdminRoutes = new OpenAPIHono()

pncpPcaAdminRoutes.use("*", async (c, next) => {
	if (!secureCompare(c.req.header("x-admin-secret"), env.ADMIN_SECRET)) {
		return c.json({ error: "Unauthorized" }, 401)
	}
	return next()
})

pncpPcaAdminRoutes
	.openapi(triggerRoute, async (c) => {
		const supabase = getSupabase()

		if (await hasLiveSync(supabase, SYNC_SOURCES.pncpPca)) {
			return c.json({ error: "Ingestão do PCA já está em andamento" }, 409)
		}

		const body = c.req.valid("json") ?? {}

		runPcaSync({ triggeredBy: "manual", cnpj: body.cnpj ?? COMAER_CNPJ, anos: body.anos })
			.then((id) =>
				id === SYNC_ALREADY_RUNNING
					? console.log("[pncp-pca-admin] Ingestão abortada: outra já estava viva")
					: console.log(`[pncp-pca-admin] Ingestão #${id} concluída`)
			)
			.catch((err) => console.error("[pncp-pca-admin] Ingestão falhou:", err))

		await new Promise((resolve) => setTimeout(resolve, 200))

		// Só interessa a execução AINDA viva: sem o filtro de status, uma corrida perdida
		// devolveria o id de um sync manual antigo e já finalizado como se fosse o recém-criado.
		const { data: latest } = await supabase
			.from("integration_sync_log")
			.select("id")
			.eq("source", SYNC_SOURCES.pncpPca)
			.eq("triggered_by", "manual")
			.eq("status", "running")
			.order("started_at", { ascending: false })
			.limit(1)
			.maybeSingle()

		return c.json({ sync_id: latest?.id ?? null }, 202)
	})

	.openapi(latestRoute, async (c) => {
		const { data } = await getSupabase()
			.from("integration_sync_log")
			.select("id, status, started_at, finished_at, total_steps, completed_steps, failed_steps, total_upserted, error_message")
			.eq("source", SYNC_SOURCES.pncpPca)
			.order("started_at", { ascending: false })
			.limit(1)
			.maybeSingle()

		return c.json(data ?? null, 200)
	})
