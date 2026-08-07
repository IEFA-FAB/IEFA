import { registerAgentDiscovery } from "./api/agent-discovery.ts"
import apiRoutes from "./api/routes.ts"
import { env } from "./env.ts"

const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024 // 450MB — 90% of ~500MB effective budget

const app = apiRoutes.get("/health", (c) => {
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

// robots.txt, llms.txt e os documentos em /.well-known — registrados fora da
// cadeia tipada acima para não interferir nos tipos do RPC do Hono.
registerAgentDiscovery(app)

const port = env.PORT

// Tipos exportados para Hono RPC (hc<AppType>)
export type AppType = typeof app

export default {
	port,
	fetch: app.fetch,
	// > `idle_timeout` do ALB (60 s). Com o padrão do Bun (10 s) quem fecha a
	// conexão é o servidor, e o ALB devolve 502 sem nenhum 5xx no target — o que
	// atinge em cheio as respostas de streaming da IA. Mesmo motivo do preload em
	// `docker/bun-serve-idle-timeout.ts` (o entry export-default do Hono não passa
	// por `Bun.serve`, então não é interceptado).
	idleTimeout: 120,
}
