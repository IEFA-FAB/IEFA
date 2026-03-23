import { z } from "zod"

const schema = z.object({
	SUPABASE_URL: z.string().url(),
	SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	DATABASE_URL: z.string().min(1),
	NVIDIA_API_KEY: z.string().min(1),
	NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
	LLM_MODEL: z.string().default("openai/gpt-oss-120b"),
	EMB_MODEL: z.string().default("baai/bge-m3"),
	EMB_QUERY_PREFIX: z.string().default("Represent this sentence for searching relevant passages:"),
	EMB_BATCH_SIZE: z.coerce.number().default(128),
	NVIDIA_RERANK_MODEL: z.string().default("nvidia/llama-3.2-nv-rerankqa-1b-v2"),
	RERANK_TOP_N: z.coerce.number().default(5),
	RERANK_THRESHOLD: z.coerce.number().default(0.45),
	RRF_K: z.coerce.number().default(60),
	PORT: z.coerce.number().default(3001),
})

export const env = schema.parse(process.env)
