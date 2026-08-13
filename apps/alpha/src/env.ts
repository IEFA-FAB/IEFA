import { z } from "zod"

const schema = z.object({
	SUPABASE_URL: z.string().url(),
	SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	/**
	 * Conexão Postgres direta, usada pelo checkpointer do LangGraph.
	 *
	 * `ALPHA_DATABASE_URL` tem precedência sobre `DATABASE_URL` — é o primeiro
	 * passo do isolamento do α em relação aos secrets herdados do sisub.
	 */
	ALPHA_DATABASE_URL: z.string().min(1).optional(),
	DATABASE_URL: z.string().min(1).optional(),
	/** Só é exigida quando algum provedor NVIDIA continua em uso. */
	NVIDIA_API_KEY: z.string().min(1).optional(),
	ALPHA_AI_API_KEY: z.string().min(1).optional(),
	NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
	LLM_MODEL: z.string().default("openai/gpt-oss-120b"),
	ALPHA_AI_PROVIDER: z.enum(["groq", "nvidia", "openrouter", "gemini", "anthropic", "ollama", "bedrock"]).default("bedrock"),
	ALPHA_AI_MODEL: z.string().default(""),
	/** Região do Bedrock; cai para a região padrão da AWS quando ausente. */
	ALPHA_AI_REGION: z.string().default(process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1"),
	/** Provedor do embedder — independente do provedor do chat. */
	ALPHA_EMBEDDING_PROVIDER: z.enum(["bedrock", "nvidia"]).default("bedrock"),
	ALPHA_EMBEDDING_MODEL: z.string().default("amazon.titan-embed-text-v2:0"),
	/** Modelo de rerank do Bedrock; vazio desliga o rerank. */
	ALPHA_RERANK_MODEL: z.string().default(""),
	EMB_MODEL: z.string().default("baai/bge-m3"),
	EMB_QUERY_PREFIX: z.string().default("Represent this sentence for searching relevant passages:"),
	EMB_BATCH_SIZE: z.coerce.number().default(128),
	NVIDIA_RERANK_MODEL: z.string().default("nvidia/llama-3.2-nv-rerankqa-1b-v2"),
	RERANK_TOP_N: z.coerce.number().default(5),
	RERANK_THRESHOLD: z.coerce.number().default(0.45),
	RRF_K: z.coerce.number().default(60),
	/** Segredo do job agendado que chama /internal/jobs/sources/refresh. */
	ALPHA_JOB_SECRET: z.string().min(16).optional(),
	/** Liga o timer semanal de atualização de fontes. Desligado por padrão. */
	ALPHA_SOURCES_REFRESH_ENABLED: z.stringbool().default(false),
	/**
	 * Liga a geração de embeddings na ingestão.
	 *
	 * Desligado, os chunks continuam sendo gravados e indexados por full-text —
	 * a busca funciona, só perde a parte semântica. É degradação declarada, não
	 * ausência silenciosa: sem chunk nenhum, a verificação não teria contra o que
	 * recuperar trecho de norma.
	 */
	ALPHA_EMBEDDINGS_ENABLED: z.stringbool().default(true),
	/**
	 * Teto de caracteres do documento enviado ao modelo por extração.
	 *
	 * Existe por causa do limite de tokens por minuto do provedor: acima disso a
	 * chamada volta 413 e a extração falha inteira. O default cabe nos tiers
	 * comuns; documento maior é truncado, e o truncamento é **reportado** na
	 * resposta em vez de passar batido.
	 */
	ALPHA_EXTRACTION_MAX_CHARS: z.coerce.number().default(24_000),
	PORT: z.coerce.number().default(3001),
})

const parsed = schema.parse(process.env)

if (!parsed.ALPHA_AI_MODEL) {
	throw new Error(
		`ALPHA_AI_MODEL é obrigatório. Para bedrock, use o id do modelo ou do inference profile da região ${parsed.ALPHA_AI_REGION}; não há default seguro para cravar.`
	)
}

// Provedores NVIDIA precisam de chave; Bedrock autentica pela cadeia da AWS.
const usaNvidia = parsed.ALPHA_AI_PROVIDER === "nvidia" || parsed.ALPHA_EMBEDDING_PROVIDER === "nvidia"
if (usaNvidia && !parsed.NVIDIA_API_KEY) {
	throw new Error("NVIDIA_API_KEY é obrigatório quando ALPHA_AI_PROVIDER ou ALPHA_EMBEDDING_PROVIDER é 'nvidia'.")
}

const databaseUrl = parsed.ALPHA_DATABASE_URL ?? parsed.DATABASE_URL
if (!databaseUrl) {
	throw new Error("defina ALPHA_DATABASE_URL (preferido) ou DATABASE_URL")
}

export const env = { ...parsed, DATABASE_URL: databaseUrl }
