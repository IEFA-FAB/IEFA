import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
	answerValueSchema,
	isVersionCapReached,
	MAX_ANSWER_JSON_CHARS,
	MAX_ANSWER_TEXT_CHARS,
	MAX_OBSERVATION_CHARS,
	MAX_OM_CHARS,
	MAX_RESPONSE_VERSIONS,
	MAX_SECAO_CHARS,
	observationSchema,
	omInputSchema,
	secaoInputSchema,
	serializedLength,
} from "./response-limits"

describe("answerValueSchema", () => {
	test("aceita os formatos que a tela grava", () => {
		for (const value of ["texto", 3, true, null, ["a", "b"], "2026-10-01", { conformidade: "C" }]) {
			expect(answerValueSchema.safeParse(value).success).toBe(true)
		}
	})

	test("ausente vira null (pergunta limpa)", () => {
		expect(answerValueSchema.parse(undefined)).toBeNull()
	})

	test("recusa texto acima do teto", () => {
		expect(answerValueSchema.safeParse("x".repeat(MAX_ANSWER_TEXT_CHARS)).success).toBe(true)
		expect(answerValueSchema.safeParse("x".repeat(MAX_ANSWER_TEXT_CHARS + 1)).success).toBe(false)
	})

	test("recusa estrutura grande demais em JSON", () => {
		const many = Array.from({ length: MAX_ANSWER_JSON_CHARS / 4 }, () => "abcd")
		expect(serializedLength(many)).toBeGreaterThan(MAX_ANSWER_JSON_CHARS)
		expect(answerValueSchema.safeParse(many).success).toBe(false)
	})

	test("recusa o que não é JSON", () => {
		expect(answerValueSchema.safeParse(() => 1).success).toBe(false)
	})
})

describe("campos de texto da resposta", () => {
	test("observação tem teto e aceita null", () => {
		expect(observationSchema.safeParse(null).success).toBe(true)
		expect(observationSchema.safeParse("x".repeat(MAX_OBSERVATION_CHARS + 1)).success).toBe(false)
	})

	test("OM e seção: obrigatórias e com teto", () => {
		expect(omInputSchema.safeParse("   ").success).toBe(false)
		expect(omInputSchema.safeParse("x".repeat(MAX_OM_CHARS + 1)).success).toBe(false)
		expect(secaoInputSchema.safeParse("").success).toBe(false)
		expect(secaoInputSchema.safeParse("x".repeat(MAX_SECAO_CHARS + 1)).success).toBe(false)
		expect(secaoInputSchema.parse("  Seção  ")).toBe("Seção")
	})
})

describe("teto de versões", () => {
	test("conta a partir do current_version", () => {
		expect(isVersionCapReached(null)).toBe(false)
		expect(isVersionCapReached(MAX_RESPONSE_VERSIONS - 1)).toBe(false)
		expect(isVersionCapReached(MAX_RESPONSE_VERSIONS)).toBe(true)
	})
})

// Contrato textual: as server functions de escrita usam os tetos e o rate limit. Barato e pega
// quem reescreve o validator a partir de uma cópia antiga (`z.any()`).
describe("forms.fn.ts usa os tetos", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "forms.fn.ts"), "utf8")
	const block = (name: string) => {
		const start = source.indexOf(`export const ${name} =`)
		const end = source.indexOf("export const ", start + 1)
		return source.slice(start, end === -1 ? undefined : end)
	}

	test("saveAnswerFn", () => {
		const body = block("saveAnswerFn")
		expect(body).toContain("value: answerValueSchema")
		expect(body).toContain("observation: observationSchema")
		expect(body).toContain('enforceWriteRate(user.id, "answer")')
		expect(body).not.toContain("z.any()")
	})

	test("getOrCreateResponseSessionFn valida a OM contra om_option", () => {
		const body = block("getOrCreateResponseSessionFn")
		expect(body).toContain("om: omInputSchema")
		expect(body).toContain("secao: secaoInputSchema")
		expect(body).toContain("await resolveActiveOm(db, om)")
		expect(body).toContain('enforceWriteRate(user.id, "session")')
	})

	test("reabrir e enviar respeitam o teto de versões", () => {
		expect(block("reopenResponseFn")).toContain("isVersionCapReached(session.current_version)")
		expect(block("submitResponseFn")).toContain("versionNumber > MAX_RESPONSE_VERSIONS")
	})
})
