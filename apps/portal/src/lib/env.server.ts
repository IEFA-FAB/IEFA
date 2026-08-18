import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.string().url(),
	// Chave publishable/anon. Já provisionada no runtime (secret_names em
	// infra/portal). O client SSR de auth usa ESTA, não a service key: getUser()
	// valida o JWT do cookie de qualquer forma e uma query acidental por este
	// client não deve burlar a RLS. Ver getIefaAuthClient em supabase.server.ts.
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
	throw new Error(`[portal] Missing or invalid server environment variables: ${missing}`)
}

export const envServer = parsed.data
