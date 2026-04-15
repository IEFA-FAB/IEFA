/**
 * @module compras-sync.fn
 * Proxy to the iefa-api sync worker for Compras.gov.br data ingestion.
 * CLIENT: external fetch to IEFA_API_BASE_URL (default: https://iefa-api.fly.dev). No Supabase.
 * AUTH: x-admin-secret header from ADMIN_SECRET env var.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import type { SyncLog } from "@/types/domain/compras-sync"

// Local dev: IEFA_API_BASE_URL=http://localhost:3000
// Production: defaults to https://iefa-api.fly.dev
const API_BASE = process.env.IEFA_API_BASE_URL ?? "https://iefa-api.fly.dev"

function adminHeaders() {
	return {
		"Content-Type": "application/json",
		"x-admin-secret": process.env.ADMIN_SECRET ?? "",
	}
}

// ── Server Functions ──────────────────────────────────────────────────────────

/**
 * Starts a new Compras sync job on the API worker. Returns sync_id on success or error string if already running (no throw on 409).
 *
 * @remarks
 * 409 → returns { error: "Sync já está em andamento", sync_id: null } — does NOT throw.
 *
 * @throws {Error} "API retornou {status}" on any other non-2xx response.
 */
export const triggerSyncFn = createServerFn({ method: "POST" }).handler(async () => {
	const res = await fetch(`${API_BASE}/api/admin/compras/sync`, {
		method: "POST",
		headers: adminHeaders(),
	})

	if (res.status === 409) {
		return { error: "Sync já está em andamento", sync_id: null as number | null }
	}
	if (!res.ok) {
		throw new Error(`API retornou ${res.status}`)
	}

	const body = await res.json()
	return { error: null, sync_id: body.sync_id as number }
})

/**
 * Fetches the status and log of a sync job by numeric ID.
 *
 * @throws {Error} "API retornou {status}" on non-2xx API response.
 */
export const getSyncStatusFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetch(`${API_BASE}/api/admin/compras/sync/${data.id}`, {
			headers: adminHeaders(),
		})
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as SyncLog
	})

/**
 * Requests cancellation of a running sync job. Returns error string if not in progress — does NOT throw on 409.
 *
 * @throws {Error} "API retornou {status}" on any other non-2xx/409 response.
 */
export const stopSyncFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetch(`${API_BASE}/api/admin/compras/sync/${data.id}/stop`, {
			method: "POST",
			headers: adminHeaders(),
		})
		if (res.status === 409) {
			return { error: "Sync não está em andamento" }
		}
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return { error: null }
	})

/**
 * Returns the most recent sync log entry, or null if no sync has ever run (404 treated as null, not thrown).
 *
 * @throws {Error} "API retornou {status}" on non-2xx/404 API response.
 */
export const getLatestSyncFn = createServerFn({ method: "GET" }).handler(async () => {
	const res = await fetch(`${API_BASE}/api/admin/compras/sync/latest`, {
		headers: adminHeaders(),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`API retornou ${res.status}`)
	return (await res.json()) as SyncLog
})
