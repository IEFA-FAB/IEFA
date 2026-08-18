import { registerAgentDiscovery } from "./api/agent-discovery.ts"
import { legalRoutes } from "./api/legal.ts"
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

// Documentos legais e robots.txt/llms.txt/.well-known — registrados fora da
// cadeia tipada acima para não interferir nos tipos do RPC do Hono.
app.route("/legal", legalRoutes)
registerAgentDiscovery(app)

const port = env.PORT

// Tipos exportados para Hono RPC (hc<AppType>)
export type AppType = typeof app

export default {
	port,
	fetch: app.fetch,
	/**
	 * Acima do `idle_timeout` do ALB (60 s). Com o padrão do Bun (10 s) quem
	 * fecha a conexão é o servidor, e o ALB devolve 502 sem nenhum 5xx no target
	 * — o que atinge em cheio as respostas de streaming da IA. Mesmo motivo do
	 * preload em `docker/bun-serve-idle-timeout.ts` (o entry export-default do
	 * Hono não passa por `Bun.serve`, então não é interceptado).
	 *
	 * Extração de ETP/TR, verificação de conformidade e coleta de fonte também
	 * passam de 10 s com facilidade. Vale lembrar que **o teto real em produção
	 * é o ALB**: operação que ultrapasse os 60 s dele precisa virar assíncrona,
	 * não ganhar mais timeout aqui.
	 */
	idleTimeout: 240,
}
