import { describe, expect, test } from "bun:test"
import type { AnyTextAdapter } from "@tanstack/ai"
import { isRetryableAdapterFailure, withFallbackChain } from "./fallback.js"

type Chunk = Record<string, unknown>

/** Adapter de teste: emite os chunks dados, ou lança o erro dado. */
function fakeAdapter(name: string, script: Chunk[] | (() => never), calls: string[] = []): AnyTextAdapter {
	return {
		kind: "text",
		name,
		model: name,
		chatStream: async function* () {
			calls.push(name)
			if (typeof script === "function") {
				script()
				return
			}
			for (const chunk of script) yield chunk
		},
		structuredOutput: async () => {
			calls.push(name)
			if (typeof script === "function") script()
			return { data: { from: name }, rawText: name }
		},
	} as unknown as AnyTextAdapter
}

async function collect(adapter: AnyTextAdapter): Promise<Chunk[]> {
	const out: Chunk[] = []
	for await (const chunk of adapter.chatStream({} as never)) out.push(chunk as Chunk)
	return out
}

const OK_STREAM: Chunk[] = [{ type: "RUN_STARTED" }, { type: "TEXT_MESSAGE_START" }, { type: "TEXT_MESSAGE_CONTENT", delta: "oi" }, { type: "RUN_FINISHED" }]

describe("isRetryableAdapterFailure", () => {
	test("429 e 5xx são transitórios", () => {
		expect(isRetryableAdapterFailure({ status: 429 })).toBe(true)
		expect(isRetryableAdapterFailure({ statusCode: 503 })).toBe(true)
		expect(isRetryableAdapterFailure({ rawEvent: { status_code: 502 } })).toBe(true)
	})

	test("4xx que não é 429/408 não é transitório", () => {
		// tool_use_failed do groq: trocar de provider só repetiria a falha.
		expect(isRetryableAdapterFailure({ code: "tool_use_failed", rawEvent: { status_code: 400 } })).toBe(false)
		expect(isRetryableAdapterFailure({ status: 403, message: "InvalidClientTokenId" })).toBe(false)
	})

	test("lê o status do $metadata do SDK da AWS — o bedrock é o primário e é ele que lança", () => {
		// Sem isso, um 503 do Bedrock não acionava a reserva: o nome vem colado
		// ("InternalServerException") e não casava com nenhum padrão de mensagem.
		expect(isRetryableAdapterFailure({ name: "InternalServerException", $metadata: { httpStatusCode: 500 } })).toBe(true)
		expect(isRetryableAdapterFailure({ name: "ServiceUnavailableException", $metadata: { httpStatusCode: 503 } })).toBe(true)
		expect(isRetryableAdapterFailure({ name: "ThrottlingException", $metadata: { httpStatusCode: 429 } })).toBe(true)
		expect(isRetryableAdapterFailure({ name: "ModelStreamErrorException", $metadata: { httpStatusCode: 424 } })).toBe(true)
		// AccessDenied continua propagando: trocar de provider não conserta credencial.
		expect(isRetryableAdapterFailure({ name: "AccessDeniedException", $metadata: { httpStatusCode: 403 } })).toBe(false)
	})

	test("reconhece falha transitória sem status, pela mensagem", () => {
		expect(isRetryableAdapterFailure(new Error("ThrottlingException: rate exceeded"))).toBe(true)
		expect(isRetryableAdapterFailure(new Error("fetch failed"))).toBe(true)
		expect(isRetryableAdapterFailure(new Error("Model is overloaded"))).toBe(true)
	})

	test("erro comum não é transitório", () => {
		expect(isRetryableAdapterFailure(new Error("Input validation failed for tool list_recipes"))).toBe(false)
	})
})

