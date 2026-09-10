import { describe, expect, it } from "bun:test"
import { isTransientModelFailure } from "./transient.ts"

describe("isTransientModelFailure", () => {
	it("aceita 429, 408 e 5xx", () => {
		for (const status of [429, 408, 500, 502, 503]) {
			expect(isTransientModelFailure({ status })).toBe(true)
		}
	})

	it("lê o status do envelope do SDK da AWS", () => {
		expect(isTransientModelFailure({ $metadata: { httpStatusCode: 503 } })).toBe(true)
	})

	it("aceita throttling e queda de stream, mesmo com 4xx", () => {
		expect(isTransientModelFailure(new Error("ThrottlingException: rate exceeded"))).toBe(true)
		expect(isTransientModelFailure({ name: "ModelStreamErrorException", message: "", status: 424 })).toBe(true)
	})

	it("ACEITA falta de tool call — medido intermitente, não incapacidade", () => {
		// Medição: o `gpt-oss-120b` falhou assim uma vez e acertou 6/6 em seguida, com o
		// mesmo prompt. Propagar deixaria o classificador cair em `UNKNOWN`, e `UNKNOWN`
		// responde sem consultar o corpus — caro demais para uma falha que a retentativa
		// resolve.
		expect(isTransientModelFailure(new Error("No tool calls found in the response."))).toBe(true)
	})

	it("RECUSA erro de credencial e de schema", () => {
		expect(isTransientModelFailure({ name: "AccessDeniedException", status: 403 })).toBe(false)
		expect(isTransientModelFailure(new Error("inputSchema.json.type must be one of: object"))).toBe(false)
		expect(isTransientModelFailure({ status: 404 })).toBe(false)
	})

	it("tolera valor que não é erro", () => {
		expect(isTransientModelFailure(null)).toBe(false)
		expect(isTransientModelFailure("falhou")).toBe(false)
	})
})

describe("isTransientModelFailure — falha de transporte", () => {
	it("enxerga o código escondido no `cause` do fetch", () => {
		// `TypeError: fetch failed` não diz nada sozinho: o que aconteceu está em `cause`.
		// Lendo só o nível de cima, uma queda de conexão passava por falha definitiva — não
		// retentava e não acionava o modelo de reserva.
		const fetchFailed = Object.assign(new TypeError("fetch failed"), {
			cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
		})

		expect(isTransientModelFailure(fetchFailed)).toBe(true)
	})

	it("reconhece recusa de conexão e falha de DNS", () => {
		expect(isTransientModelFailure(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))).toBe(true)
		expect(isTransientModelFailure(Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } }))).toBe(true)
	})

	it("não confunde erro de negócio que traga `cause` benigno", () => {
		const validacao = Object.assign(new Error("ValidationException: model not enabled"), { cause: new Error("account not subscribed") })

		expect(isTransientModelFailure(validacao)).toBe(false)
	})

	it("não entra em laço com `cause` circular", () => {
		const circular = new Error("boom") as Error & { cause?: unknown }
		circular.cause = circular

		expect(() => isTransientModelFailure(circular)).not.toThrow()
	})
})
