/**
 * @module domain-handler.server
 * Handler das server functions que só repassam a uma operation de `@iefa/sisub-domain`.
 *
 * 176 server fns repetiam as mesmas quatro linhas: `requireAuth()`, `getDb()`, a operation e
 * `.catch(handleDomainError)`. A autorização de verdade (módulo, nível, escopo) mora na
 * operation, que recebe o `ctx` da sessão; aqui fica só a autenticação e a tradução do erro.
 *
 *   export const fetchMealTypesFn = createServerFn({ method: "GET" })
 *     .validator(FetchMealTypesSchema)
 *     .handler(requireAuthThenRun(fetchMealTypes))
 *
 * O nome começa por `require`: os contratos de `server-fn-auth.contract.test.ts` contam a
 * chamada como guard de autenticação, e o corpo da fn passa a citar a operation pelo nome,
 * que é como o contrato de dono a acha.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "@iefa/sisub-domain/types"
import { requireAuth } from "./auth.server"
import { getDb } from "./db.server"
import { handleDomainError } from "./domain-errors"

export function requireAuthThenRun<TInput, TOutput>(
	operation: (db: SisubDb, ctx: UserContext, input: TInput) => Promise<TOutput>
): (args: { data: TInput }) => Promise<TOutput> {
	return async ({ data }) => {
		const ctx = await requireAuth()
		return operation(getDb(), ctx, data).catch(handleDomainError)
	}
}