describe("withFallbackChain — troca por exceção", () => {
	test("usa a reserva quando o primário lança erro transitório", async () => {
		const calls: string[] = []
		const primary = fakeAdapter(
			"primary",
			() => {
				throw Object.assign(new Error("ThrottlingException"), { status: 429 })
			},
			calls
		)
		const chunks = await collect(withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM, calls)))

		expect(calls).toEqual(["primary", "fallback"])
		expect(chunks.map((c) => c.type)).toEqual(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED"])
	})

	test("propaga erro não-transitório sem tentar a reserva", async () => {
		const calls: string[] = []
		const primary = fakeAdapter(
			"primary",
			() => {
				throw Object.assign(new Error("InvalidClientTokenId"), { status: 403 })
			},
			calls
		)
		const chained = withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM, calls))

		await expect(collect(chained)).rejects.toThrow(/InvalidClientTokenId/)
		expect(calls).toEqual(["primary"])
	})
})

describe("withFallbackChain — troca por RUN_ERROR", () => {
	// O caso que motivou o wrapper: adapters em cima do openai-base não lançam,
	// emitem RUN_ERROR no stream. Um catch simples nunca dispararia.
	test("troca quando o primário emite RUN_ERROR transitório antes de responder", async () => {
		const calls: string[] = []
		const primary = fakeAdapter(
			"primary",
			[{ type: "RUN_STARTED" }, { type: "RUN_ERROR", message: "Service Unavailable", rawEvent: { status_code: 503 } }],
			calls
		)
		const chunks = await collect(withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM, calls)))

		expect(calls).toEqual(["primary", "fallback"])
		// O RUN_STARTED do primário foi descartado: quem responde emite o seu.
		expect(chunks.filter((c) => c.type === "RUN_STARTED")).toHaveLength(1)
		expect(chunks.some((c) => c.type === "RUN_ERROR")).toBe(false)
	})

	test("entrega o RUN_ERROR quando não há mais reserva", async () => {
		const chunks = await collect(
			withFallbackChain(
				fakeAdapter("primary", [{ type: "RUN_STARTED" }, { type: "RUN_ERROR", message: "throttled" }]),
				fakeAdapter("fallback", [{ type: "RUN_STARTED" }, { type: "RUN_ERROR", message: "throttled" }])
			)
		)
		expect(chunks.filter((c) => c.type === "RUN_ERROR")).toHaveLength(1)
	})

	test("não troca depois do primeiro conteúdo — meia resposta de cada modelo é pior que falha", async () => {
		const calls: string[] = []
		const primary = fakeAdapter(
			"primary",
			[
				{ type: "RUN_STARTED" },
				{ type: "TEXT_MESSAGE_CONTENT", delta: "come" },
				{ type: "RUN_ERROR", message: "ThrottlingException", rawEvent: { status_code: 429 } },
			],
			calls
		)
		const chunks = await collect(withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM, calls)))

		expect(calls).toEqual(["primary"])
		expect(chunks.map((c) => c.type)).toEqual(["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "RUN_ERROR"])
	})

	test("não troca quando o RUN_ERROR é de erro do modelo, não do provider", async () => {
		const calls: string[] = []
		const primary = fakeAdapter("primary", [{ type: "RUN_STARTED" }, { type: "RUN_ERROR", code: "tool_use_failed", rawEvent: { status_code: 400 } }], calls)
		const chunks = await collect(withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM, calls)))

		expect(calls).toEqual(["primary"])
		expect(chunks.some((c) => c.type === "RUN_ERROR")).toBe(true)
	})
})

describe("withFallbackChain — structuredOutput", () => {
	test("cai para a reserva em erro transitório", async () => {
		const primary = fakeAdapter("primary", () => {
			throw Object.assign(new Error("overloaded"), { status: 529 })
		})
		const chained = withFallbackChain(primary, fakeAdapter("fallback", OK_STREAM))
		const result = (await chained.structuredOutput({} as never)) as { data: { from: string } }
		expect(result.data.from).toBe("fallback")
	})
})

describe("withFallbackChain — sem reserva", () => {
	test("devolve o próprio adapter quando só há um", () => {
		const only = fakeAdapter("only", OK_STREAM)
		expect(withFallbackChain(only)).toBe(only)
	})
})
