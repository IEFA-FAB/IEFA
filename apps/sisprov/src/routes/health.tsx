import { createFileRoute } from "@tanstack/react-router"

/**
 * Health check do ALB (`health_check_path` da stack Terraform). Sem round-trip ao banco de
 * propósito: uma queda do Supabase tornaria todas as tasks unhealthy e o ECS entraria em ciclo
 * de substituição. O estado do banco aparece ao usuário pelo `DatabaseStatusBanner`.
 */
export const Route = createFileRoute("/health")({
	server: {
		handlers: {
			GET: () => {
				const rss_mb = Math.round(process.memoryUsage().rss / 1024 / 1024)
				return new Response(JSON.stringify({ status: "ok", service: "sisprov", rss_mb }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			},
		},
	},
})
