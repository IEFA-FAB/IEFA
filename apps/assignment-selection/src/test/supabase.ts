import type { Database } from "@iefa/database"
import { createTimeoutFetch, SERVER_AUTH_OPTIONS } from "@iefa/supabase-kit"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe } from "vitest"

// Os testes de integração batem no Supabase de PROD (mesmo projeto compartilhado).
// Gate por env: `ASSIGNMENT_SELECTION_RUN_INTEGRATION=true` habilita; senão pulam.
// `ASSIGNMENT_SELECTION_INTEGRATION_REQUIRED=true` faz faltar env virar erro (CI).
const integrationEnabled = process.env.ASSIGNMENT_SELECTION_RUN_INTEGRATION === "true"
const integrationRequired = process.env.ASSIGNMENT_SELECTION_INTEGRATION_REQUIRED === "true"

/** `describe` que só roda quando a integração está habilitada. */
export const describeIntegration = integrationEnabled ? describe : describe.skip

const REQUEST_TIMEOUT_MS = 8_000

export interface TestEnv {
	url: string
	serviceRoleKey: string
	anonKey: string
	/** Conexão Postgres direta (pooler 6543): só ela abre o bypass das fixtures de concessão. */
	databaseUrl: string
}

/** Lê as vars do .env; retorna null (pula) se faltar, salvo INTEGRATION_REQUIRED. */
export function getTestEnv(): TestEnv | null {
	const url = process.env.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL
	const serviceRoleKey = process.env.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY
	const anonKey = process.env.VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY
	const databaseUrl = process.env.ASSIGNMENT_SELECTION_DATABASE_URL

	const missing = [
		!url && "VITE_ASSIGNMENT_SELECTION_SUPABASE_URL",
		!serviceRoleKey && "ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY",
		!anonKey && "VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY",
		!databaseUrl && "ASSIGNMENT_SELECTION_DATABASE_URL",
	].filter(Boolean)

	if (missing.length > 0) {
		if (integrationRequired) throw new Error(`Missing required Supabase integration env: ${missing.join(", ")}`)
		return null
	}
	return { url: url as string, serviceRoleKey: serviceRoleKey as string, anonKey: anonKey as string, databaseUrl: databaseUrl as string }
}

type Client = SupabaseClient<Database, "assignment_selection">

/** Client service-role (bypassa RLS) — espelha getAssignmentServerClient(). */
export function createServiceClient(env: TestEnv): Client {
	return createClient<Database, "assignment_selection">(env.url, env.serviceRoleKey, {
		db: { schema: "assignment_selection" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(REQUEST_TIMEOUT_MS) },
	})
}

/** Client anon (publishable) — representa um visitante não autenticado. */
export function createAnonClient(env: TestEnv): Client {
	return createClient<Database, "assignment_selection">(env.url, env.anonKey, {
		db: { schema: "assignment_selection" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(REQUEST_TIMEOUT_MS) },
	})
}
