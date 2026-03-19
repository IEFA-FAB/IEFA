import { z } from "zod"

// Apenas variáveis públicas (VITE_) — seguras para client e SSR
const envSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.url(),
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse({
	VITE_SISUB_SUPABASE_URL: import.meta.env.VITE_SISUB_SUPABASE_URL,
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const env = parsed.data
