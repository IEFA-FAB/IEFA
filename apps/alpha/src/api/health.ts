import { Hono } from "hono"
import { browserCors } from "./cors.ts"

const MEMORY_LIMIT_BYTES = 450 * 1024 * 1024 // 450MB — 90% of ~500MB effective budget
const MEMORY_LIMIT_MB = 450

/** Sonda de dependência: responde se o recurso atende, nunca o que ele contém. */
export type DependencyProbe = () => Promise<"ok" | "error">

/**
 * Estado do serviço, em dois níveis — e a diferença entre eles é deliberada.
 *
 * **Sem parâmetro**: só pressão de memória. É o que o target group do ALB consome
 * (`health_check_path` em `infra/alpha/variables.tf`), e por isso tem de ser barato
 * e independente de terceiros: uma consulta ao banco neste caminho transformaria
 * lentidão do Postgres em task derrubada e serviço fora do ar.
 *
 * **Com `?deep=1`**: acrescenta uma leitura no banco. É o que o ChatRADA pergunta,
 * porque o dot verde da tela promete "pode perguntar" — e sem banco o α não registra
 * a sessão nem recupera trecho de norma. Processo vivo com memória folgada não é a
 * mesma promessa, e foi assim que a busca semântica ficou quebrada por meses com a
 * sonda em verde.
 *
 * A sonda vem por parâmetro para o teste não precisar de credencial: o cliente
 * Supabase valida env na carga do módulo.
 */
export function createHealthRoutes(probeDatabase: DependencyProbe) {
	return (
		new Hono()
			// O CORS é o mesmo de `/api/v1/*`: quem lê esta rota é o browser, de outra origem.
			.use("/health", browserCors)
			.get("/health", async (c) => {
				const rss = process.memoryUsage().rss
				const base = { service: "alpha" as const, rss_mb: Math.round(rss / 1024 / 1024) }

				if (rss > MEMORY_LIMIT_BYTES) {
					return c.json({ ...base, status: "unhealthy" as const, reason: "memory_pressure", limit_mb: MEMORY_LIMIT_MB }, 503)
				}

				if (c.req.query("deep") !== "1") {
					return c.json({ ...base, status: "ok" as const })
				}

				const database = await probeDatabase()
				if (database !== "ok") {
					return c.json({ ...base, status: "degraded" as const, reason: "database_unreachable", checks: { database } }, 503)
				}

				return c.json({ ...base, status: "ok" as const, checks: { database } })
			})
	)
}
