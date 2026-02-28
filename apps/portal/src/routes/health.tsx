import { createFileRoute } from "@tanstack/react-router"

// 90% de 512MB — força o Fly.io a reiniciar o container antes de OOM
const MEMORY_LIMIT_BYTES = 460 * 1024 * 1024

export const Route = createFileRoute("/health")({
	loader: async () => {
		const mem = process.memoryUsage()
		const rss = mem.rss
		const rss_mb = Math.round(rss / 1024 / 1024)

		if (rss > MEMORY_LIMIT_BYTES) {
			throw new Response(
				JSON.stringify({
					status: "unhealthy",
					service: "iefa",
					reason: "memory_pressure",
					rss_mb,
					limit_mb: 460,
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		return { status: "ok", service: "iefa", rss_mb }
	},
	component: HealthCheck,
})

function HealthCheck() {
	const data = Route.useLoaderData()
	return <div>OK — {data.rss_mb}MB</div>
}
