import { z } from "zod"

// Variáveis server-only — nunca importe este arquivo em código client-side.
// Usa process.env (não import.meta.env) porque os handlers de server functions
// executam no Nitro onde import.meta.env não é injetado pelo Vite.
const serverEnvSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.url(),
	// Chave publishable/anon. Já provisionada no runtime (secret_names em
	// infra/sisub). O client SSR de auth usa ESTA, não a service key: getUser()
	// valida o JWT do cookie de qualquer forma e uma query acidental por este
	// client não deve burlar a RLS. Ver getSupabaseAuthClient em supabase.server.ts.
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	SISUB_SUPABASE_SECRET_KEY: z.string().min(1),
	// Conexão Postgres direta (Drizzle) — transaction pooler (porta 6543). Usada por
	// getDb() para o query layer do domínio. Auth/RLS seguem no client Supabase REST.
	// Opcional por ora: nenhum consumidor chama getDb() ainda (rollout incremental).
	// getDb() valida a presença em call-time. Tornar required quando os *.fn.ts
	// migrarem (Fase 3) e o secret estiver provisionado no deploy.
	SISUB_DATABASE_URL: z.url().optional(),
})

const parsed = serverEnvSchema.safeParse({
	VITE_SISUB_SUPABASE_URL: process.env.VITE_SISUB_SUPABASE_URL,
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
	SISUB_SUPABASE_SECRET_KEY: process.env.SISUB_SUPABASE_SECRET_KEY,
	SISUB_DATABASE_URL: process.env.SISUB_DATABASE_URL,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const envServer = parsed.data

// Secrets de IA (MODULE_CHAT_AI_* / ANALYTICS_AI_*) são intencionalmente NÃO
// validados aqui — são fluxos não-essenciais. Sua ausência não quebra o boot;
// a detecção fica em capabilities.server.ts e as telas mostram "Em breve".
