import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SARAM_ERROR_MESSAGES } from "@iefa/database/saram-link"
import { SARAM_LINK_FALLBACK_MESSAGE, saramLinkErrorMessage } from "#/lib/saram-link"

describe("saramLinkErrorMessage", () => {
	test.each([
		["EMAIL_TAKEN", "Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT."],
		["USER_DATA_NOT_FOUND", "Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT."],
	])("%p é frase do sucont", (token, expected) => {
		expect(saramLinkErrorMessage(token)).toBe(expected)
	})

	test("o resto é a MESMA frase do sisub", () => {
		for (const token of ["SARAM_LOCKED", "REQUEST_PENDING", "REQUEST_LIMIT", "ACCOUNT_INSTITUTIONAL", "CANDIDATE_NOT_FOUND", "CPF_SUFFIX_INVALID"] as const) {
			expect(saramLinkErrorMessage(token)).toBe(SARAM_ERROR_MESSAGES[token])
		}
	})

	test("falha fora do contrato não vai crua para a tela", () => {
		expect(saramLinkErrorMessage("connection terminated unexpectedly")).toBe(SARAM_LINK_FALLBACK_MESSAGE)
		expect(saramLinkErrorMessage(null)).toBe(SARAM_LINK_FALLBACK_MESSAGE)
	})
})

/**
 * O vínculo de SARAM do sucont passa pelas MESMAS funções verificadas do sisub, no banco — e só
 * para quem tem acesso ao app. Lido do fonte porque as fns só rodam no Nitro.
 */
describe("server functions do vínculo", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "user.fn.ts"), "utf8")
	const MUTATIONS = {
		confirmSaramCandidateFn: "confirm_saram_candidate",
		verifySaramByCpfFn: "verify_saram_by_cpf",
		requestSaramLinkFn: "request_saram_link",
		withdrawSaramRequestFn: "withdraw_saram_request",
		setOwnAccountKindFn: "set_own_account_kind",
	} as const

	const bodyOf = (name: string) => {
		const start = source.indexOf(`export const ${name}`)
		expect(start).toBeGreaterThan(-1)
		const next = source.indexOf("export const ", start + 1)
		return source.slice(start, next < 0 ? undefined : next)
	}

	test.each(Object.entries(MUTATIONS))("%p exige acesso ao app antes de tocar o banco e usa a sessão", (name, rpc) => {
		const body = bodyOf(name)
		const gate = body.indexOf("await requireSucontApp()")
		expect(gate).toBeGreaterThan(-1)
		expect(gate).toBeLessThan(body.indexOf("getCoreClient()"))
		expect(body).toContain(`rpc("${rpc}", {`)
		expect(body).toContain("...sessionArgs(user)")
		// Identidade da sessão, nunca do payload.
		expect(body).not.toMatch(/userId|p_user:\s*data/)
	})

	test("nenhum caminho grava SARAM direto, nem pela função antiga", () => {
		expect(source).not.toMatch(/\.from\("user_data"\)\.(update|insert)\([^)]*saram/)
		expect(source).not.toContain("link_own_saram")
		expect(source).not.toContain("claim_saram")
		expect(source).not.toContain("saveMySaramFn")
	})

	test("o estado sai pelo parser compartilhado com o sisub", () => {
		expect(bodyOf("fetchMySaramStatusFn")).toContain("parseSaramStatus(data)")
	})
})
