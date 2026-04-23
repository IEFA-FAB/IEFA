import { createFileRoute } from "@tanstack/react-router"

// 90% de 512MB — força o Fly.io a reiniciar o container antes de OOM
const MEMORY_LIMIT_BYTES = 460 * 1024 * 1024

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				const mem = process.memoryUsage()
				const rss = mem.rss
				const rss_mb = Math.round(rss / 1024 / 1024)

				if (rss > MEMORY_LIMIT_BYTES) {
					return new Response(
						JSON.stringify({
							status: "unhealthy",
							service: "docs",
							reason: "memory_pressure",
							rss_mb,
							limit_mb: 460,
						}),
						{
							status: 503,
							headers: { "content-type": "application/json" },
						}
					)
				}

				return new Response(JSON.stringify({ status: "ok", service: "docs", rss_mb }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			},
		},
	},
})
