import { describe } from "bun:test"
import { createClient } from "@supabase/supabase-js"

type SupabaseTestEnv = {
	url: string
	serviceRoleKey: string
	anonKey?: string
}

type SupabaseTestEnvOptions = {
	requireAnonKey?: boolean
}

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

export function createSisubServiceClient(env: SupabaseTestEnv) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

export function createPublicServiceClient(env: SupabaseTestEnv) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "public" },
		auth: { persistSession: false },
	})
}

export function createSisubAnonClient(env: SupabaseTestEnv & { anonKey: string }) {
	return createClient(env.url, env.anonKey, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

export function createSisubReachabilityClient(env: SupabaseTestEnv) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
		global: {
			fetch: ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) })) as typeof fetch,
		},
	})
}
