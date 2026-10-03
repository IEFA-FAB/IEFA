import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { identityFromSaramStatus, isSaramClaimPending, SARAM_LINK_FALLBACK_MESSAGE, saramLinkErrorMessage, saramStatusNeedsAction } from "#/lib/saram-link"

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

	test("grava pela função verificada, com a sessão, nunca direto em user_data", () => {
		expect(body).toContain('rpc("claim_saram", { ...sessionArgs(user), p_saram: data.saram })')
		expect(body).not.toMatch(/\.from\("user_data"\)\.(upsert|update|insert)/)
		expect(body).not.toContain("link_own_saram")
	})

	test("identidade da sessão, não do payload: o validator só aceita o número", () => {
		expect(body).toContain('.validator(z.object({ saram: z.string().regex(/^\\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.") }))')
	})
})

/**
 * A identidade do sucont sai de `core.saram_link_status` (a mesma função do sisub): posto e nome
 * de guerra só quando a conta pode vê-los.
 */
describe("identityFromSaramStatus", () => {
	test("verificado: SARAM e identificação", () => {
		expect(
			identityFromSaramStatus({ status: "verified", saram: "1234567", visible: true, identity: { posto: "1T", nome_guerra: "NANNI", sg_org: "IEFA" } })
		).toEqual({ saram: "1234567", posto: "1T", nomeGuerra: "NANNI", registered: true, status: "verified" })
	})

	test("legacy em conflito: o vínculo fecha o diálogo, mas o cadastro não aparece", () => {
		expect(identityFromSaramStatus({ status: "legacy", saram: "1234567", visible: false, identity: { posto: "1T", nome_guerra: "OUTRO" } })).toEqual({
			saram: "1234567",
			posto: null,
			nomeGuerra: null,
			registered: false,
			status: "legacy",
		})
	})

	test("pedido pendente e resposta vazia", () => {
		expect(identityFromSaramStatus({ status: "pending_request", saram: null, visible: false })).toMatchObject({ saram: null, status: "pending_request" })
		expect(identityFromSaramStatus(null)).toEqual({ saram: null, posto: null, nomeGuerra: null, registered: false, status: null })
	})

	test("o diálogo só insiste com ação possível; pedido aberto não tem o que confirmar", () => {
		expect(saramStatusNeedsAction("suggestion")).toBe(true)
		expect(saramStatusNeedsAction("no_match")).toBe(true)
		for (const status of ["institutional", "pending_request", "contested", "locked_out", "verified", null] as const) {
			expect(saramStatusNeedsAction(status)).toBe(false)
		}
		expect(isSaramClaimPending("requested")).toBe(true)
		expect(isSaramClaimPending("disputed")).toBe(true)
		expect(isSaramClaimPending("linked")).toBe(false)
	})

	test("os tokens novos do banco viram frase", () => {
		for (const token of ["ACCOUNT_INSTITUTIONAL", "REQUEST_PENDING", "REQUEST_LIMIT"]) {
			expect(saramLinkErrorMessage(token)).not.toBe(SARAM_LINK_FALLBACK_MESSAGE)
		}
	})
})
