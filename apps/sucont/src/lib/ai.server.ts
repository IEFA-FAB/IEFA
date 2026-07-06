/**
 * @module ai.server
 * Acesso à IA do SUCONT via @iefa/ai-provider (AWS Bedrock em prod, Converse API).
 * Provider/model/região vêm do prefixo de env `SUCONT` (SUCONT_AI_PROVIDER etc.).
 * Autenticação keyless pela cadeia de credenciais AWS (task role em prod, profile
 * local em dev). Use apenas em server functions.
 */

import { createAdapterFromEnv } from "@iefa/ai-provider"

/** Cria o adapter de IA do SUCONT a partir do env. Lança se provider/model ausentes. */
export function getSucontAdapter() {
	return createAdapterFromEnv("SUCONT")
}

// O TextOptions do @tanstack/ai exige vários campos (logger, runId, …) que os
// adapters tratam como opcionais em runtime. Montamos o mínimo e fazemos o cast.
type ChatStreamOptions = Parameters<ReturnType<typeof getSucontAdapter>["chatStream"]>[0]

function buildOptions(user: string, system?: string): ChatStreamOptions {
	return {
		messages: [{ role: "user", content: user }],
		systemPrompts: system ? [system] : [],
	} as unknown as ChatStreamOptions
}

/** Geração de texto livre (não streaming): acumula os deltas do chatStream. */
export async function generateText({ user, system }: { user: string; system?: string }): Promise<string> {
	const adapter = getSucontAdapter()
	let text = ""
	for await (const chunk of adapter.chatStream(buildOptions(user, system))) {
		const c = chunk as { type?: string; delta?: string }
		if (c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string") text += c.delta
	}
	return text
}

/** Geração de saída estruturada (JSON): instrui o modelo com o JSON Schema e parseia. */
export async function generateJson<T>({ user, system, schema }: { user: string; system?: string; schema: unknown }): Promise<T> {
	const adapter = getSucontAdapter()
	type StructuredArgs = Parameters<ReturnType<typeof getSucontAdapter>["structuredOutput"]>[0]
	const result = await adapter.structuredOutput({
		chatOptions: buildOptions(user, system) as unknown as StructuredArgs["chatOptions"],
		outputSchema: schema as StructuredArgs["outputSchema"],
	})
	return result.data as T
}
