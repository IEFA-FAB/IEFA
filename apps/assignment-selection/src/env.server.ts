import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// rodam no Nitro, onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_ASSIGNMENT_SELECTION_SUPABASE_URL: z.string().url(),
	ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = serverEnvSchema.safeParse({
	VITE_ASSIGNMENT_SELECTION_SUPABASE_URL: process.env.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
	ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY: process.env.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`[assignment-selection] Missing or invalid server environment variables: ${missing}`)
}

export const envServer = parsed.data
