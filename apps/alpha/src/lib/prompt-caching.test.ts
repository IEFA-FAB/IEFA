import { describe, expect, it } from "bun:test"
import { modelHasPromptCaching } from "./prompt-caching.ts"

describe("modelHasPromptCaching", () => {
	it("Claude, com e sem prefixo de inference profile", () => {
		expect(modelHasPromptCaching("global.anthropic.claude-opus-4-6-v1")).toBe(true)
		expect(modelHasPromptCaching("us.anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe(true)
		expect(modelHasPromptCaching("anthropic.claude-3-5-haiku-20241022-v1:0")).toBe(true)
	})

	it("Nova", () => {
		expect(modelHasPromptCaching("us.amazon.nova-pro-v1:0")).toBe(true)
	})

	it("gpt-oss e demais: sem cache point — o Bedrock responderia 403", () => {
		expect(modelHasPromptCaching("openai.gpt-oss-120b-1:0")).toBe(false)
		expect(modelHasPromptCaching("meta.llama3-70b-instruct-v1:0")).toBe(false)
		expect(modelHasPromptCaching("amazon.titan-embed-text-v2:0")).toBe(false)
	})
})
