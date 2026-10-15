import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_SISPROV_SUPABASE_URL: z.url(),
	// Publishable/anon — o client SSR de auth usa ESTA, não a service key (RLS).
	// Já provisionada no runtime (secret_names em infra/rumaer).
	VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	SISPROV_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = serverEnvSchema.safeParse({
	VITE_SISPROV_SUPABASE_URL: process.env.VITE_SISPROV_SUPABASE_URL,
	VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY,
	SISPROV_SUPABASE_SECRET_KEY: process.env.SISPROV_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`[sisprov] Missing or invalid server environment variables: ${missing}`)
}

export const envServer = parsed.data
