import { setResponseStatus } from "@tanstack/react-start/server"
import { type WriteKind, WriteRateLimiter } from "./rate-limit"

/** Singleton do processo — ver o cabeçalho de `rate-limit.ts` sobre o estado em memória. */
const WRITE_LIMITER = new WriteRateLimiter()

/**
 * Consome uma escrita do usuário ou responde 429 e lança. A espera vai na MENSAGEM: o erro da
 * server function chega ao cliente como `Error` simples, sem os campos extras.
 */
export function enforceWriteRate(userId: string, kind: WriteKind): void {
	const verdict = WRITE_LIMITER.admit(userId, kind)
	if (verdict.allowed) return
	setResponseStatus(429)
	throw new Error(`Muitas gravações em sequência. Aguarde ${verdict.retryAfterSeconds} s e tente de novo.`)
}
