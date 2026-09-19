import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantNotAllowedError } from "@iefa/pbac"
import { assertJournalRoleChangeAllowed, planProfileSave, splitRoleFromProfilePayload, toJournalRoleError } from "./role-change"

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

describe("planProfileSave", () => {
	test("o papel que a pessoa JÁ tem não é troca — o formulário o reenvia a cada gravação", () => {
		expect(planProfileSave({ id: "x", role: "author", bio: "b" }, "author")).toEqual({ fields: { bio: "b" }, role: undefined })
		expect(planProfileSave({ role: "editor", bio: "b" }, "editor")).toEqual({ fields: { bio: "b" }, role: undefined })
	})

	test("perfil inexistente nasce author: pedir author não é troca, pedir editor é", () => {
		expect(planProfileSave({ role: "author", full_name: "A" }, null).role).toBeUndefined()
		expect(planProfileSave({ role: "editor", full_name: "A" }, null).role).toBe("editor")
	})

	test("`id` e `role` nunca vão nos campos — o alvo não vem do payload", () => {
		const { fields } = planProfileSave({ id: "outro", role: "reviewer", full_name: "A" }, "author")
		expect(fields).toEqual({ full_name: "A" })
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
 * auditada, com o ator da sessão. O banco recusa a troca de papel fora dela desde 20260921130100.
 */
/**
 * Contrato do servidor: campos e papel são UMA gravação (`save_user_profile`), e a troca de papel
 * é autorizada ANTES dela — recusada a troca, nada é gravado, nem o nome.
 */
describe("journal-data.fn.ts — perfil e papel numa transação, autorizados antes", () => {
	const source = readFileSync(join(import.meta.dir, "..", "..", "server", "journal-data.fn.ts"), "utf8")

	test.each(["createUserProfileFn", "updateUserProfileFn", "upsertUserProfileFn"])("%s grava pelo save_user_profile, sem escrita direta de perfil", (fn) => {
		const start = source.indexOf(`export const ${fn} =`)
		const next = source.indexOf("export const ", start + 1)
		const body = source.slice(start, next)
		expect(body).toContain("saveJournalProfile(userId,")
		expect(body).not.toMatch(/from\("user_profiles"\)\s*\.(insert|update|upsert)\(/)
	})

	test("a autorização da troca vem antes da única escrita", () => {
		const start = source.indexOf("async function saveJournalProfile(")
		const body = source.slice(start, source.indexOf("\n}\n", start))
		const authz = Math.max(body.indexOf("assertRoleChangeAllowed("), body.indexOf("assertJournalRoleChangeAllowed("))
		const write = body.indexOf('rpc("save_user_profile"')
		expect(authz).toBeGreaterThan(-1)
		expect(write).toBeGreaterThan(authz)
	})
})
