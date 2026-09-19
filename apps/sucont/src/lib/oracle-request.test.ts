import { describe, expect, it } from "bun:test"
import { checkOracleRequestLimits, MAX_ORACLE_CONTEXT_CHARS, MAX_ORACLE_MESSAGES, MAX_ORACLE_MESSAGES_CHARS } from "#/lib/oracle-request"

const message = (content: string) => ({ role: "user", content })

describe("checkOracleRequestLimits", () => {
	it("aceita conversa e contexto dentro do teto", () => {
		const result = checkOracleRequestLimits([message("Qual ODS tem mais inconsistências?")], '{"totalInconsistencias":10}')
		expect(result).toEqual({ ok: true, contextSummary: '{"totalInconsistencias":10}' })
	})

	it("contexto ausente ou nulo vira undefined", () => {
		expect(checkOracleRequestLimits([], undefined)).toEqual({ ok: true, contextSummary: undefined })
		expect(checkOracleRequestLimits([], null)).toEqual({ ok: true, contextSummary: undefined })
	})

	it("recusa contexto que não é string com 400", () => {
		const result = checkOracleRequestLimits([], { injetado: true })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.status).toBe(400)
	})

	it("recusa mensagens demais com 413", () => {
		const messages = Array.from({ length: MAX_ORACLE_MESSAGES + 1 }, () => message("oi"))
		const result = checkOracleRequestLimits(messages, undefined)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.status).toBe(413)
	})

	it("recusa histórico grande demais com 413", () => {
		const result = checkOracleRequestLimits([message("x".repeat(MAX_ORACLE_MESSAGES_CHARS))], undefined)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.status).toBe(413)
	})

	it("recusa contexto grande demais com 413", () => {
		const result = checkOracleRequestLimits([], "x".repeat(MAX_ORACLE_CONTEXT_CHARS + 1))
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.status).toBe(413)
	})
})
