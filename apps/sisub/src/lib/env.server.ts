import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.string().url(),
	SISUB_SUPABASE_SECRET_KEY: z.string().min(1),
})

const analyticsEnvSchema = z.object({
	OPENROUTER_API_KEY: z.string().min(1),
	ANALYTICS_LLM_MODEL: z.string().default("openai/gpt-oss-120b:free"),
	ANALYTICS_LLM_MODEL_FALLBACK: z.string().optional(),
})

const parsed = serverEnvSchema.safeParse({
	VITE_SISUB_SUPABASE_URL: process.env.VITE_SISUB_SUPABASE_URL,
	SISUB_SUPABASE_SECRET_KEY: process.env.SISUB_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const envServer = parsed.data

export function getAnalyticsEnvServer() {
	const parsed = analyticsEnvSchema.safeParse({
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		ANALYTICS_LLM_MODEL: process.env.ANALYTICS_LLM_MODEL,
		ANALYTICS_LLM_MODEL_FALLBACK: process.env.ANALYTICS_LLM_MODEL_FALLBACK,
	})

	if (!parsed.success) {
		const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
		throw new Error(`Missing or invalid environment variables: ${missing}`)
	}

	return parsed.data
}
