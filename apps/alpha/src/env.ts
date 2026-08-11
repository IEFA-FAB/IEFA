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
	NVIDIA_API_KEY: z.string().min(1),
	ALPHA_AI_API_KEY: z.string().min(1).optional(),
	NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
	LLM_MODEL: z.string().default("openai/gpt-oss-120b"),
	ALPHA_AI_PROVIDER: z.enum(["groq", "nvidia", "openrouter", "gemini", "anthropic", "ollama"]).default("nvidia"),
	ALPHA_AI_MODEL: z.string().default("openai/gpt-oss-120b"),
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
	PORT: z.coerce.number().default(3001),
})

const parsed = schema.parse(process.env)

const databaseUrl = parsed.ALPHA_DATABASE_URL ?? parsed.DATABASE_URL
if (!databaseUrl) {
	throw new Error("defina ALPHA_DATABASE_URL (preferido) ou DATABASE_URL")
}

export const env = { ...parsed, DATABASE_URL: databaseUrl }
