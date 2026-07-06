import { z } from "zod"

// Variáveis expostas ao cliente (prefixo VITE_). Validadas no boot.
const envSchema = z.object({
	VITE_SUCONT_SUPABASE_URL: z.string().url(),
	VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse({
	VITE_SUCONT_SUPABASE_URL: import.meta.env.VITE_SUCONT_SUPABASE_URL,
	VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`[sucont] Missing or invalid environment variables: ${missing}`)
}

export const env = parsed.data
