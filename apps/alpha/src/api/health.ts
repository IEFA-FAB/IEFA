import { Hono } from "hono"
import { browserCors } from "./cors.ts"

// A task tem 1024 MB (`memory` em `infra/alpha/sizing.auto.tfvars`), mas o `rss` daqui é só
// o do processo principal: a leitura de PDF roda em até `MAX_CONCURRENT_READS` (2) filhos de
// até `PDF_READ_MAX_RSS_BYTES` (256 MB) cada (`extraction/pdf-isolated.ts`), que ele não conta.
// Sobram 1024 − 2 × 256 = 512 MB para o principal; 450 MB é ~90% disso. Mudou a memória da
// task, a concorrência ou o teto do filho, refaça a conta aqui.
const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024
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
