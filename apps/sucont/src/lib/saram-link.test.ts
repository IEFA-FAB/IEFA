import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SARAM_LINK_FALLBACK_MESSAGE, saramLinkErrorMessage } from "#/lib/saram-link"

describe("saramLinkErrorMessage", () => {
	test.each([
		["SARAM_LOCKED", "O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure a administração do sistema."],
		["SARAM_TAKEN", "Este SARAM já está vinculado a outra conta. Se ele é seu, procure a administração do sistema."],
		["EMAIL_TAKEN", "Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT."],
		["USER_DATA_NOT_FOUND", "Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT."],
	])("%p vira frase para a tela", (token, expected) => {
		expect(saramLinkErrorMessage(token)).toBe(expected)
	})

	test("falha fora do contrato não vai crua para a tela", () => {
		expect(saramLinkErrorMessage("connection terminated unexpectedly")).toBe(SARAM_LINK_FALLBACK_MESSAGE)
		expect(saramLinkErrorMessage(null)).toBe(SARAM_LINK_FALLBACK_MESSAGE)
	})
})

/**
 * O vínculo de SARAM do sucont passa pelas travas do sisub (write-once, exclusivo, lock), no
 * banco — e só para quem tem acesso ao app. Lido do fonte porque a fn só roda no Nitro.
 */
describe("saveMySaramFn", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "user.fn.ts"), "utf8")
	const body = source.slice(source.indexOf("export const saveMySaramFn"))

	test("exige acesso ao app antes de tocar o banco", () => {
		const gate = body.indexOf("await requireSucontApp()")
		expect(gate).toBeGreaterThan(-1)
		expect(gate).toBeLessThan(body.indexOf("getCoreClient()"))
	})

	test("grava pela função com as travas, nunca direto em user_data", () => {
		expect(body).toContain('rpc("link_own_saram", { p_user: user.id,')
		expect(body).not.toMatch(/\.from\("user_data"\)\.(upsert|update|insert)/)
	})

	test("identidade da sessão, não do payload: o validator só aceita o número", () => {
		expect(body).toContain('.validator(z.object({ saram: z.string().regex(/^\\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.") }))')
	})
})
