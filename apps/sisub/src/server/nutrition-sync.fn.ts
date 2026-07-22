/**
 * @module nutrition-sync.fn
 * Proxy to the iefa-api worker for institutional food composition table sync.
 * AUTH: `global` level 2 no chamador (espelha o beforeLoad de /global/sync-routines) +
 * header x-admin-secret da env ADMIN_SECRET no salto para a API.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import type { SyncLog } from "@/types/domain/compras-sync"

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(`${API_BASE}${path}`, init)
	} catch {
		const fallback = "https://api.iefa.com.br"
		return fetch(`${fallback}${path}`, init)
	}
}

function adminHeaders() {
	return {
		"Content-Type": "application/json",
		"x-admin-secret": process.env.ADMIN_SECRET ?? "",
	}
}

/** Ver `requireSyncAdmin` em compras-sync.fn: sem guard o `ADMIN_SECRET` fica acessível a anônimos. */
async function requireSyncAdmin() {
	await requireAuthWithPermission("global", 2)
}

export const triggerNutritionSyncFn = createServerFn({ method: "POST" }).handler(async () => {
	await requireSyncAdmin()
	const res = await fetchApi("/api/admin/nutrition/sync", {
		method: "POST",
		headers: adminHeaders(),
		// Content-Type is application/json, so a JSON body is required — an empty body makes
		// the API's OpenAPI validator reject the request with 400 (Malformed JSON).
		body: JSON.stringify({ triggered_by: "manual" }),
	})

	if (res.status === 409) return { error: "Sync já está em andamento", sync_id: null as number | null }
	if (!res.ok) throw new Error(`API retornou ${res.status}`)

	const body = await res.json()
	return { error: null, sync_id: body.sync_id as number }
})

export const getNutritionSyncStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireSyncAdmin()
		const res = await fetchApi(`/api/admin/nutrition/sync/${data.id}`, {
			headers: adminHeaders(),
		})
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as SyncLog
	})

export const stopNutritionSyncFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireSyncAdmin()
		const res = await fetchApi(`/api/admin/nutrition/sync/${data.id}/stop`, {
			method: "POST",
			headers: adminHeaders(),
		})
		if (res.status === 409) return { error: "Sync não está em andamento" }
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return { error: null }
	})

export const getLatestNutritionSyncFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireSyncAdmin()
	const res = await fetchApi("/api/admin/nutrition/sync/latest", {
		headers: adminHeaders(),
	})
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`API retornou ${res.status}`)
	return (await res.json()) as SyncLog
})
