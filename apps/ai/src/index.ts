import { ENV } from "varlock/env"
import apiRoutes from "./api/routes.ts"

const app = apiRoutes

const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024 // 450MB — 90% of ~500MB effective budget

app.get("/health", (c) => {
	const mem = process.memoryUsage()
	const rss = mem.rss

	if (rss > MEMORY_LIMIT_BYTES) {
		return c.json(
			{
				status: "unhealthy",
				service: "atlas-ai",
				reason: "memory_pressure",
				rss_mb: Math.round(rss / 1024 / 1024),
				limit_mb: 450,
			},
			503
		)
	}

	return c.json({
		status: "ok",
		service: "atlas-ai",
		rss_mb: Math.round(rss / 1024 / 1024),
	})
})

const port = ENV.PORT

export default {
	port,
	fetch: app.fetch,
}
