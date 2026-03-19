import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side
const envSchema = z.object({
	SISUB_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse({
	SISUB_SUPABASE_SECRET_KEY: process.env.SISUB_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const envServer = parsed.data
