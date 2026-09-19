/**
 * @module like-pattern
 * Termo de busca livre dentro de um `ilike` do PostgREST.
 *
 * "Contém" não pode ter sintaxe escondida: sem escape, `%%%` passa pelo mínimo de três
 * caracteres e casa com o efetivo inteiro — é exatamente a leitura em massa que o
 * mínimo existia para impedir. Cópia de `escapeLikePattern` do `apps/api`
 * (`src/api/query-params.ts`), que é serviço, não pacote.
 */

/**
 * Curingas que o SQL interpreta (`%`, `_`) e o próprio escape (`\`) viram literais.
 *
 * Ressalva: o PostgREST troca `*` por `%` ANTES de chegar ao SQL, e essa troca não tem
 * escape. Por isso `*` é removido do termo em vez de escapado — nome de guerra não tem
 * asterisco.
 */
export function escapeLikePattern(value: string): string {
	return value.replace(/\*/g, "").replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Quantos caracteres do termo são texto de verdade — curinga e espaço não contam. */
export function countLiteralSearchChars(value: string): number {
	return value.replace(/[\s%_*\\]/g, "").length
}
