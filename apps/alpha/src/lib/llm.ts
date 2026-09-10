import { makeChatLLM } from "@iefa/ai-provider/langchain-compat"
import { ChatBedrockConverse } from "@langchain/aws"
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base"
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { env } from "../env.ts"
import { messageText } from "./message-text.ts"
import { MODEL_RETRY_POLICY } from "./retry.ts"
import { isTransientModelFailure } from "./transient.ts"

/**
 * Modelo de chat do α.
 *
 * **Bedrock é o caminho padrão** — autenticação keyless pela cadeia de
 * credenciais da AWS (task role do ECS em produção, profile local em
 * desenvolvimento), no mesmo padrão que sisub e sucont já usam.
 *
 * Os demais provedores continuam suportados pelo `langchain-compat`, que fala
 * a API da OpenAI. `NVIDIA_BASE_URL` só entra quando o provedor É a NVIDIA:
 * passá-la para outro provedor faz o cliente montar a URL da NVIDIA com o
 * modelo alheio, e o erro volta disfarçado de "modelo inexistente".
 */
const openAiCompatibleConfig = {
	provider: env.ALPHA_AI_PROVIDER,
	model: env.ALPHA_AI_MODEL,
	apiKey: env.ALPHA_AI_API_KEY ?? env.NVIDIA_API_KEY,
	...(env.ALPHA_AI_PROVIDER === "nvidia" ? { baseUrl: env.NVIDIA_BASE_URL } : {}),
} as const

const cache = new Map<string, BaseChatModel>()

function build(model: string, region: string, temperature: number): BaseChatModel {
	return env.ALPHA_AI_PROVIDER === "bedrock"
		? // Sem `MODEL_RETRY_POLICY` no Bedrock, e isso é deliberado: o `ChatBedrockConverse`
			// NÃO passa pelo `AsyncCaller` do LangChain — chama `client.send()` no SDK da AWS
			// direto. `maxRetries` e `onFailedAttempt` ali seriam configuração inócua,
			// anunciando uma garantia que não existe. E não há o que consertar: o próprio SDK
			// classifica autorização negada como não-retentável. Quem tinha o furo era o
			// caminho envolvido pelo caller — embeddings e os provedores compatíveis com OpenAI.
			new ChatBedrockConverse({ model, region, temperature })
		: makeChatLLM({ ...openAiCompatibleConfig, model }, { temperature, ...MODEL_RETRY_POLICY })
}

/**
 * Camada do modelo.
 *
 * `fast` é o pré-passe que roda em todo turno antes da recuperação — classificação de
 * intenção e reescrita da pergunta para a busca. Sem `ALPHA_FAST_AI_MODEL` configurado ela
 * É o primário: a camada é uma oportunidade de economia, nunca um requisito de boot.
 */
export type ModelTier = "primary" | "fast"

function modelFor(tier: ModelTier): string {
	return tier === "fast" ? env.ALPHA_FAST_AI_MODEL || env.ALPHA_AI_MODEL : env.ALPHA_AI_MODEL
}

export function getLLM(temperature: 0 | 0.3 | 0.7 = 0, tier: ModelTier = "primary"): BaseChatModel {
	const key = `${tier}:${temperature}`
	const cached = cache.get(key)
	if (cached) return cached

	const llm = build(modelFor(tier), env.ALPHA_AI_REGION, temperature)
	cache.set(key, llm)
	return llm
}

/** Modelo de reserva, ou `null` quando não há um configurado. */
export function getFallbackLLM(temperature: 0 | 0.3 | 0.7 = 0): BaseChatModel | null {
	if (!env.ALPHA_FALLBACK_AI_MODEL) return null

	const key = `fallback:${temperature}`
	const cached = cache.get(key)
	if (cached) return cached

	const llm = build(env.ALPHA_FALLBACK_AI_MODEL, env.ALPHA_FALLBACK_AI_REGION || env.ALPHA_AI_REGION, temperature)
	cache.set(key, llm)
	return llm
}

/**
 * Descrição da ferramenta de saída estruturada.
 *
 * `parameters` é JSON Schema puro — com `type: "object"` na raiz, que é o que
 * a Converse API exige.
 */
export interface ToolSchema {
	name: string
	description?: string
	parameters: Record<string, unknown>
}

/**
 * LLM com saída estruturada.
 *
 * Força `functionCalling` em vez de `json_schema`: o modo `json_schema` só
 * existe em parte dos modelos (no Groq, o `llama-3.3-70b` recusa e o
 * `gpt-oss-120b` falha a validação), enquanto tool calling funciona tanto nos
 * provedores compatíveis com a OpenAI quanto na Converse API do Bedrock.
 * Centralizado aqui para valer de uma vez para extração, juiz, grader e router.
 */
export function structuredLLM(schema: ToolSchema, temperature: 0 | 0.3 | 0.7 = 0) {
	// O JSON Schema vai separado do nome. Passar o envelope inteiro
	// (`{name, description, parameters}`) funciona nos provedores OpenAI-like,
	// mas o Bedrock lê o objeto todo como se fosse o schema e rejeita:
	// "inputSchema.json.type must be one of: object".
	return getLLM(temperature).withStructuredOutput(schema.parameters, {
		name: schema.name,
		method: "functionCalling",
	})
}

/**
 * Saída estruturada com reserva.
 *
 * `No tool calls found in the response` CONTA como transitória e aciona a reserva — ver a
 * medição em `lib/transient.ts`: o `gpt-oss-120b` falhou assim uma vez e acertou 6/6 em
 * seguida, com o mesmo prompt. É instabilidade de geração, não falta de capacidade. O preço
 * é que um modelo que nunca emite tool call custa DUAS chamadas por turno antes de falhar,
 * em vez de uma — o que aparece na latência e na conta, não numa mensagem de erro.
 */
export async function invokeStructured<T>(
	schema: ToolSchema,
	messages: BaseLanguageModelInput,
	temperature: 0 | 0.3 | 0.7 = 0,
	tier: ModelTier = "primary"
): Promise<T> {
	return (await withModelFallback(
		temperature,
		(llm) => llm.withStructuredOutput(schema.parameters, { name: schema.name, method: "functionCalling" }).invoke(messages),
		tier
	)) as T
}

/**
 * Executa contra o primário e, só em falha TRANSITÓRIA, repete na reserva.
 *
 * Nada de stream aqui: o α invoca e espera a resposta inteira, então não existe o problema
 * de "trocar depois do primeiro conteúdo" que o adapter de stream precisa resolver.
 *
 * @param run - Recebe o modelo e produz o resultado
 * @throws propaga o erro do primário quando não é transitório, ou quando não há reserva
 */
export async function withModelFallback<T>(temperature: 0 | 0.3 | 0.7, run: (llm: BaseChatModel) => Promise<T>, tier: ModelTier = "primary"): Promise<T> {
	try {
		return await run(getLLM(temperature, tier))
	} catch (error) {
		const fallback = getFallbackLLM(temperature)
		if (!fallback || !isTransientModelFailure(error)) throw error

		console.warn(
			`[llm] primário falhou de forma transitória, tentando a reserva (${env.ALPHA_FALLBACK_AI_MODEL}): ${error instanceof Error ? error.message : String(error)}`
		)
		return await run(fallback)
	}
}

/** Texto do modelo, já extraído dos blocos de conteúdo, com reserva. */
export async function invokeText(messages: BaseLanguageModelInput, temperature: 0 | 0.3 | 0.7 = 0): Promise<string> {
	return messageText((await withModelFallback(temperature, (llm) => llm.invoke(messages))).content)
}
