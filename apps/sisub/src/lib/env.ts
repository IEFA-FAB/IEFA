import { z } from "zod"

const envSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.url(),
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	SISUB_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse({
	VITE_SISUB_SUPABASE_URL: import.meta.env.VITE_SISUB_SUPABASE_URL,
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
	SISUB_SUPABASE_SECRET_KEY: import.meta.env.SISUB_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const env = parsed.data
