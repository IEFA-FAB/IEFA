import { registerAgentDiscovery } from "./api/agent-discovery.ts"
import { createHealthRoutes } from "./api/health.ts"
import { legalRoutes } from "./api/legal.ts"
import apiRoutes from "./api/routes.ts"
import { supabase } from "./db/supabase.ts"
import { env } from "./env.ts"
import { refreshAllSources } from "./jobs/refresh-sources.ts"
import { startSourcesRefreshWorker } from "./jobs/scheduler.ts"

/** Teto da sonda profunda. Acima disso o banco conta como fora, e não como lento. */
const DEEP_PROBE_TIMEOUT_MS = 2000

/**
 * Uma leitura barata no schema `alpha`, só para saber se o banco responde.
 *
 * `limit(1)` sem `count` de propósito: contagem exata varre a tabela, e o que a
 * sonda precisa saber é se a conexão e a credencial estão de pé — não quantos
 * documentos existem.
 */
async function probeDatabase(): Promise<"ok" | "error"> {
	try {
		const { error } = await supabase.from("document").select("id").limit(1).abortSignal(AbortSignal.timeout(DEEP_PROBE_TIMEOUT_MS))
		if (error) {
			// A resposta ao cliente é só "degraded": chave expirada, grant revogado e
			// timeout são o mesmo 503 para quem olha a tela, e não é dela que sai o
			// diagnóstico. Sem esta linha, a diferença some para todo mundo.
			console.error(`[health] banco não respondeu: ${error.message}`)
			return "error"
		}
		return "ok"
	} catch (cause) {
		console.error(`[health] banco não respondeu: ${cause instanceof Error ? cause.message : String(cause)}`)
		return "error"
	}
}

const app = apiRoutes
	/**
	 * Atualização agendada das fontes normativas.
	 *
	 * Fora de `/api/v1/*`, portanto sem o middleware de JWT: quem chama é uma
	 * scheduled task, não um usuário. A autenticação é por segredo de serviço.
	 */
	.post("/internal/jobs/sources/refresh", async (c) => {
		const provided = c.req.header("x-alpha-job-secret")
		if (!env.ALPHA_JOB_SECRET || provided !== env.ALPHA_JOB_SECRET) {
			return c.json({ error: "Unauthorized", code: "INVALID_JOB_SECRET" }, 401)
		}

		const report = await refreshAllSources({ apply: true })
		return c.json(report)
	})

startSourcesRefreshWorker(env.ALPHA_SOURCES_REFRESH_ENABLED)

// Estado do serviço, documentos legais e robots.txt/llms.txt/.well-known —
// registrados fora da cadeia tipada acima para não interferir nos tipos do RPC
// do Hono. Nada disso é chamado pelo client tipado.
app.route("/", createHealthRoutes(probeDatabase))
app.route("/legal", legalRoutes)
registerAgentDiscovery(app)

const port = env.PORT

// Tipos exportados para Hono RPC (hc<AppType>)
export type AppType = typeof app

export default {
	port,
	fetch: app.fetch,
	/**
	 * Acima do `idle_timeout` do ALB (60 s). Com o padrão do Bun (10 s) quem
	 * fecha a conexão é o servidor, e o ALB devolve 502 sem nenhum 5xx no target
	 * — o que atinge em cheio as respostas de streaming da IA. Mesmo motivo do
	 * preload em `docker/bun-serve-idle-timeout.ts` (o entry export-default do
	 * Hono não passa por `Bun.serve`, então não é interceptado).
	 *
	 * Extração de ETP/TR, verificação de conformidade e coleta de fonte também
	 * passam de 10 s com facilidade. Vale lembrar que **o teto real em produção
	 * é o ALB**: operação que ultrapasse os 60 s dele precisa virar assíncrona,
	 * não ganhar mais timeout aqui.
	 */
	idleTimeout: 240,
}
