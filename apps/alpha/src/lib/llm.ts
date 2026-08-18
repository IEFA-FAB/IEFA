import { makeChatLLM } from "@iefa/ai-provider/langchain-compat"
import { ChatBedrockConverse } from "@langchain/aws"
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { env } from "../env.ts"

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

const cache = new Map<number, BaseChatModel>()

export function getLLM(temperature: 0 | 0.3 | 0.7 = 0): BaseChatModel {
	const cached = cache.get(temperature)
	if (cached) return cached

	const llm: BaseChatModel =
		env.ALPHA_AI_PROVIDER === "bedrock"
			? new ChatBedrockConverse({ model: env.ALPHA_AI_MODEL, region: env.ALPHA_AI_REGION, temperature })
			: makeChatLLM(openAiCompatibleConfig, { temperature })

	cache.set(temperature, llm)
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
