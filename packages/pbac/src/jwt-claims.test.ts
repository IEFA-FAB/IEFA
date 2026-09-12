import { describe, expect, test } from "bun:test"
import { decodeJwtPayload, NO_ASSURANCE_CLAIMS, readAssuranceClaims, readLastFactorAt, readSubject } from "./jwt-claims.ts"

/**
 * Monta um JWT de verdade (assinatura falsa — nada aqui verifica assinatura, de propósito).
 *
 * O `btoa` cru só aceita latin1; o GoTrue emite o payload em UTF-8. Codificar os BYTES é o
 * que faz o caso do e-mail com acento ser um teste do decodificador, e não do dublê.
 */
function token(payload: Record<string, unknown>): string {
	const base64url = (value: string) => {
		const bytes = new TextEncoder().encode(value)
		const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("")
		return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
	}
	return [base64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), base64url(JSON.stringify(payload)), "assinatura-nao-verificada"].join(".")
}

describe("readLastFactorAt", () => {
	test("lê a entrada de método totp, e não a posição zero", () => {
		// Este é o caso MEDIDO em V1: logo após o primeiro `verify`, o `amr` veio com
		// `password` na posição zero. Ler `amr[0]` já estaria errado no caso mais comum.
		const amr = [
			{ method: "password", timestamp: 1789137300 },
			{ method: "totp", timestamp: 1789137344 },
		]
		expect(readLastFactorAt(amr)).toBe(1789137344)
	})

	test("token_refresh mais recente não renova a elevação", () => {
		// O defeito que este arquivo existe para impedir: uma janela de 15 min que se renova a
		// cada refresh de token nunca expira, e ninguém percebe.
		const amr = [
			{ method: "token_refresh", timestamp: 1789199999 },
			{ method: "totp", timestamp: 1789137344 },
			{ method: "password", timestamp: 1789137300 },
		]
		expect(readLastFactorAt(amr)).toBe(1789137344)
	})

	test("com várias entradas totp fica com a MAIS RECENTE", () => {
		// Sessão que refez o desafio (V1: `challenge`+`verify` em AAL2 é aceito e renova o
		// timestamp). Contar da primeira deixaria a elevação vencida logo após elevar.
		const amr = [
			{ method: "totp", timestamp: 1789137344 },
			{ method: "totp", timestamp: 1789137375 },
		]
		expect(readLastFactorAt(amr)).toBe(1789137375)
	})

	test("amr ausente, vazio ou sem totp devolve null", () => {
		expect(readLastFactorAt(undefined)).toBeNull()
		expect(readLastFactorAt([])).toBeNull()
		expect(readLastFactorAt([{ method: "password", timestamp: 1 }])).toBeNull()
	})

	test("entrada malformada é ignorada, não vira 'agora'", () => {
		expect(readLastFactorAt([{ method: "totp" }, null, "totp", { method: "totp", timestamp: "1789137344" }])).toBeNull()
		expect(readLastFactorAt("nao-e-lista")).toBeNull()
	})
})

describe("readAssuranceClaims", () => {
	test("aal2 vira 2 e traz o timestamp do totp", () => {
		const claims = readAssuranceClaims({ aal: "aal2", amr: [{ method: "totp", timestamp: 1789137344 }] })
		expect(claims).toEqual({ aal: 2, lastFactorAt: 1789137344 })
	})

	test("aal ausente é tratado como AAL1", () => {
		expect(readAssuranceClaims({ amr: [] })).toEqual({ aal: 1, lastFactorAt: null })
	})

	test("valor desconhecido de aal cai em 1 — falha fechada", () => {
		expect(readAssuranceClaims({ aal: "aal3" }).aal).toBe(1)
		expect(readAssuranceClaims({ aal: 2 }).aal).toBe(1)
	})

	test("payload nulo devolve o piso", () => {
		expect(readAssuranceClaims(null)).toEqual(NO_ASSURANCE_CLAIMS)
	})
})

describe("decodeJwtPayload", () => {
	test("decodifica o payload de um token bem formado", () => {
		const payload = decodeJwtPayload(token({ sub: "u-1", aal: "aal2", email: "joão@fab.mil.br" }))
		expect(payload).toEqual({ sub: "u-1", aal: "aal2", email: "joão@fab.mil.br" })
	})

	test("token malformado devolve null em vez de lançar", () => {
		expect(decodeJwtPayload("")).toBeNull()
		expect(decodeJwtPayload(null)).toBeNull()
		expect(decodeJwtPayload("sem-pontos")).toBeNull()
		expect(decodeJwtPayload("a.b.c")).toBeNull()
		// Payload que decodifica mas não é objeto: um array passaria por `typeof === "object"`.
		expect(decodeJwtPayload(token([1, 2] as unknown as Record<string, unknown>))).toBeNull()
	})

	test("decodificar e ler as claims é o caminho que `createRequestAuth` percorre", () => {
		expect(readAssuranceClaims(decodeJwtPayload(token({ aal: "aal2", amr: [{ method: "totp", timestamp: 10 }] })))).toEqual({ aal: 2, lastFactorAt: 10 })
	})

	test("readSubject devolve o sub, ou null quando não é string", () => {
		expect(readSubject(decodeJwtPayload(token({ sub: "u-9" })))).toBe("u-9")
		expect(readSubject(decodeJwtPayload(token({ sub: 9 })))).toBeNull()
		expect(readSubject(null)).toBeNull()
	})
})
