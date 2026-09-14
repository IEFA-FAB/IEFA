import { createFileRoute } from "@tanstack/react-router"

import { isDbPoolWedged } from "@/lib/db.server"

// 90% de 1GB — força o orquestrador a reiniciar o container antes de OOM
const MEMORY_LIMIT_BYTES = 900 * 1024 * 1024

function json(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// Handler de servidor, não loader: o estado do pool só existe no processo do Nitro, e um
// loader de rota também vai para o bundle do cliente, levando junto o import do `db.server`.
export const Route = createFileRoute("/health")({
	server: {
		handlers: {
			GET: () => {
				const rss = process.memoryUsage().rss
				const rss_mb = Math.round(rss / 1024 / 1024)

				if (rss > MEMORY_LIMIT_BYTES) {
					return json({ status: "unhealthy", service: "sisub", reason: "memory_pressure", rss_mb, limit_mb: 900 }, 503)
				}

				// Sem round-trip ao banco de propósito: uma queda do Supabase tornaria TODAS as tasks
				// unhealthy e o ECS entraria em ciclo de substituição. Isto só reprova o processo cujo
				// pool ficou preso mesmo depois do prazo — o estado que em 2026-09-13 manteve uma task
				// devolvendo 504 por cinco horas com este endpoint verde.
				if (isDbPoolWedged()) {
					return json({ status: "unhealthy", service: "sisub", reason: "db_pool_wedged", rss_mb }, 503)
				}

				return json({ status: "ok", service: "sisub", rss_mb }, 200)
			},
		},
	},
})
