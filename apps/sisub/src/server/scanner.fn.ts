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

/**
 * Resolve uma leitura ao INSUMO da cozinha.
 *
 * A tela de saída lia o GTIN e respondia "informe a quantidade na linha do
 * insumo abaixo" — o operador lia o código e continuava procurando a linha na
 * mão, que é exatamente o trabalho que a leitura existia para poupar. Pior:
 * uma chave de NF-e válida, que o domínio reconhece, caía no ramo "Código não
 * reconhecido".
 *
 * Três caminhos, nesta ordem:
 *  • GTIN do SKU no catálogo;
 *  • alias aprendido na operação (`gs1_integration.gtin_alias`), menos os
 *    rejeitados — é o que cobre o fornecedor que manda o código da caixa;
 *  • etiqueta interna do lote (`LOT…`), que resolve o insumo pelo próprio lote
 *    e é o único caminho para o item SEM GTIN.
 */
export const resolveScanToIngredientFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			gtin: z.string().min(8).max(14).optional(),
			lotShortCode: z.string().min(4).max(20).optional(),
		})
	)
	.handler(
		async ({
			data,
		}): Promise<{ ingredientId: string | null; lotId: string | null; description: string | null; matchedBy: "gtin" | "alias" | "lot" | null }> => {
			await requireStorageForKitchen(1, data.kitchenId)
			const kit = getServerClient("kitchen") as unknown as LooseClient

			if (data.lotShortCode) {
				const inv = inventory()
				const { data: lot } = await inv
					.from("stock_lot")
					.select("id, ingredient_id")
					.eq("kitchen_id", data.kitchenId)
					.eq("short_code", data.lotShortCode.toUpperCase())
					.maybeSingle()
				if (!lot?.ingredient_id) return { ingredientId: null, lotId: (lot?.id as string) ?? null, description: null, matchedBy: null }
				const { data: ingredient } = await kit.from("ingredient").select("description").eq("id", lot.ingredient_id).maybeSingle()
				return { ingredientId: lot.ingredient_id as string, lotId: lot.id as string, description: ingredient?.description ?? null, matchedBy: "lot" }
			}

			if (!data.gtin) return { ingredientId: null, lotId: null, description: null, matchedBy: null }

			const { data: sku } = await kit.from("ingredient_item").select("ingredient_id").eq("gtin", data.gtin).maybeSingle()
			let ingredientId = (sku?.ingredient_id as string | undefined) ?? undefined
			let matchedBy: "gtin" | "alias" = "gtin"

			if (!ingredientId) {
				const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
				const { data: alias } = await gs1.from("gtin_alias").select("ingredient_item_id").eq("gtin", data.gtin).neq("status", "rejected").maybeSingle()
				if (alias?.ingredient_item_id) {
					const { data: aliasItem } = await kit.from("ingredient_item").select("ingredient_id").eq("id", alias.ingredient_item_id).maybeSingle()
					ingredientId = (aliasItem?.ingredient_id as string | undefined) ?? undefined
					matchedBy = "alias"
				}
			}

			if (!ingredientId) return { ingredientId: null, lotId: null, description: null, matchedBy: null }
			const { data: ingredient } = await kit.from("ingredient").select("description").eq("id", ingredientId).maybeSingle()
			return { ingredientId, lotId: null, description: ingredient?.description ?? null, matchedBy }
		}
	)
