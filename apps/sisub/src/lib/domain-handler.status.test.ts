/**
 * Status HTTP de uma server fn que repassa a uma operation (`requireAuthThenRun`), com o
 * `handleDomainError` e o `runQuery` de verdade: só a sessão, o banco e o `setResponseStatus`
 * são falsos. A tradução isolada está em `domain-errors.test.ts`; aqui é o caminho inteiro do
 * erro do driver até o status que a fn devolve.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { revokeMcpApiKey } from "@iefa/sisub-domain/operations"
import type { UserContext } from "@iefa/sisub-domain/types"
import { GENERIC_DB_ERROR_MESSAGE, PermissionDeniedError } from "@iefa/sisub-domain/types"
import { runQuery } from "@iefa/sisub-domain/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

const setResponseStatus = vi.fn()
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: (code: number) => setResponseStatus(code) }))
vi.mock("./auth.server", () => ({ requireAuth: async () => ({ userId: "u1" }) }))
vi.mock("./db.server", () => ({ getDb: () => ({}) }))

const { requireAuthThenRun } = await import("./domain-handler.server")
const { INFRASTRUCTURE_ERROR_MESSAGE, STATEMENT_TIMEOUT_MESSAGE } = await import("./domain-errors")

/** Réplica do `DrizzleQueryError` que o drizzle lança: SQL na `message`, driver em `.cause`. */
function drizzleQueryError(code: string, message: string): Error {
	const error = new Error("Failed query: select * from kitchen.meal_type\nparams: ")
	error.name = "DrizzleQueryError"
	;(error as Error & { cause?: unknown }).cause = Object.assign(new Error(message), { code })
	return error
}

/** Operation como as do domínio: a query passa pelo `runQuery`, que a embrulha em `QueryFailedError`. */
function operationFailingWith(error: unknown) {
	return (_db: SisubDb, _ctx: UserContext, _input: Record<string, never>) => runQuery("FETCH_FAILED", () => Promise.reject(error))
}

async function statusOf(operation: (db: SisubDb, ctx: UserContext, input: Record<string, never>) => Promise<unknown>) {
	const error = await requireAuthThenRun(operation)({ data: {} }).then(
		() => null,
		(e: Error) => e
	)
	return { status: setResponseStatus.mock.lastCall?.[0] as number | undefined, message: error?.message }
}

describe("server fn com requireAuthThenRun: status do erro", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => {
		setResponseStatus.mockClear()
		consoleError.mockClear()
	})

	test.each([
		["CONNECT_TIMEOUT", "write CONNECT_TIMEOUT aws-0-sa-east-1.pooler.supabase.com:6543"],
		["CONNECTION_ENDED", "write CONNECTION_ENDED"],
		["ECONNRESET", "read ECONNRESET"],
		["08006", "connection failure"],
		["57P03", "the database system is starting up"],
		["XX000", "(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 5000ms in Transaction mode"],
		["EAI_AGAIN", "getaddrinfo EAI_AGAIN aws-0-sa-east-1.pooler.supabase.com"],
		["QUERY_DEADLINE", "query passou de 45s em execução sem resposta do banco"],
	])("%s: 503 e a mensagem de indisponibilidade", async (code, message) => {
		expect(await statusOf(operationFailingWith(drizzleQueryError(code, message)))).toEqual({ status: 503, message: INFRASTRUCTURE_ERROR_MESSAGE })
	})

	test("statement_timeout da consulta pesada: 400 com a mensagem própria", async () => {
		const result = await statusOf(operationFailingWith(drizzleQueryError("57014", "canceling statement due to statement timeout")))
		expect(result).toEqual({ status: 400, message: STATEMENT_TIMEOUT_MESSAGE })
	})

	test("violação de constraint: 400 com a mensagem pública do runQuery", async () => {
		const result = await statusOf(operationFailingWith(drizzleQueryError("23505", "duplicate key value violates unique constraint")))
		expect(result.status).toBe(400)
		expect(result.message).not.toBe(INFRASTRUCTURE_ERROR_MESSAGE)
		expect(result.message).not.toContain("Failed query")
	})

	test("mudança de acesso (função auditada) com queda de conexão: 503, sem SQL, parâmetros nem host", async () => {
		const db = { execute: () => Promise.reject(drizzleQueryError("CONNECTION_CLOSED", "write CONNECTION_CLOSED aws-0-sa-east-1.pooler.supabase.com:6543")) }
		const result = await statusOf((_db, ctx) => revokeMcpApiKey(db as unknown as SisubDb, ctx, { id: "00000000-0000-0000-0000-000000000001" }))
		expect(result).toEqual({ status: 503, message: INFRASTRUCTURE_ERROR_MESSAGE })
	})

	test("mudança de acesso com falha fora do contrato que não é de conexão: 400 com a mensagem genérica", async () => {
		const db = { execute: () => Promise.reject(drizzleQueryError("XX000", "could not open relation with OID 1234")) }
		const result = await statusOf((_db, ctx) => revokeMcpApiKey(db as unknown as SisubDb, ctx, { id: "00000000-0000-0000-0000-000000000001" }))
		expect(result).toEqual({ status: 400, message: GENERIC_DB_ERROR_MESSAGE })
	})

	test("permissão negada na operation: 403", async () => {
		const result = await statusOf(async () => {
			throw new PermissionDeniedError("kitchen", 2)
		})
		expect(result).toEqual({ status: 403, message: "Requires kitchen level 2" })
	})
})
