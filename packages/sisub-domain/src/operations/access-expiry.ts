/**
 * Prazo de validade de uma concessão de acesso — os predicados SQL compartilhados.
 *
 * Uma concessão (grant inline em `access_control.user_permissions`, anexo em
 * `access_control.user_policy_attachment`) pode ter `expires_at`:
 *
 *   null                → nunca expira. Default, e o valor de toda linha anterior à coluna.
 *   expires_at > now()  → vigente.
 *   expires_at <= now() → AUSENTE para a resolução. Não vira deny.
 *
 * "Ausente, não deny" é o ponto que não pode ser afrouxado: um `level 0` vencido tem que
 * DEIXAR DE NEGAR, do mesmo jeito que um allow vencido deixa de conceder. Se a linha morta
 * chegasse ao resolver, ela entraria na fase de coleta de denies de
 * `packages/pbac/src/effective-permissions.ts` e passaria a cancelar allows vivos de outra
 * origem — o oposto do pretendido. Por isso o corte é sempre na QUERY, nunca depois.
 *
 * E é o banco que compara, com `now()`: o relógio do processo não é fonte da verdade para
 * autorização (deriva de NTP, container com clock errado, teste que congela o tempo), e
 * filtrar em SQL evita trazer linha morta para dentro do resolver.
 */

import { type Column, gt, isNull, or, type SQL, sql } from "drizzle-orm"

/** Predicado "esta concessão vale agora" — use no `where` de TODA query de resolução. */
export function isActiveGrant(expiresAt: Column): SQL {
	// `or` é tipado como `SQL | undefined` porque devolve undefined quando TODOS os operandos
	// são undefined. Aqui são dois predicados literais, então o estreitamento afirma um
	// invariante do call site — não esconde um ramo. Devolver `SQL | undefined` empurraria um
	// `where` possivelmente vazio para cada chamador, e `where(undefined)` é uma query SEM
	// filtro de prazo: exatamente a falha silenciosa que esta função existe para evitar.
	return or(isNull(expiresAt), gt(expiresAt, sql`now()`)) as SQL
}

/**
 * Projeção "esta concessão já venceu", para as LISTAGENS ADMINISTRATIVAS.
 *
 * O console precisa continuar enxergando a linha vencida — é ela que o administrador renova
 * ou remove; sumir com ela deixaria uma concessão morta inalcançável na tela. O que a tela
 * não pode é apresentá-la como ativa, então a distinção vem calculada pelo mesmo `now()` do
 * banco, e não por uma comparação no navegador.
 */
export function isExpiredGrant(expiresAt: Column): SQL<boolean> {
	return sql<boolean>`(${expiresAt} is not null and ${expiresAt} <= now())`
}
