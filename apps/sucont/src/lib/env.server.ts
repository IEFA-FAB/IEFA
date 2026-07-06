import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro, onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_SUCONT_SUPABASE_URL: z.string().url(),
	SUCONT_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = serverEnvSchema.safeParse({
	VITE_SUCONT_SUPABASE_URL: process.env.VITE_SUCONT_SUPABASE_URL,
	SUCONT_SUPABASE_SECRET_KEY: process.env.SUCONT_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`[sucont] Missing or invalid server environment variables: ${missing}`)
}

export const envServer = parsed.data
