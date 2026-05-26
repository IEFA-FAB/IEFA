import { describe, expect, test } from "bun:test"
import { createAdapter, createAdapterFromEnv, maxIterationsMiddleware, withFallback } from "./index.js"

describe("createAdapter", () => {
	test("throws on invalid provider", () => {
		expect(() => createAdapter({ provider: "invalid" as never, model: "m", apiKey: "k" })).toThrow(/Provider inválido/)
	})

	test("groq returns adapter with name", () => {
		const adapter = createAdapter({ provider: "groq", model: "llama-3.3-70b-versatile", apiKey: "gsk_test" })
		expect(adapter.kind).toBe("text")
	})

	test("nvidia returns adapter", () => {
		const adapter = createAdapter({ provider: "nvidia", model: "meta/llama-3.1-405b-instruct", apiKey: "nvapi_test" })
		expect(adapter.kind).toBe("text")
	})

	test("openrouter returns adapter", () => {
		const adapter = createAdapter({ provider: "openrouter", model: "google/gemini-2.0-flash-001", apiKey: "sk-or-test" })
		expect(adapter.kind).toBe("text")
	})

	test("gemini returns adapter", () => {
		const adapter = createAdapter({ provider: "gemini", model: "gemini-2.0-flash", apiKey: "AIza_test" })
		expect(adapter.kind).toBe("text")
	})

	test("anthropic returns adapter", () => {
		const adapter = createAdapter({ provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-ant-test" })
		expect(adapter.kind).toBe("text")
	})

	test("ollama returns adapter", () => {
		const adapter = createAdapter({ provider: "ollama", model: "llama3.2" })
		expect(adapter.kind).toBe("text")
	})
})

describe("createAdapterFromEnv", () => {
	test("throws when required env vars missing", () => {
		expect(() => createAdapterFromEnv("MISSING_PREFIX_12345")).toThrow()
	})

	test("reads prefixed env vars", () => {
		process.env.TEST_AI_PROVIDER = "groq"
		process.env.TEST_AI_MODEL = "llama-3.3-70b-versatile"
		process.env.TEST_AI_API_KEY = "gsk_test"
		const adapter = createAdapterFromEnv("TEST")
		expect(adapter.kind).toBe("text")
		delete process.env.TEST_AI_PROVIDER
		delete process.env.TEST_AI_MODEL
		delete process.env.TEST_AI_API_KEY
	})
})

describe("withFallback", () => {
	test("returns object with kind text", () => {
		const primary = createAdapter({ provider: "groq", model: "llama-3.3-70b-versatile", apiKey: "k" })
		const fallback = createAdapter({ provider: "openrouter", model: "google/gemini-2.0-flash-001", apiKey: "k" })
		const wrapped = withFallback(primary, fallback)
		expect(wrapped.kind).toBe("text")
		expect(typeof wrapped.chatStream).toBe("function")
	})
})

describe("maxIterationsMiddleware", () => {
	test("returns middleware with name and onConfig hook", () => {
		const mw = maxIterationsMiddleware(8)
		expect(mw.name).toBe("max-iterations")
		expect(typeof mw.onConfig).toBe("function")
	})

	test("onConfig calls abort when iteration >= n", () => {
		const mw = maxIterationsMiddleware(3)
		let aborted = false
		const ctx = {
			phase: "beforeModel",
			iteration: 3,
			abort: () => {
				aborted = true
			},
		} as never
		mw.onConfig?.(ctx, {} as never)
		expect(aborted).toBe(true)
	})

	test("onConfig does not abort below limit", () => {
		const mw = maxIterationsMiddleware(3)
		let aborted = false
		const ctx = {
			phase: "beforeModel",
			iteration: 2,
			abort: () => {
				aborted = true
			},
		} as never
		mw.onConfig?.(ctx, {} as never)
		expect(aborted).toBe(false)
	})
})
