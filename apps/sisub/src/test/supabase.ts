import { createClient } from "@supabase/supabase-js"
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

function createTimeoutFetch(timeoutMs: number): typeof fetch {
	return (async (input, init = {}) => {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(new Error(`Supabase test request timed out after ${timeoutMs}ms`)), timeoutMs)
		const signal = init.signal
		const abort = () => controller.abort(signal?.reason)

		if (signal?.aborted) {
			abort()
		} else {
			signal?.addEventListener("abort", abort, { once: true })
		}

		try {
			return await fetch(input, { ...init, signal: controller.signal })
		} finally {
			clearTimeout(timer)
			signal?.removeEventListener("abort", abort)
		}
	}) as typeof fetch
}

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
		auth: { persistSession: false },
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createPublicServiceClient(env: SupabaseTestEnv, options: SupabaseClientOptions = {}) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "public" },
		auth: { persistSession: false },
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createSisubAnonClient(env: SupabaseTestEnv & { anonKey: string }, options: SupabaseClientOptions = {}) {
	return createClient(env.url, env.anonKey, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
		global: { fetch: createTimeoutFetch(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS) },
	})
}

export function createSisubReachabilityClient(env: SupabaseTestEnv) {
	return createClient(env.url, env.serviceRoleKey, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
		global: { fetch: createTimeoutFetch(REACHABILITY_TIMEOUT_MS) },
	})
}
