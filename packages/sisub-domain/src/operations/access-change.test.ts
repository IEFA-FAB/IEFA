/**
 * A ponte com as funções SQL auditadas (20260921120000): tradução dos tokens estáveis em erro
 * de domínio legível, e a leitura do `jsonb` devolvido.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { sql } from "drizzle-orm"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { assertSisubGrantable, defaultAccessAudit, runAccessFunction, toAccessDomainError } from "./access-change.ts"

/** Como o erro chega do driver: o drizzle embrulha e o Postgres fica em `.cause`. */
function fromFunction(token: string, code: string): Error {
	return Object.assign(new Error("Failed query: select access_control.x(...)"), { cause: { code, message: token } })
}

describe("toAccessDomainError", () => {
	test("token conhecido vira código e frase estáveis — sem SQL na mensagem", () => {
		const error = toAccessDomainError(fromFunction("ACCESS_ACTOR_NOT_FOUND", "23503"))
		expect(error.code).toBe("ACTOR_NOT_FOUND")
		expect(error.message).not.toContain("Failed query")
	})

	test("não encontrado vira NotFoundError (404) com o id pedido", () => {
		const error = toAccessDomainError(fromFunction("POLICY_NOT_FOUND", "P0002"), { notFoundId: "pol-1" })
		expect(error).toBeInstanceOf(NotFoundError)
		expect(error.message).toContain("pol-1")
	})

	test("override troca a frase do token para o contexto de quem chama", () => {
		const override = new DomainError("PERMISSION_ALREADY_EXISTS", "edite a existente")
		expect(toAccessDomainError(fromFunction("PERMISSION_ALREADY_EXISTS", "23505"), { overrides: { PERMISSION_ALREADY_EXISTS: override } })).toBe(override)
	})

	test("a recusa do trigger (escrita sem auditoria) é nomeada, não um 500 genérico", () => {
		expect(toAccessDomainError(fromFunction("ACCESS_CHANGE_UNAUDITED", "42501")).code).toBe("ACCESS_CHANGE_UNAUDITED")
	})

	test("falha fora do contrato usa o código do chamador e preserva a causa do driver", () => {
		const error = toAccessDomainError(Object.assign(new Error("Failed query"), { cause: { code: "CONNECT_TIMEOUT", message: "timeout" } }), {
			fallbackCode: "UPDATE_FAILED",
		})
		expect(error.code).toBe("UPDATE_FAILED")
		expect(error.message).toContain("CONNECT_TIMEOUT")
	})

	test("DomainError já pronto passa intacto", () => {
		const original = new DomainError("X", "y")
		expect(toAccessDomainError(original)).toBe(original)
	})
})

describe("runAccessFunction", () => {
	const stub = (rows: unknown) => ({ execute: () => Promise.resolve(rows) }) as unknown as SisubDb

	test("devolve o jsonb decodificado — e decodifica se vier como texto", async () => {
		expect(await runAccessFunction(stub([{ result: { log_id: "a" } }]), sql`f()`)).toEqual({ log_id: "a" })
		expect(await runAccessFunction(stub([{ result: '{"log_id":"b"}' }]), sql`f()`)).toEqual({ log_id: "b" })
	})

	test("sem resultado não é sucesso: não há log_id que prove a gravação", async () => {
		await expect(runAccessFunction(stub([]), sql`f()`)).rejects.toBeInstanceOf(DomainError)
		await expect(runAccessFunction(stub([{ result: null }]), sql`f()`)).rejects.toBeInstanceOf(DomainError)
	})
})

describe("assertSisubGrantable", () => {
	test("o administrador (global) pode conceder a si mesmo, mas não retirar a própria administração", () => {
		expect(() => assertSisubGrantable("a", { userId: "a", revokesAdministration: false })).not.toThrow()
		expect(() => assertSisubGrantable("a", { userId: "b", revokesAdministration: true })).not.toThrow()
		expect(() => assertSisubGrantable("a", { userId: "a", revokesAdministration: true })).toThrow(DomainError)
	})
})

test("defaultAccessAudit registra com grau session", () => {
	expect(defaultAccessAudit("createPolicy")).toEqual({ operation: "createPolicy", grade: "session" })
})
