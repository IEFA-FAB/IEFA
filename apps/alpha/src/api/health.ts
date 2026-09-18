import { Hono } from "hono"
import { browserCors } from "./cors.ts"

const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024 // 450MB — 90% of ~500MB effective budget
const MEMORY_LIMIT_MB = 450

/**
 * Estado do serviço: pressão de memória, e só isso.
 *
 * É o que o target group do ALB consome (`health_check_path` em
 * `infra/alpha/variables.tf`), e por isso tem de ser barato e independente de
 * terceiros: uma consulta ao banco neste caminho transformaria lentidão do
 * Postgres em task derrubada e serviço fora do ar.
 *
 * Havia um nível `?deep=1`, que acrescentava uma leitura no banco. Existia para o
 * dot de status do ChatRADA — que dizia "Offline" com o α no ar e foi removido da
 * tela. Sem aquele consumidor sobrava uma rota pública que toca o banco e ninguém
 * lê; quem quiser a checagem de dependência de volta traz junto o consumidor dela.
 */
export function createHealthRoutes() {
	return (
		new Hono()
			// O CORS é o mesmo de `/api/v1/*`: quem lê esta rota é o browser (o painel de
			// serviços do portal), de outra origem.
			.use("/health", browserCors)
			.get("/health", (c) => {
				const rss = process.memoryUsage().rss
				const base = { service: "alpha" as const, rss_mb: Math.round(rss / 1024 / 1024) }

				if (rss > MEMORY_LIMIT_BYTES) {
					return c.json({ ...base, status: "unhealthy" as const, reason: "memory_pressure", limit_mb: MEMORY_LIMIT_MB }, 503)
				}

				return c.json({ ...base, status: "ok" as const })
			})
	)
}
