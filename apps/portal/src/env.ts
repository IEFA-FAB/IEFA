import { z } from "zod"

const envSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.url(),
	VITE_IEFA_SUPABASE_ANON_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse({
	VITE_IEFA_SUPABASE_URL: import.meta.env.VITE_IEFA_SUPABASE_URL,
	VITE_IEFA_SUPABASE_ANON_KEY: import.meta.env.VITE_IEFA_SUPABASE_ANON_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const env = parsed.data
