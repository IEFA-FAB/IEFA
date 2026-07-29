/**
 * @module gtin.fn
 * GTIN (GS1): lookup via proxy da API (Verified by GS1) + vínculo GTIN → ingredient_item.
 * CLIENT: getServerClient (service role) para gs1_integration/kitchen; fetch externo IEFA_API_BASE_URL para o lookup.
 * AUTH: `global` nível 2 (curadoria de catálogo — espelha o módulo global de insumos);
 *   o lookup carimba o ADMIN_SECRET do servidor no salto para a API, então o guard é obrigatório.
 * TABLES: gs1_integration.gtin, kitchen.ingredient_item.
 * @domain external
 * @migration 20260728121000_gs1_gtin_catalog
 */

import { parseGtin } from "@iefa/sisub-domain/gtin"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getServerClient } from "@/lib/supabase.server"

const API_BASE = (process.env.IEFA_API_BASE_URL || "https://api.iefa.com.br").replace(/\/+$/, "")

/**
 * As tabelas/views de gs1_integration entram nos tipos gerados apenas após o
 * `bun run db:types` pós-migration (task 2.4 do change sisub-inventory-cycle).
 * Até lá, acesso frouxo e explícito — não espalhar `any` pelos call sites.
 */
// biome-ignore lint/suspicious/noExplicitAny: tipos gerados ainda sem as tabelas novas (ver acima)
type LooseClient = { from: (table: string) => any }

export interface GtinLookupResult {
	gtin: string
	description: string | null
	brand: string | null
	net_content: number | null
	net_content_unit: string | null
	ncm: string | null
	gpc_brick_code: string | null
	source: string
	verified_at: string | null
}

/**
 * Looks a GTIN up through the API proxy (cache-first, Verified by GS1 behind it).
 *
 * @throws {Error} "GTIN inválido" before any network hop; friendly messages for 404/503 from the API.
 */
export const lookupGtinFn = createServerFn({ method: "GET" })
	.validator(z.object({ gtin: z.string().min(8).max(14) }))
	.handler(async ({ data }): Promise<GtinLookupResult> => {
		await requireAuthWithPermission("global", 2)

		const gtin = parseGtin(data.gtin)
		if (!gtin) throw new Error("GTIN inválido (formato ou dígito verificador)")

		const res = await fetch(`${API_BASE}/api/admin/gs1/lookup/${gtin}`, {
			headers: { "x-admin-secret": process.env.ADMIN_SECRET ?? "" },
		})
		if (res.status === 404) throw new Error("GTIN não encontrado no Verified by GS1 — cadastre manualmente")
		if (res.status === 503) throw new Error("Verified by GS1 indisponível — cadastre o GTIN manualmente")
		if (!res.ok) throw new Error(`API retornou ${res.status}`)
		return (await res.json()) as GtinLookupResult
	})

/**
 * Links a validated GTIN to an ingredient_item, creating the gtin entity when absent
 * (source "manual"). Fails clearly when another live item already owns the GTIN
 * (partial unique index ingredient_item_gtin_unique).
 */
export const attachGtinToIngredientItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			ingredientItemId: z.string().uuid(),
			gtin: z.string().min(8).max(14),
			description: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("global", 2)

		const gtin = parseGtin(data.gtin)
		if (!gtin) throw new Error("GTIN inválido (formato ou dígito verificador)")

		const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
		const kitchen = getServerClient("kitchen") as unknown as LooseClient

		const { data: existing, error: readError } = await gs1.from("gtin").select("gtin").eq("gtin", gtin).maybeSingle()
		if (readError) throw new Error(`Erro ao consultar GTIN: ${readError.message}`)
		if (!existing) {
			const { error: insertError } = await gs1.from("gtin").insert({ gtin, description: data.description?.trim() || null, source: "manual" })
			if (insertError) throw new Error(`Erro ao cadastrar GTIN: ${insertError.message}`)
		}

		const { error: linkError } = await kitchen.from("ingredient_item").update({ gtin }).eq("id", data.ingredientItemId)
		if (linkError) {
			if (linkError.code === "23505") throw new Error("Este GTIN já está vinculado a outro item vivo")
			throw new Error(`Erro ao vincular GTIN: ${linkError.message}`)
		}
		return { gtin }
	})
