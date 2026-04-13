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

export const getSyncStatusFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetch(`${API_BASE}/api/admin/compras/sync/${data.id}`, {
			headers: adminHeaders(),
		})
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as SyncLog
	})

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

export const getLatestSyncFn = createServerFn({ method: "GET" }).handler(async () => {
	const res = await fetch(`${API_BASE}/api/admin/compras/sync/latest`, {
		headers: adminHeaders(),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`API retornou ${res.status}`)
	return (await res.json()) as SyncLog
})
