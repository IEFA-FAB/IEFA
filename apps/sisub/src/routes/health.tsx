import { createFileRoute } from "@tanstack/react-router"

import { isDbPoolWedged } from "@/lib/db.server"
import { memoryThresholdBytes, parseTaskMemoryLimitMiB } from "@/lib/task-memory-limit"

function json(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const METADATA_TIMEOUT_MS = 2000

/**
 * Limite da task, guardado depois da PRIMEIRA leitura válida: não muda enquanto o container
 * vive. Falha ou ausência do endpoint (dev, fora do ECS) resolve para `null` e o limiar cai no
 * fallback de ~900 MB — nunca derruba o health check.
 *
 * O `null` NÃO é guardado: uma falha passageira na primeira chamada prenderia o processo no
 * fallback pela vida inteira, e numa task de 2 GB o ALB a tiraria da rotação em 900 MB. A
 * próxima checagem (15 s) tenta de novo — é um GET ao endpoint local do agente do ECS.
 */
let taskLimitMiB: number | undefined

async function readTaskMemoryLimitMiB(): Promise<number | null> {
	if (taskLimitMiB !== undefined) return taskLimitMiB
	const base = process.env.ECS_CONTAINER_METADATA_URI_V4
	if (!base) return null
	const limit = await fetch(`${base}/task`, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) })
		.then((res) => (res.ok ? res.json() : null))
		.then(parseTaskMemoryLimitMiB)
		.catch(() => null)
	if (limit !== null) taskLimitMiB = limit
	return limit
}

// Handler de servidor, não loader: o estado do pool só existe no processo do Nitro, e um
// loader de rota também vai para o bundle do cliente, levando junto o import do `db.server`.
export const Route = createFileRoute("/health")({
	server: {
		handlers: {
			GET: async () => {
				const rss = process.memoryUsage().rss
				const rss_mb = Math.round(rss / 1024 / 1024)

				// 90% do limite REAL da task — força o orquestrador a trocar o container antes do OOM,
				// e acompanha a task quando ela cresce (ver `task-memory-limit.ts`).
				const limit = memoryThresholdBytes(await readTaskMemoryLimitMiB())
				if (rss > limit) {
					return json({ status: "unhealthy", service: "sisub", reason: "memory_pressure", rss_mb, limit_mb: Math.round(limit / 1024 / 1024) }, 503)
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
