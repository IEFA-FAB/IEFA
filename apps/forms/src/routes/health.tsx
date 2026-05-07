import { createFileRoute } from "@tanstack/react-router"

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
					service: "iefa-forms",
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

		return { status: "ok", service: "iefa-forms", rss_mb }
	},
	component: HealthCheck,
})

function HealthCheck() {
	const data = Route.useLoaderData()
	return <div>OK — {data.rss_mb}MB</div>
}
