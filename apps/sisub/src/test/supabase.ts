import { type SisubDb, sisubSchema } from "@iefa/database/drizzle/sisub"
import { createTimeoutFetch, SERVER_AUTH_OPTIONS } from "@iefa/supabase-kit"
import { createClient } from "@supabase/supabase-js"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { describe } from "vitest"

type SupabaseTestEnv = {
	url: string
	serviceRoleKey: string
	anonKey?: string
}

type SupabaseTestEnvOptions = {
	requireAnonKey?: boolean
}

type SupabaseClientOptions = {
	requestTimeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000
const REACHABILITY_TIMEOUT_MS = 3_000

const integrationEnabled = process.env.SISUB_RUN_INTEGRATION === "true"
const integrationRequired = process.env.SISUB_INTEGRATION_REQUIRED === "true"

export const describeSupabaseIntegration = integrationEnabled ? describe : describe.skip

export function getSupabaseTestEnv(options: SupabaseTestEnvOptions = {}): SupabaseTestEnv | null {
	const url = process.env.VITE_SISUB_SUPABASE_URL
	const serviceRoleKey = process.env.SISUB_SUPABASE_SECRET_KEY
	const anonKey = process.env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY

	const missing = [
		!url && "VITE_SISUB_SUPABASE_URL",
		!serviceRoleKey && "SISUB_SUPABASE_SECRET_KEY",
		options.requireAnonKey && !anonKey && "VITE_SISUB_SUPABASE_PUBLISHABLE_KEY",
	].filter(Boolean)

	if (missing.length > 0) {
		if (integrationRequired) {
			throw new Error(`Missing required Supabase integration env: ${missing.join(", ")}`)
		}
		return null
	}

	if (!url || !serviceRoleKey) return null

	return {
		url,
		serviceRoleKey,
		anonKey,
	}
}

export function createSisubServiceClient(env: SupabaseTestEnv, options: SupabaseClientOptions = {}) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "sisub" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createPublicServiceClient(env: SupabaseTestEnv, options: SupabaseClientOptions = {}) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "public" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createSisubAnonClient(env: SupabaseTestEnv & { anonKey: string }, options: SupabaseClientOptions = {}) {
	return createClient(env.url, env.anonKey, {
		db: { schema: "sisub" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createSisubReachabilityClient(env: SupabaseTestEnv) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "sisub" },
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: createTimeoutFetch(REACHABILITY_TIMEOUT_MS) },
	})
}

// ── Drizzle (query layer da migração) ────────────────────────────────────────

/**
 * URL do pooler (porta 6543) usada pelo getDb()/Drizzle; null quando ausente → testes fazem early-return.
 *
 * Com SISUB_INTEGRATION_REQUIRED=true (CI), credencial ausente é FALHA — sem
 * isso o gate de integração renderizava "4 skipped, exit 0", o verde falso
 * exato que o guard existe para impedir (o throw só cobria o caminho do
 * client Supabase, não este).
 */
export function getSisubDatabaseUrl(): string | null {
	const url = process.env.SISUB_DATABASE_URL ?? null
	if (!url && integrationEnabled && integrationRequired) {
		throw new Error("Missing required Supabase integration env: SISUB_DATABASE_URL")
	}
	return url
}

/**
 * Handle Drizzle descartável para os testes das operations já migradas. Espelha o `getDb()`
 * de produção (postgres `prepare:false`, pooler 6543), mas com `close()` explícito — em teste
 * a conexão precisa fechar no `afterAll`, senão o vitest fica pendurado.
 */
export function createSisubTestDb(url: string): { db: SisubDb; close: () => Promise<void> } {
	const client = postgres(url, { prepare: false })
	return { db: drizzle(client, { schema: sisubSchema }), close: () => client.end() }
}
