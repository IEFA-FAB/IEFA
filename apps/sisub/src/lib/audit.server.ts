/**
 * @module audit.server
 * Liga o envelope puro de `audit.ts` ao gravador real do domínio.
 *
 * `getDb()` é resolvido AQUI DENTRO, e não no chamador, por dois motivos: as fns
 * financeiras falam com o Supabase REST (`getServerClient`) e não teriam motivo para
 * conhecer o Drizzle; e o contrato `server-fn-auth` verifica que nenhum client de banco
 * é obtido antes do guard — mantendo a resolução aqui, instrumentar uma fn não mexe
 * nessa ordem.
 *
 * @domain app
 */

import { recordSensitiveOperation } from "@iefa/sisub-domain"
import type { UserContext } from "@iefa/sisub-domain/types"
import { type AuditTarget, withAudit } from "@/lib/audit"
import { getDb } from "@/lib/db.server"
import type { AssuranceOperationName } from "@/server/assurance-registry"

/**
 * Envolve o corpo de uma server function classificada: executa e, no sucesso, registra.
 *
 * O ator sai de `ctx` — o MESMO contexto que o guard autorizou. Não há parâmetro de
 * ator, então não existe forma de atribuir a execução a outra pessoa.
 *
 * ```ts
 * const ctx = await requireAuth()
 * return withSensitiveAudit("createUserPermissionFn", ctx, () => createUserPermission(getDb(), ctx, data), () => ({
 * 	userId: data.userId,
 * 	module: data.module,
 * 	level: data.level,
 * })).catch(handleDomainError)
 * ```
 */
export function withSensitiveAudit<T>(
	operation: AssuranceOperationName,
	ctx: UserContext,
	run: () => Promise<T>,
	target?: (result: T) => AuditTarget | undefined
): Promise<T> {
	return withAudit({
		operation,
		run,
		target,
		record: (entry) => recordSensitiveOperation(getDb(), ctx, entry),
	})
}
