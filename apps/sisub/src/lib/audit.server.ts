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

import type { AssuranceRequirement } from "@iefa/pbac"
import { type AccessAudit, recordSensitiveOperation } from "@iefa/sisub-domain"
import type { UserContext } from "@iefa/sisub-domain/types"
import { type AuditTarget, atomicAuditFor, withAudit } from "@/lib/audit"
import { getDb } from "@/lib/db.server"
import { type AssuranceOperationName, enforcedAssuranceFor } from "@/server/assurance-registry"

/**
 * Envolve o corpo de uma server function classificada: executa e, no sucesso, registra.
 *
 * O ator sai de `ctx` — o MESMO contexto que o guard autorizou. Não há parâmetro de
 * ator, então não existe forma de atribuir a execução a outra pessoa.
 *
 * ## O piso de garantia viaja junto, e pelo MESMO nome
 *
 * `run` recebe o piso que o registro declara para esta operação (`enforcedAssuranceFor`), para
 * repassá-lo ao guard da domain operation. Derivá-lo aqui — do mesmo literal que já nomeia a
 * linha de auditoria — é o que impede o par (operação auditada, operação protegida) de
 * divergir: um nome só, resolvido uma vez, sem grau redigitado no ponto de chamada.
 *
 * Enquanto a chave de `ASSURANCE_ENFORCEMENT` estiver desligada, o valor entregue é
 * `{ require: "none" }` e o guard é um no-op — a inércia da etapa 4.
 *
 * ```ts
 * const ctx = await requireAuth()
 * return withSensitiveAudit(
 * 	"createUserPermissionFn",
 * 	ctx,
 * 	(assurance) => createUserPermission(getDb(), ctx, data, assurance),
 * 	() => ({ userId: data.userId, module: data.module, level: data.level })
 * ).catch(handleDomainError)
 * ```
 */
export function withSensitiveAudit<T>(
	operation: AssuranceOperationName,
	ctx: UserContext,
	run: (assurance: AssuranceRequirement) => Promise<T>,
	target?: (result: T) => AuditTarget | undefined
): Promise<T> {
	return withAudit({
		operation,
		run: () => run(enforcedAssuranceFor(operation)),
		target,
		record: (entry) => recordSensitiveOperation(getDb(), ctx, entry),
	})
}

/**
 * Envelope das mudanças de ACESSO (permissões, políticas, anexos, chaves MCP): a operação de
 * domínio chama uma função SQL que grava a mudança E a linha de auditoria na MESMA transação
 * (migration 20260921120000). Este envelope NÃO grava nada — gravar aqui duplicaria a linha, e
 * gravar DEPOIS era exatamente o defeito: log que falha com o acesso já concedido.
 *
 * O que ele faz é o que o `withSensitiveAudit` faz ANTES de rodar: resolve o nome no registro
 * (nome errado falha antes da escrita), entrega o piso de garantia ao guard da operação e o
 * par (nome, grau) com que a função SQL registra. O ator não passa por aqui: a operação de
 * domínio o tira do MESMO `ctx` que o guard autorizou.
 *
 * ```ts
 * const ctx = await requireAuth()
 * return withAtomicAudit("createUserPermissionFn", ({ assurance, audit }) =>
 * 	createUserPermission(getDb(), ctx, data, assurance, audit)
 * ).catch(handleDomainError)
 * ```
 */
export function withAtomicAudit<T>(
	operation: AssuranceOperationName,
	run: (context: { assurance: AssuranceRequirement; audit: AccessAudit }) => Promise<T>
): Promise<T> {
	let audit: AccessAudit
	try {
		audit = atomicAuditFor(operation)
	} catch (error) {
		return Promise.reject(error)
	}
	return run({ assurance: enforcedAssuranceFor(operation), audit })
}
