import { QueryDeadlineError } from "@iefa/database/postgres-pool"
import { DomainError, QueryFailedError } from "@iefa/sisub-domain/types"
import { describe, expect, test } from "vitest"
import { isInfrastructureError } from "./infra-error"

/** Réplica do `DrizzleQueryError`: SQL na `message`, erro do driver em `.cause`, sem `code`. */
function drizzleQueryError(code: string | undefined, message = "x"): Error {
	const error = new Error("Failed query: select 1\nparams: ")
	error.name = "DrizzleQueryError"
	;(error as Error & { cause?: unknown }).cause = Object.assign(new Error(message), code === undefined ? {} : { code })
	return error
}

/** O que o `runQuery` lança: `code` do domínio no topo, o `DrizzleQueryError` em `cause`. */
function queryFailed(driverCode: string | undefined): QueryFailedError {
	return new QueryFailedError("FETCH_FAILED", "diagnóstico", "Não foi possível carregar.", drizzleQueryError(driverCode))
}

const INFRASTRUCTURE_CODES = [
	// postgres-js
	"CONNECT_TIMEOUT",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	// socket
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
	// SQLSTATE
	"08000",
	"08001",
	"08003",
	"08006",
	"08P01",
	"57P01",
	"57P02",
	"57P03",
	"57014",
	"53300",
	// prazo do postgres-pool
	"QUERY_DEADLINE",
]

const DATA_OR_PERMISSION_CODES = ["23505", "23503", "23514", "23502", "22P02", "42501", "42P01", "P0001", "40001", "40P01", "PGRST116", "08", "080", ""]

describe("isInfrastructureError", () => {
	test.each(INFRASTRUCTURE_CODES)("%s dentro do QueryFailedError é infraestrutura", (code) => {
		expect(isInfrastructureError(queryFailed(code))).toBe(true)
	})

	test.each(INFRASTRUCTURE_CODES)("%s cru (fora do runQuery) também", (code) => {
		expect(isInfrastructureError(Object.assign(new Error("x"), { code }))).toBe(true)
		expect(isInfrastructureError(drizzleQueryError(code))).toBe(true)
	})

	test.each(DATA_OR_PERMISSION_CODES)("%j não é infraestrutura", (code) => {
		expect(isInfrastructureError(queryFailed(code))).toBe(false)
	})

	test("o QueryDeadlineError do postgres-pool é infraestrutura", () => {
		expect(isInfrastructureError(new QueryDeadlineError("query", 45_000))).toBe(true)
	})

	test("sem código na cadeia, ou valor que não é objeto: não é", () => {
		expect(isInfrastructureError(queryFailed(undefined))).toBe(false)
		expect(isInfrastructureError(new Error("Erro ao salvar: o banco não respondeu; tente de novo"))).toBe(false)
		expect(isInfrastructureError("CONNECT_TIMEOUT")).toBe(false)
		expect(isInfrastructureError(null)).toBe(false)
	})

	test("o code de um DomainError não conta, mesmo que pareça de infraestrutura", () => {
		expect(isInfrastructureError(new DomainError("CONNECT_TIMEOUT", "regra"))).toBe(false)
		expect(isInfrastructureError(new QueryFailedError("ECONNRESET", "diagnóstico"))).toBe(false)
	})

	test("cadeia de cause circular termina", () => {
		const a = new Error("a") as Error & { cause?: unknown }
		const b = new Error("b") as Error & { cause?: unknown }
		a.cause = b
		b.cause = a
		expect(isInfrastructureError(a)).toBe(false)
	})
})
