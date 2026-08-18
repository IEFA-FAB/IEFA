import { describe, expect, it } from "bun:test"
import type { AnyTextAdapter } from "@tanstack/ai"
import { withAdapterModel } from "./own-model.js"

type Captured = { chatStream: unknown[]; structuredOutput: unknown[] }

function fakeAdapter(model?: string) {
	const captured: Captured = { chatStream: [], structuredOutput: [] }
	const adapter = {
		model,
		chatStream: async function* (options: unknown) {
			captured.chatStream.push(options)
			yield { type: "RUN_FINISHED" }
		},
		structuredOutput: async (options: unknown) => {
			captured.structuredOutput.push(options)
			return { data: {}, rawText: "{}" }
		},
	} as unknown as AnyTextAdapter
	return { adapter, captured }
}

describe("withAdapterModel", () => {
	// Sem isto, groq/nvidia/openrouter/anthropic respondem
	// `400 'model' : property 'model' is missing` em toda chamada direta.
	it("preenche o model do chatStream com o do adapter", async () => {
		const { adapter, captured } = fakeAdapter("llama-3.3-70b-versatile")
		for await (const _ of withAdapterModel(adapter).chatStream({ messages: [] } as never)) {
			// consome o stream
		}
		expect((captured.chatStream[0] as { model?: string }).model).toBe("llama-3.3-70b-versatile")
	})

	it("preenche o model dentro de chatOptions do structuredOutput", async () => {
		const { adapter, captured } = fakeAdapter("llama-3.3-70b-versatile")
		await withAdapterModel(adapter).structuredOutput({ chatOptions: { messages: [] }, outputSchema: {} } as never)
		const args = captured.structuredOutput[0] as { chatOptions: { model?: string } }
		expect(args.chatOptions.model).toBe("llama-3.3-70b-versatile")
	})

	// A activity `chat()` resolve o modelo e pode escolher outro; ela manda.
	it("não sobrescreve o model que o chamador já definiu", async () => {
		const { adapter, captured } = fakeAdapter("llama-3.3-70b-versatile")
		await withAdapterModel(adapter).structuredOutput({ chatOptions: { messages: [], model: "escolhido-pelo-chamador" }, outputSchema: {} } as never)
		const args = captured.structuredOutput[0] as { chatOptions: { model?: string } }
		expect(args.chatOptions.model).toBe("escolhido-pelo-chamador")
	})

	// A cadeia de fallback precisa do contrário: `chat()` injeta o modelo do PRIMÁRIO
	// (o spread da cadeia copia `adapter.model`), e a reserva serve outro.
	it("com force, sobrescreve o model que o chamador definiu", async () => {
		const { adapter, captured } = fakeAdapter("modelo-da-reserva")
		await withAdapterModel(adapter, { force: true }).structuredOutput({ chatOptions: { messages: [], model: "modelo-do-primario" }, outputSchema: {} } as never)
		const args = captured.structuredOutput[0] as { chatOptions: { model?: string } }
		expect(args.chatOptions.model).toBe("modelo-da-reserva")
	})

	it("com force, sobrescreve também no chatStream", async () => {
		const { adapter, captured } = fakeAdapter("modelo-da-reserva")
		for await (const _ of withAdapterModel(adapter, { force: true }).chatStream({ messages: [], model: "modelo-do-primario" } as never)) {
			// consome o stream
		}
		expect((captured.chatStream[0] as { model?: string }).model).toBe("modelo-da-reserva")
	})

	it("devolve o adapter intacto quando ele não expõe modelo", () => {
		const { adapter } = fakeAdapter(undefined)
		expect(withAdapterModel(adapter)).toBe(adapter)
	})

	it("preserva as demais chaves do adapter", async () => {
		const { adapter } = fakeAdapter("m")
		const wrapped = withAdapterModel(adapter) as unknown as { model?: string }
		expect(wrapped.model).toBe("m")
	})
})
