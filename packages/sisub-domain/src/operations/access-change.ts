/**
 * Ponte entre as operações de acesso do sisub e as funções SQL AUDITADAS
 * (migration 20260921130000).
 *
 * ## Por que a escrita saiu do Drizzle
 *
 * Toda concessão, alteração ou revogação de acesso grava a mudança E a linha de
 * `access_control.sensitive_operation_log` na MESMA transação, dentro de uma função SQL. Antes,
 * o envelope `withSensitiveAudit` gravava o log DEPOIS, em outra instrução: se o log falhava, o
 * acesso já estava concedido e sem rastro. Desde 20260921130100 o banco RECUSA (42501
 * `ACCESS_CHANGE_UNAUDITED`) escrita direta em `user_permissions`, `policy`,
 * `policy_statement`, `user_policy_attachment` e `mcp_api_keys` — então não há volta: um
 * `db.insert(userPermissionsInAccessControl)` novo falha em produção (e a regra opengrep
 * `access-table-direct-write` o pega antes).
 *
 * ## O ator sai da sessão
 *
 * `ctx.userId` — o mesmo contexto que o guard autorizou. Nenhuma operação daqui aceita ator
 * por parâmetro: a função SQL grava o ator que receber, e aceitar um id do chamador deixaria
 * qualquer administrador assinar a concessão em nome de outro.
 *
 * ## O que o log registra
 *
 * `audit.operation` é o nome que vai para `sensitive_operation_log.operation` — o nome da
 * server function no sisub (`createUserPermissionFn`), para a trilha casar com o registro de
 * classificação. `audit.grade` é o grau com que a operação está classificada (`fresh` para
 * permissões e políticas); a coluna só aceita `session`/`fresh`.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { assertGrantable, GrantNotAllowedError } from "@iefa/pbac"
import { type SQL, sql } from "drizzle-orm"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { describeDriverError, unwrapPgError } from "../utils/index.ts"

/** Grau registrado no log. `none` não existe aqui: a coluna só aceita os dois. */
export type AuditGrade = "session" | "fresh"

/** O nome e o grau com que a mudança de acesso entra no log. */
export type AccessAudit = { operation: string; grade: AuditGrade }

/** Default para quem chama a operação fora de uma server function (testes, scripts). */
export function defaultAccessAudit(operation: string): AccessAudit {
	return { operation, grade: "session" }
}

/**
 * Tokens estáveis que as funções SQL levantam → erro de domínio legível. O SQL cru nunca
 * chega à tela: vai em `details`, para o log do servidor.
 */
const ACCESS_ERRORS: Record<string, { code: string; message: string; notFound?: string }> = {
	ACCESS_CHANGE_INVALID: { code: "INVALID_INPUT", message: "Alteração de acesso inválida." },
	ACCESS_ACTOR_NOT_FOUND: {
		code: "ACTOR_NOT_FOUND",
		message: "Sua conta não foi encontrada no cadastro de usuários; a alteração não foi feita.",
	},
	ACCESS_CHANGE_UNAUDITED: {
		code: "ACCESS_CHANGE_UNAUDITED",
		message: "O banco recusou uma alteração de acesso fora do caminho auditado. Nada foi gravado — avise a administração do sistema.",
	},
	PERMISSION_REFERENCE_NOT_FOUND: { code: "REFERENCE_NOT_FOUND", message: "Usuário ou escopo (OM, cozinha, refeitório) inexistente." },
	PERMISSION_CONFLICT: { code: "CONFLICT", message: "Outra alteração no mesmo acesso aconteceu ao mesmo tempo. Tente de novo." },
	POLICY_MANAGED: { code: "POLICY_MANAGED", message: "Política gerenciada pelo sistema não pode ser alterada." },
	POLICY_NOT_DELETED: { code: "POLICY_NOT_DELETED", message: "A política não está removida." },
	POLICY_NAME_TAKEN: { code: "POLICY_NAME_TAKEN", message: "Já existe uma política ativa com este nome." },
	PERMISSION_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "permission" },
	POLICY_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "policy" },
	STATEMENT_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "policy_statement" },
	ATTACHMENT_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "attachment" },
	MCP_KEY_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "mcp_api_key" },
}

/**
 * Traduz o erro da função SQL. `overrides` troca a mensagem de um token específico (o
 * `PERMISSION_ALREADY_EXISTS` do create e do update dizem coisas diferentes, por exemplo);
 * `notFoundId` entra no `NotFoundError`; `fallbackCode` é o código da falha fora do contrato
 * (queda de conexão, por exemplo) — `INSERT_FAILED`/`UPDATE_FAILED`/`DELETE_FAILED`, como antes.
 */
export function toAccessDomainError(
	error: unknown,
	options: { overrides?: Record<string, DomainError>; notFoundId?: string; fallbackCode?: string } = {}
): DomainError {
	if (error instanceof DomainError) return error
	const pg = unwrapPgError(error)
	const token = pg.message ?? ""
	const override = options.overrides?.[token]
	if (override) return override
	const known = ACCESS_ERRORS[token]
	if (known?.notFound) return new NotFoundError(known.notFound, options.notFoundId ?? "?")
	if (known) return new DomainError(known.code, known.message, describeDriverError(error))
	// Falha que não é do contrato (conexão, timeout): o código do chamador, com a CAUSA do driver
	// — `DrizzleQueryError.message` é só o SQL.
	return new DomainError(options.fallbackCode ?? "ACCESS_CHANGE_FAILED", describeDriverError(error))
}

/**
 * Executa UMA função auditada e devolve o `jsonb` dela. Uma instrução em autocommit: a
 * função é a transação — mudança e log entram juntos ou nenhum entra.
 */
export async function runAccessFunction<T extends Record<string, unknown>>(
	db: SisubDb,
	call: SQL,
	errors: Parameters<typeof toAccessDomainError>[1] = {}
): Promise<T> {
	let rows: unknown
	try {
		rows = await db.execute(sql`select ${call} as result`)
	} catch (error) {
		throw toAccessDomainError(error, errors)
	}
	const raw = (rows as unknown as Array<{ result: unknown }>)[0]?.result
	// O driver devolve `jsonb` já decodificado; texto só se um parser de tipo for trocado.
	const result = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw
	if (!result || typeof result !== "object") throw new DomainError("ACCESS_CHANGE_FAILED", "A função de acesso não devolveu resultado.")
	return result as T
}

/**
 * Regra de autoconcessão do mantenedor aplicada ao sisub, pela mesma função do @iefa/pbac que
 * os outros apps usam. A administração do sisub (`admin`) é global (o guard é `admin:2` sem
 * escopo), então todo administrador é administrador GLOBAL: pode conceder a si mesmo — o log
 * registra ator e alvo iguais —, mas NINGUÉM retira a própria administração.
 */
export function assertSisubGrantable(actorId: string, target: { userId: string; revokesAdministration: boolean }): void {
	try {
		// `unitId` só pesa para administrador escopado; aqui a cobertura é "all".
		assertGrantable({ actorId, coverage: "all" }, { userId: target.userId, unitId: null, revokesAdministration: target.revokesAdministration })
	} catch (error) {
		if (error instanceof GrantNotAllowedError) throw new DomainError("GRANT_NOT_ALLOWED", error.message)
		throw error
	}
}
