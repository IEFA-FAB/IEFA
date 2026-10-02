/**
 * @module domain-handler.server
 * Handler das server functions que só repassam a uma operation de `@iefa/sisub-domain`.
 *
 * Mais de 200 server fns repetiam as mesmas quatro linhas: o guard, `getDb()`, a operation e
 * `.catch(handleDomainError)`. A autorização de verdade (módulo, nível, escopo) mora na
 * operation, que recebe o `ctx` da sessão; aqui ficam o guard da fn e a tradução do erro.
 *
 *   export const fetchMealTypesFn = createServerFn({ method: "GET" })
 *     .validator(FetchMealTypesSchema)
 *     .handler(requireAuthThenRun(fetchMealTypes))
 *
 *   // guard de permissão na própria fn:
 *     .handler(requireAuthThenRun(listAuditLog, () => requireAuthWithPermission("admin", 3)))
 *
 * O nome começa por `require`: os contratos de `server-fn-auth.contract.test.ts` contam a
 * chamada como guard de autenticação, leem a operation pelo nome e tratam a fn como quem
 * repassa o payload inteiro (contrato de dono).
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "@iefa/sisub-domain/types"
import { requireAuth } from "./auth.server"
import { getDb } from "./db.server"
import { handleDomainError } from "./domain-errors"

export function requireAuthThenRun<TInput, TOutput>(
	operation: (db: SisubDb, ctx: UserContext, input: TInput) => Promise<TOutput>,
	guard: () => Promise<UserContext> = requireAuth
): (args: { data: TInput }) => Promise<TOutput> {
	return async ({ data }) => {
		// O guard fica fora do catch, como sempre esteve: 401/403 não viram erro de domínio.
		const ctx = await guard()
		try {
			// `getDb()` dentro: falha ao montar o pool (env ausente) também passa pela tradução.
			return await operation(getDb(), ctx, data)
		} catch (error) {
			return handleDomainError(error)
		}
	}
}
