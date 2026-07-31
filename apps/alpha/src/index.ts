import apiRoutes from "./api/routes.ts"
import { env } from "./env.ts"
import { refreshAllSources } from "./jobs/refresh-sources.ts"
import { startSourcesRefreshWorker } from "./jobs/scheduler.ts"

const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024 // 450MB — 90% of ~500MB effective budget

const app = apiRoutes
	/**
	 * Atualização agendada das fontes normativas.
	 *
	 * Fora de `/api/v1/*`, portanto sem o middleware de JWT: quem chama é uma
	 * scheduled task, não um usuário. A autenticação é por segredo de serviço.
	 */
	.post("/internal/jobs/sources/refresh", async (c) => {
		const provided = c.req.header("x-alpha-job-secret")
		if (!env.ALPHA_JOB_SECRET || provided !== env.ALPHA_JOB_SECRET) {
			return c.json({ error: "Unauthorized", code: "INVALID_JOB_SECRET" }, 401)
		}

		const report = await refreshAllSources({ apply: true })
		return c.json(report)
	})
	.get("/health", (c) => {
		const mem = process.memoryUsage()
		const rss = mem.rss

		if (rss > MEMORY_LIMIT_BYTES) {
			return c.json(
				{
					status: "unhealthy" as const,
					service: "alpha",
					reason: "memory_pressure",
					rss_mb: Math.round(rss / 1024 / 1024),
					limit_mb: 450,
				},
				503
			)
		}

		return c.json({
			status: "ok" as const,
			service: "alpha",
			rss_mb: Math.round(rss / 1024 / 1024),
		})
	})

startSourcesRefreshWorker(env.ALPHA_SOURCES_REFRESH_ENABLED)

const port = env.PORT

// Tipos exportados para Hono RPC (hc<AppType>)
export type AppType = typeof app

export default {
	port,
	fetch: app.fetch,
}
