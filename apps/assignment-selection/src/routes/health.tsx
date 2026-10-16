import { createFileRoute } from "@tanstack/react-router"

// 460 MB ≈ 90% dos 512 MB da task (`memory` em `infra/assignment-selection/variables.tf`):
// o 503 faz o ALB tirar a task e o ECS trocá-la antes do OOM. Mudou a memória da task, mude
// este número. Errar para baixo custa caro: com uma task só (o default de `desired_count`),
// o 503 derruba o telão no meio da cerimônia até a substituta subir.
const MEMORY_LIMIT_MB = 460
const MEMORY_LIMIT_BYTES = MEMORY_LIMIT_MB * 1024 * 1024

export const Route = createFileRoute("/health")({
	loader: async () => {
		const mem = process.memoryUsage()
		const rss_mb = Math.round(mem.rss / 1024 / 1024)

		if (mem.rss > MEMORY_LIMIT_BYTES) {
			throw new Response(
				JSON.stringify({ status: "unhealthy", service: "assignment-selection", reason: "memory_pressure", rss_mb, limit_mb: MEMORY_LIMIT_MB }),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		return { status: "ok", service: "assignment-selection", rss_mb }
	},
	component: HealthCheck,
})

function HealthCheck() {
	const data = Route.useLoaderData()
	return <div>OK — {data.rss_mb}MB</div>
}
