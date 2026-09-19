import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Comparação constant-time de segredos — o `!==` nativo retorna no primeiro byte
 * divergente, e o tempo de resposta vira oráculo do prefixo certo.
 *
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual` para igualar o
 * comprimento dos buffers (requisito da função) sem um length-check que vaze o
 * tamanho do segredo.
 *
 * Retorna `false` se qualquer um dos lados estiver ausente ou vazio.
 *
 * Cópia de `apps/api/src/lib/secure-compare.ts`: app não importa de outro app.
 */
export function secureCompare(a: string | undefined | null, b: string | undefined | null): boolean {
	if (!a || !b) return false
	return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())
}
