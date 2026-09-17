/**
 * @module scanner.fn
 * Perfil calibrado do leitor de código de barras, por usuário × cozinha.
 * CLIENT: getServerClient (service role, schema inventory).
 * AUTH: `storage` nível 1 — quem lê estoque calibra o próprio leitor.
 * TABLES: inventory.scanner_profile.
 * @domain kitchen
 * @migration 20260917140000_inventory_scanner_profile
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabela nova fora dos tipos gerados
type LooseClient = { from: (table: string) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient

export interface ScannerProfile {
	maxKeyIntervalMs: number
	minLength: number
	terminator: "enter" | "tab" | "none"
	idleTimeoutMs: number
	prefix: string | null
	suffix: string | null
	gsSubstitute: string | null
}

/** Default de fábrica: o valor que o `GtinScannerField` usava embutido. */
export const DEFAULT_SCANNER_PROFILE: ScannerProfile = {
	maxKeyIntervalMs: 80,
	minLength: 8,
	terminator: "enter",
	idleTimeoutMs: 120,
	prefix: null,
	suffix: null,
	gsSubstitute: null,
}

const ProfileSchema = z.object({
	kitchenId: z.number().int().positive(),
	maxKeyIntervalMs: z.number().int().min(10).max(500),
	minLength: z.number().int().min(4).max(48),
	terminator: z.enum(["enter", "tab", "none"]),
	idleTimeoutMs: z.number().int().min(30).max(1000),
	prefix: z.string().max(8).nullable(),
	suffix: z.string().max(8).nullable(),
	gsSubstitute: z.string().length(1).nullable(),
})

export const fetchScannerProfileFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<ScannerProfile> => {
		const { userId } = await requireStorageForKitchen(1, data.kitchenId)
		const { data: row } = await inventory()
			.from("scanner_profile")
			.select("max_key_interval_ms, min_length, terminator, idle_timeout_ms, prefix, suffix, gs_substitute")
			.eq("user_id", userId)
			.eq("kitchen_id", data.kitchenId)
			.maybeSingle()
		if (!row) return DEFAULT_SCANNER_PROFILE
		return {
			maxKeyIntervalMs: Number(row.max_key_interval_ms),
			minLength: Number(row.min_length),
			terminator: row.terminator as ScannerProfile["terminator"],
			idleTimeoutMs: Number(row.idle_timeout_ms),
			prefix: row.prefix ?? null,
			suffix: row.suffix ?? null,
			gsSubstitute: row.gs_substitute ?? null,
		}
	})

/** Grava a calibração medida na tela "Testar leitor". Sempre do próprio usuário. */
export const saveScannerProfileFn = createServerFn({ method: "POST" })
	.validator(ProfileSchema)
	.handler(async ({ data }) => {
		// o perfil é do ator autenticado: `user_id` NUNCA vem do cliente, senão
		// um operador calibraria o leitor de outro (mesmo padrão do IDOR de
		// `fetchUserPermissionsFn`)
		const { userId } = await requireStorageForKitchen(1, data.kitchenId)
		const { error } = await inventory()
			.from("scanner_profile")
			.upsert(
				{
					user_id: userId,
					kitchen_id: data.kitchenId,
					max_key_interval_ms: data.maxKeyIntervalMs,
					min_length: data.minLength,
					terminator: data.terminator,
					idle_timeout_ms: data.idleTimeoutMs,
					prefix: data.prefix?.trim() || null,
					suffix: data.suffix?.trim() || null,
					gs_substitute: data.gsSubstitute || null,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "user_id,kitchen_id" }
			)
		if (error) throw new Error(`Erro ao salvar o perfil do leitor: ${error.message}`)
		return { saved: true }
	})
