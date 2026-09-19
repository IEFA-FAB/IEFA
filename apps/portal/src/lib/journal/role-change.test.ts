import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantNotAllowedError } from "@iefa/pbac"
import { assertJournalRoleChangeAllowed, splitRoleFromProfilePayload, toJournalRoleError } from "./role-change"

describe("splitRoleFromProfilePayload", () => {
	test("sem role: nada a trocar, o resto segue intacto", () => {
		expect(splitRoleFromProfilePayload({ full_name: "A", bio: "b" })).toEqual({ role: undefined, rest: { full_name: "A", bio: "b" } })
	})

	test("com role válido: separa, e o resto NÃO carrega role (o banco o recusaria no update)", () => {
		const { role, rest } = splitRoleFromProfilePayload({ role: "reviewer", full_name: "A" })
		expect(role).toBe("reviewer")
		expect(rest).toEqual({ full_name: "A" })
		expect("role" in rest).toBe(false)
	})

	test("papel fora dos três é recusado com frase", () => {
		expect(() => splitRoleFromProfilePayload({ role: "admin" })).toThrow(/Papel inválido/)
	})
})

describe("assertJournalRoleChangeAllowed", () => {
	test("editor troca o papel de outra pessoa, em qualquer direção", () => {
		expect(() => assertJournalRoleChangeAllowed("a", "b", "author")).not.toThrow()
		expect(() => assertJournalRoleChangeAllowed("a", "b", "editor")).not.toThrow()
	})

	test("ninguém retira a própria função de editor; manter a própria passa", () => {
		expect(() => assertJournalRoleChangeAllowed("a", "a", "reviewer")).toThrow(GrantNotAllowedError)
		expect(() => assertJournalRoleChangeAllowed("a", "a", "author")).toThrow(GrantNotAllowedError)
		expect(() => assertJournalRoleChangeAllowed("a", "a", "editor")).not.toThrow()
	})
})

test("toJournalRoleError não vaza SQL", () => {
	expect(toJournalRoleError({ message: "PROFILE_NOT_FOUND" }).message).toBe("Perfil do journal não encontrado.")
	expect(toJournalRoleError({ message: "syntax error at or near" }).message).not.toContain("syntax")
})

/**
 * Contrato do servidor: `role` nunca vai numa escrita comum de perfil — só pela função
 * auditada, com o ator da sessão. O banco recusa a troca de papel fora dela desde 20260921120100.
 */
describe("journal-data.fn.ts — papel só pela função auditada", () => {
	const source = readFileSync(join(import.meta.dir, "..", "..", "server", "journal-data.fn.ts"), "utf8")

	test.each(["createUserProfileFn", "updateUserProfileFn", "upsertUserProfileFn"])("%s separa o papel antes de escrever", (fn) => {
		const start = source.indexOf(`export const ${fn} =`)
		const next = source.indexOf("export const ", start + 1)
		const body = source.slice(start, next)
		expect(body).toContain("splitRoleFromProfilePayload(")
		expect(body).toContain("changeJournalRole(userId,")
		// A escrita comum recebe `rest`, nunca o payload cru com `role`.
		expect(body).not.toMatch(/\.(insert|update|upsert)\(\{?\s*\.\.\.data\b|\.update\(data\.updates\)/)
	})

	test("a troca chama a função auditada com o ator da sessão", () => {
		expect(source).toContain('rpc("change_user_role", { p_actor: actorId')
	})
})
