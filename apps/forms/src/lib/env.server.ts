import { z } from "zod"

const serverEnvSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.string().url(),
	// Publishable/anon — o client SSR de auth usa ESTA, não a service key (RLS).
	// Já provisionada no runtime (secret_names em infra/forms e infra/5s).
	VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	IEFA_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = serverEnvSchema.safeParse({
	VITE_IEFA_SUPABASE_URL: process.env.VITE_IEFA_SUPABASE_URL,
	VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
	IEFA_SUPABASE_SECRET_KEY: process.env.IEFA_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`[forms] Missing or invalid server environment variables: ${missing}`)
}

export const envServer = parsed.data
