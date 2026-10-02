/**
 * @module rate-limit
 * Teto de escritas de resposta por usuário — no servidor, em janela fixa.
 *
 * Mesmo desenho de `@iefa/ai-provider` (`rate-limit.ts`) e de
 * `apps/sisub/src/lib/recovery-rate-limit.ts`: estado em memória, por processo. Com N tasks no
 * ECS o teto efetivo é N × o configurado, e um deploy zera os contadores. Aceito aqui porque o
 * objetivo é conter laço e martelada (um script gravando sem parar), não contar com precisão; a
 * alternativa (tabela) seria migration nova para um contador que se apaga sozinho em um minuto.
 * O `@iefa/auth-kit/rate-limiter` não serve: guarda em `sessionStorage`, e quem martela usa `curl`.
 *
 * Puro de propósito (relógio injetável, sem request): é o que deixa `rate-limit.test.ts` provar o
 * comportamento. O singleton do processo e a tradução em 429 ficam em `rate-limit.server.ts`.
 */

export type WriteKind = "answer" | "session" | "submit" | "reopen"

/**
 * Escritas por minuto, por usuário e por tipo. O autosave grava uma chamada por pergunta alterada
 * (com 300 ms de debounce): 120/min cobre quem preenche um checklist de 22 perguntas a jato, com
 * folga. Sessão, envio e reabertura são atos raros de propósito.
 */
export const WRITE_LIMITS_PER_MINUTE: Record<WriteKind, number> = {
	answer: 120,
	session: 20,
	submit: 10,
	reopen: 10,
}

const MINUTE_MS = 60_000

type Window = { startedAt: number; used: number }

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/** Contadores de janela fixa. Classe exportada para o teste ter estado limpo. */
export class WriteRateLimiter {
	private readonly windows = new Map<string, Window>()

	constructor(private readonly limits: Record<WriteKind, number> = WRITE_LIMITS_PER_MINUTE) {}

	/** Consome uma escrita se couber; senão diz quanto esperar. */
	admit(userId: string, kind: WriteKind, now = Date.now()): RateVerdict {
		const key = `${kind}:${userId}`
		let window = this.windows.get(key)
		if (!window || now - window.startedAt >= MINUTE_MS) {
			window = { startedAt: now, used: 0 }
			this.windows.set(key, window)
			this.sweep(now)
		}
		if (window.used >= this.limits[kind]) {
			return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + MINUTE_MS - now) / 1000)) }
		}
		window.used += 1
		return { allowed: true }
	}

	/** Descarta janelas vencidas, para o mapa não crescer com cada usuário que passou por aqui. */
	private sweep(now: number): void {
		if (this.windows.size < 1_000) return
		for (const [key, window] of this.windows) {
			if (now - window.startedAt >= MINUTE_MS) this.windows.delete(key)
		}
	}
}
