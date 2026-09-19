/**
 * Freio de tentativas erradas de `x-admin-secret`, por IP de origem.
 *
 * O segredo é um só e estático, e abre dado pessoal (`/api/user-data`,
 * `/api/user-military-data`…) e toda rota de `/api/admin/*`. Sem freio, quem quisesse
 * adivinhá-lo tinha requisições ilimitadas — e o `secureCompare` só tira o oráculo de
 * tempo, não a força bruta.
 *
 * ## Onde o estado mora
 *
 * Em memória, por processo — a mesma limitação consciente do limite de recuperação de MFA
 * do sisub: com N tasks o teto efetivo é N × o configurado, e um deploy zera os
 * contadores. Aceito porque o que se quer é tornar a força bruta impraticável, não
 * contar tentativas com exatidão; e a alternativa (tabela) seria estado persistente para um
 * contador que se apaga sozinho em minutos.
 *
 * Arquivo PURO: sem `env`, sem Supabase. O relógio é injetado para o teste.
 */

import type { Context, MiddlewareHandler } from "hono"

/** Tentativas erradas que um IP pode fazer na janela antes de ser barrado. */
export const MAX_ADMIN_FAILURES = 10

/** Janela fixa do balde. Barrado, o IP espera o resto dela. */
export const ADMIN_FAILURE_WINDOW_MS = 15 * 60 * 1000

/** Teto de IPs rastreados — acima disso os baldes vencidos são varridos, e se ainda assim não couber, os mais antigos saem. */
export const MAX_TRACKED_ORIGINS = 10_000

/** Origem indisponível cai num balde só: não dá para distinguir quem é. */
export const UNKNOWN_ORIGIN = "unknown"

type Bucket = { startedAt: number; failures: number }

export type AttemptVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export class FailedAttemptLimiter {
	private readonly buckets = new Map<string, Bucket>()

	constructor(
		private readonly maxFailures = MAX_ADMIN_FAILURES,
		private readonly windowMs = ADMIN_FAILURE_WINDOW_MS,
		private readonly now: () => number = Date.now,
		private readonly maxOrigins = MAX_TRACKED_ORIGINS
	) {}

	private live(origin: string): Bucket | null {
		const bucket = this.buckets.get(origin)
		if (!bucket) return null
		if (this.now() - bucket.startedAt >= this.windowMs) {
			this.buckets.delete(origin)
			return null
		}
		return bucket
	}

	assess(origin: string): AttemptVerdict {
		const bucket = this.live(origin)
		if (!bucket || bucket.failures < this.maxFailures) return { allowed: true }
		const remainingMs = bucket.startedAt + this.windowMs - this.now()
		return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) }
	}

	recordFailure(origin: string): void {
		const bucket = this.live(origin)
		if (bucket) {
			bucket.failures += 1
			return
		}
		if (this.buckets.size >= this.maxOrigins) this.evict()
		this.buckets.set(origin, { startedAt: this.now(), failures: 1 })
	}

	private evict(): void {
		const now = this.now()
		for (const [origin, bucket] of this.buckets) {
			if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(origin)
		}
		// Ainda cheio: a ordem de inserção do Map é a de criação do balde — sai o mais antigo.
		for (const origin of this.buckets.keys()) {
			if (this.buckets.size < this.maxOrigins) break
			this.buckets.delete(origin)
		}
	}
}

/**
 * IP do cliente a partir do `X-Forwarded-For`, lido pela DIREITA.
 *
 * O ALB ACRESCENTA ao fim do cabeçalho o IP que viu na conexão; tudo à esquerda disso foi
 * escrito pelo cliente e é forjável. Ler o primeiro valor deixaria o atacante trocar de
 * balde a cada requisição mandando `X-Forwarded-For: <qualquer coisa>`. O último é o único
 * que o cliente não controla.
 */
export function clientIpFromForwardedFor(header: string | null | undefined): string | null {
	if (!header) return null
	const hops = header
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean)
	return hops.at(-1) ?? null
}

/** A rota exige `x-admin-secret`? `/api/admin/*` e as rotas de dado pessoal sob `/api`. */
export function isAdminSecretPath(path: string, restrictedPaths: readonly string[]): boolean {
	if (path === "/api/admin" || path.startsWith("/api/admin/")) return true
	return restrictedPaths.some((restricted) => path === `/api${restricted}` || path === `/api${restricted}/`)
}

/**
 * Middleware do freio. Fica ANTES dos guards de cada rota: IP barrado recebe 429 sem nem
 * chegar à comparação do segredo — inclusive com o segredo certo, senão a força bruta
 * continuaria descobrindo o acerto pelo status. Depois da rota, todo 401 conta como
 * tentativa errada (é o único motivo de 401 nessas rotas).
 */
export function adminAttemptGuard(options: {
	limiter: FailedAttemptLimiter
	restrictedPaths: readonly string[]
	clientIp: (c: Context) => string
}): MiddlewareHandler {
	return async (c, next) => {
		if (c.req.method === "OPTIONS" || !isAdminSecretPath(c.req.path, options.restrictedPaths)) return next()

		const origin = options.clientIp(c)
		const verdict = options.limiter.assess(origin)
		if (!verdict.allowed) {
			c.header("Retry-After", String(verdict.retryAfterSeconds))
			return c.json({ error: "Too Many Requests" }, 429)
		}

		await next()

		if (c.res.status === 401) {
			options.limiter.recordFailure(origin)
			// O valor tentado nunca vai ao log — só a origem e a rota.
			console.warn(`[admin-auth] x-admin-secret inválido de ${JSON.stringify(origin)} em ${JSON.stringify(c.req.path)}`)
		}
	}
}
