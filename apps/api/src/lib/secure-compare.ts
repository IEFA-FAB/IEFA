import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Comparação constant-time de segredos — evita timing attack do `!==` nativo,
 * que retorna no primeiro byte divergente.
 *
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual` para igualar o
 * comprimento dos buffers (requisito da função) sem um length-check que vaze
 * o tamanho do segredo via early-return.
 *
 * Retorna `false` se qualquer um dos lados estiver ausente ou vazio — mesma
 * semântica do guard `!secret ||` que substitui (401 idêntico).
 */
export function secureCompare(a: string | undefined | null, b: string | undefined | null): boolean {
	if (!a || !b) return false
	return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())
}
