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
				service: "atlas-ai",
				reason: "memory_pressure",
				rss_mb: Math.round(rss / 1024 / 1024),
				limit_mb: 450,
			},
			503
		)
	}

	return c.json({
		status: "ok" as const,
		service: "atlas-ai",
		rss_mb: Math.round(rss / 1024 / 1024),
	})
})

const port = env.PORT

// Tipos exportados para Hono RPC (hc<AppType>)
export type AppType = typeof app

export default {
	port,
	fetch: app.fetch,
}
