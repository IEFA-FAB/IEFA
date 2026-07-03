/**
 * @module nutrition-sync.fn
 * Proxy to the iefa-api worker for institutional food composition table sync.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import type { SyncLog } from "@/types/domain/compras-sync"

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${API_BASE}${path}`, init)
}

function adminHeaders() {
	return {
		"Content-Type": "application/json",
		"x-admin-secret": process.env.ADMIN_SECRET ?? "",
	}
}

export const triggerNutritionSyncFn = createServerFn({ method: "POST" }).handler(async () => {
	const res = await fetchApi("/api/admin/nutrition/sync", {
		method: "POST",
		headers: adminHeaders(),
	})

	if (res.status === 409) return { error: "Sync já está em andamento", sync_id: null as number | null }
	if (!res.ok) throw new Error(`API retornou ${res.status}`)

	const body = await res.json()
	return { error: null, sync_id: body.sync_id as number }
})

export const getNutritionSyncStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetchApi(`/api/admin/nutrition/sync/${data.id}`, {
			headers: adminHeaders(),
		})
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as SyncLog
	})

export const stopNutritionSyncFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const res = await fetchApi(`/api/admin/nutrition/sync/${data.id}/stop`, {
			method: "POST",
			headers: adminHeaders(),
		})
		if (res.status === 409) return { error: "Sync não está em andamento" }
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return { error: null }
	})

export const getLatestNutritionSyncFn = createServerFn({ method: "GET" }).handler(async () => {
	const res = await fetchApi("/api/admin/nutrition/sync/latest", {
		headers: adminHeaders(),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`API retornou ${res.status}`)
	return (await res.json()) as SyncLog
})
