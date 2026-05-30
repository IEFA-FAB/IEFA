import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.string().url(),
	SISUB_SUPABASE_SECRET_KEY: z.string().min(1),
})

const parsed = serverEnvSchema.safeParse({
	VITE_SISUB_SUPABASE_URL: process.env.VITE_SISUB_SUPABASE_URL,
	SISUB_SUPABASE_SECRET_KEY: process.env.SISUB_SUPABASE_SECRET_KEY,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const envServer = parsed.data

// Secrets de IA (MODULE_CHAT_AI_* / ANALYTICS_AI_*) são intencionalmente NÃO
// validados aqui — são fluxos não-essenciais. Sua ausência não quebra o boot;
// a detecção fica em capabilities.server.ts e as telas mostram "Em breve".
