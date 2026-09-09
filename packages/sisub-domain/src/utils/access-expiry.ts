/**
 * Prazo de validade de uma concessão de acesso — o predicado ÚNICO.
 *
 * `access_control.user_permissions.expires_at` (grant inline) e
 * `access_control.user_policy_attachment.expires_at` (anexo de política) usam a mesma
 * semântica: `NULL` = nunca expira, e a linha vale enquanto `expires_at > now()`.
 *
 * Duas regras que este módulo existe para não deixar divergirem entre os pontos de
 * resolução:
 *
 * 1. **Expirado é AUSENTE, não deny.** A linha é filtrada antes de chegar à resolução
 *    efetiva. Um `level 0` (deny) expirado, portanto, deixa de negar — se virasse deny,
 *    a precedência de `packages/pbac/src/effective-permissions.ts` mudaria de sentido.
 * 2. **A comparação é do BANCO.** `sql`now()`` é avaliado pelo Postgres. O relógio do
 *    processo não é fonte da verdade para autorização: um container com clock adiantado
 *    revogaria acesso vivo, e um atrasado concederia acesso já vencido.
 */

import { type Column, gt, isNull, or, type SQL, sql } from "drizzle-orm"

/** `WHERE expires_at IS NULL OR expires_at > now()` — a linha ainda vale. */
export function notExpired(column: Column): SQL {
	// `or` só devolve `undefined` quando não recebe condição alguma; com dois argumentos
	// literais o retorno é sempre um SQL. O `as SQL` evita propagar `| undefined` para
	// dentro de todo `and(...)` que consome este predicado.
	return or(isNull(column), gt(column, sql`now()`)) as SQL
}

/**
 * `expires_at IS NOT NULL AND expires_at <= now()` — a linha JÁ venceu.
 *
 * Serve às telas de administração, que precisam mostrar (e permitir remover) a concessão
 * vencida em vez de escondê-la. Calculado no banco pelo mesmo motivo de `notExpired`:
 * o console tem que concordar com a decisão de autorização, não com o relógio do browser.
 *
 * O `IS NOT NULL` é o que garante `boolean` e não `boolean | null`: sozinho,
 * `NULL <= now()` devolveria NULL, e a coluna "expirada?" viria vazia justamente para as
 * concessões sem prazo — as que mais precisam aparecer como vigentes.
 */
export function isExpired(column: Column): SQL<boolean> {
	return sql<boolean>`(${column} is not null and ${column} <= now())`
}
