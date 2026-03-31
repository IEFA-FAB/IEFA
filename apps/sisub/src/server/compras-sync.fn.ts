import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// Local dev: IEFA_API_BASE_URL=http://localhost:3000
// Production: defaults to https://iefa-api.fly.dev
const API_BASE = process.env.IEFA_API_BASE_URL ?? "https://iefa-api.fly.dev"

function adminHeaders() {
	return {
		"Content-Type": "application/json",
		"x-admin-secret": process.env.ADMIN_SECRET ?? "",
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStep = {
	id: number
	sync_id: number
	step_name: string
	status: "pending" | "running" | "success" | "error"
	current_page: number
	total_pages: number | null
	records_upserted: number
	records_deactivated: number
	error_message: string | null
	started_at: string | null
	finished_at: string | null
}

export type SyncLog = {
	id: number
	started_at: string
	finished_at: string | null
	triggered_by: string
	status: "running" | "success" | "partial" | "error"
	total_steps: number
	completed_steps: number
	successful_steps: number
	failed_steps: number
	total_upserted: number
	total_deactivated: number
	error_message: string | null
	steps: SyncStep[]
}

// ── Server Functions ──────────────────────────────────────────────────────────

export const triggerSync = createServerFn({ method: "POST" }).handler(async () => {
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

export const getSyncStatus = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetch(`${API_BASE}/api/admin/compras/sync/${data.id}`, {
			headers: adminHeaders(),
		})
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as SyncLog
	})

export const stopSync = createServerFn({ method: "POST" })
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

export const getLatestSync = createServerFn({ method: "GET" }).handler(async () => {
	const res = await fetch(`${API_BASE}/api/admin/compras/sync/latest`, {
		headers: adminHeaders(),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`API retornou ${res.status}`)
	return (await res.json()) as SyncLog
})
