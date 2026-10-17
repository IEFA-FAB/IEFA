import { QueryDeadlineError } from "@iefa/database/postgres-pool"
import { DomainError, QueryFailedError } from "@iefa/sisub-domain/types"
import { describe, expect, test } from "vitest"
import { isInfrastructureError, isStatementTimeout } from "./infra-error"

/** Réplica do `DrizzleQueryError`: SQL na `message`, erro do driver em `.cause`, sem `code`. */
function drizzleQueryError(code: string | undefined, message = "x"): Error {
	const error = new Error("Failed query: select 1\nparams: ")
	error.name = "DrizzleQueryError"
	;(error as Error & { cause?: unknown }).cause = Object.assign(new Error(message), code === undefined ? {} : { code })
	return error
}

/** O que o `runQuery` lança: `code` do domínio no topo, o `DrizzleQueryError` em `cause`. */
function queryFailed(driverCode: string | undefined, message = "x"): QueryFailedError {
	return new QueryFailedError("FETCH_FAILED", "diagnóstico", "Não foi possível carregar.", drizzleQueryError(driverCode, message))
}

const INFRASTRUCTURE_CODES = [
	// postgres-js
	"CONNECT_TIMEOUT",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	// socket, rede e DNS
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"ECONNABORTED",
	// SQLSTATE
	"08000",
	"08001",
	"08003",
	"08006",
	"08P01",
	"57P01",
	"57P02",
	"57P03",
	"53300",
	// prazo do postgres-pool
	"QUERY_DEADLINE",
]

const NOT_INFRASTRUCTURE_CODES = [
	"23505",
	"23503",
	"23514",
	"23502",
	"22P02",
	"42501",
	"42P01",
	"P0001",
	"40001",
	"40P01",
	"PGRST116",
	"57014",
	"XX000",
	// `CONNECTION_*` fora dos três do postgres-js não conta
	"CONNECTION_REFUSED",
	"CONNECTION_LOST",
	// classe 08 só com SQLSTATE de 5 caracteres
	"08",
	"080",
	"0800",
	"080000",
	"",
]

/** Prefixos reais do Supavisor (`lib/supavisor/errors/*.ex`), sempre com SQLSTATE `XX000`. */
const SUPAVISOR_OVERLOAD_MESSAGES = [
	"(EMAXCONN) max client connections reached, limit: 200",
	"(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
	"(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 5000ms in Transaction mode",
	"(EPOOLCHECKOUT) pool checkout failed: :noproc",
	"(ECHECKOUTRETRIES) checkout retries exhausted",
	"(EMAXPOOLSREACHED) max pools reached",
	"(EDBHANDLEREXITED) DbHandler exited",
	"(EPROXYSUPERVISORUNAVAILABLE) proxy supervisor unavailable after retries",
	"(EPROXYSTARTFAILED) failed to start proxy connection",
	"(EWORKERNOTFOUND) worker not found",
	"(ECIRCUITBREAKER) too many failed attempts",
	"(EPOOLCONFIGNOTFOUND) pool config not found",
	"(EPOOLRANCHNOTFOUND) pool ranch not found",
]

describe("isInfrastructureError", () => {
	test.each(INFRASTRUCTURE_CODES)("%s dentro do QueryFailedError é infraestrutura", (code) => {
		expect(isInfrastructureError(queryFailed(code))).toBe(true)
	})

	test.each(INFRASTRUCTURE_CODES)("%s cru (fora do runQuery) também", (code) => {
		expect(isInfrastructureError(Object.assign(new Error("x"), { code }))).toBe(true)
		expect(isInfrastructureError(drizzleQueryError(code))).toBe(true)
	})

	test.each(NOT_INFRASTRUCTURE_CODES)("%j não é infraestrutura", (code) => {
		expect(isInfrastructureError(queryFailed(code))).toBe(false)
		expect(isInfrastructureError(Object.assign(new Error("x"), { code }))).toBe(false)
	})

	test.each(SUPAVISOR_OVERLOAD_MESSAGES)("pooler sem vaga (XX000 do Supavisor): %s", (message) => {
		expect(isInfrastructureError(queryFailed("XX000", message))).toBe(true)
	})

	test("XX000 sem o prefixo do Supavisor é erro interno do Postgres, não infraestrutura", () => {
		expect(isInfrastructureError(queryFailed("XX000", "could not open relation with OID 1234"))).toBe(false)
		expect(isInfrastructureError(queryFailed("XX000", "falhou (EMAXCONN) no meio"))).toBe(false)
		expect(isInfrastructureError(queryFailed("XX000", "(EMAXCONN)sem espaço"))).toBe(false)
		expect(isInfrastructureError(queryFailed("XX000", "(Emaxconn) minúsculo"))).toBe(false)
		expect(isInfrastructureError(queryFailed("P0001", "(EMAXCONN) texto de RAISE"))).toBe(false)
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
		const business = new DomainError("STOCK_CLOSED", "O estoque está fechado")
		Object.defineProperty(business, "cause", { value: Object.assign(new Error("x"), { code: "ECONNRESET" }) })
		expect(isInfrastructureError(business)).toBe(false)
	})

	test("cadeia de cause circular termina", () => {
		const a = new Error("a") as Error & { cause?: unknown }
		const b = new Error("b") as Error & { cause?: unknown }
		a.cause = b
		b.cause = a
		expect(isInfrastructureError(a)).toBe(false)
	})
})

describe("isStatementTimeout", () => {
	test("57014 no QueryFailedError ou cru", () => {
		expect(isStatementTimeout(queryFailed("57014", "canceling statement due to statement timeout"))).toBe(true)
		expect(isStatementTimeout(drizzleQueryError("57014"))).toBe(true)
	})

	test("outros códigos e DomainError de negócio, não", () => {
		expect(isStatementTimeout(queryFailed("QUERY_DEADLINE"))).toBe(false)
		expect(isStatementTimeout(queryFailed("23505"))).toBe(false)
		expect(isStatementTimeout(new DomainError("57014", "regra"))).toBe(false)
	})
})
