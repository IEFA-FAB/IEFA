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
 * Entre os insumos para os quais um código aponta, o que tem lote nesta
 * cozinha; sem nenhum com lote, o primeiro. Lista vazia → `undefined`.
 */
async function preferStocked(kitchenId: number, ingredientIds: readonly string[]): Promise<string | undefined> {
	const unique = [...new Set(ingredientIds)]
	if (unique.length <= 1) return unique[0]
	const { data: lots, error } = await inventory()
		.from("stock_lot")
		.select("ingredient_id")
		.eq("kitchen_id", kitchenId)
		.in("ingredient_id", unique)
		.is("quarantined_at", null)
		.limit(1)
	if (error) throw new Error(`Erro ao resolver o código lido: ${error.message}`)
	return ((lots ?? [])[0]?.ingredient_id as string | undefined) ?? unique[0]
}

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
				const { data: lot, error: lotError } = await inv
					.from("stock_lot")
					.select("id, ingredient_id")
					.eq("kitchen_id", data.kitchenId)
					.eq("short_code", data.lotShortCode.toUpperCase())
					.maybeSingle()
				if (lotError) throw new Error(`Erro ao resolver a etiqueta lida: ${lotError.message}`)
				if (!lot?.ingredient_id) return { ingredientId: null, lotId: (lot?.id as string) ?? null, description: null, matchedBy: null }
				const { data: ingredient, error: ingredientError } = await kit.from("ingredient").select("description").eq("id", lot.ingredient_id).maybeSingle()
				if (ingredientError) throw new Error(`Erro ao carregar o insumo: ${ingredientError.message}`)
				return { ingredientId: lot.ingredient_id as string, lotId: lot.id as string, description: ingredient?.description ?? null, matchedBy: "lot" }
			}

			if (!data.gtin) return { ingredientId: null, lotId: null, description: null, matchedBy: null }

			// O GTIN do catálogo também pode repetir: `ingredient_item.gtin` não é
			// único, e dois SKUs com o mesmo código não são um erro — são o mesmo
			// produto cadastrado por duas cozinhas antes da revisão global juntar
			// os dois. Nenhuma das duas leituras usa `maybeSingle`.
			//
			// SKU apagado não conta: o código de um produto que saiu do catálogo
			// resolvia para ele, e a embalagem na mão do operador era dita "sem saldo
			// nesta cozinha". E, entre os insumos que o código aponta, ganha o que TEM
			// lote nesta cozinha — pegar "o primeiro pela ordem do id" escolhia o
			// insumo da outra cozinha.
			const { data: skus, error: skuError } = await kit
				.from("ingredient_item")
				.select("ingredient_id")
				.eq("gtin", data.gtin)
				.not("ingredient_id", "is", null)
				.is("deleted_at", null)
				.order("ingredient_id", { ascending: true })
				.limit(50)
			if (skuError) throw new Error(`Erro ao resolver o código lido: ${skuError.message}`)
			let ingredientId = await preferStocked(
				data.kitchenId,
				((skus ?? []) as Array<{ ingredient_id: string }>).map((row) => row.ingredient_id)
			)
			let matchedBy: "gtin" | "alias" = "gtin"

			if (!ingredientId) {
				// `gtin_alias` tem chave única `(gtin, ingredient_item_id)`, ou seja,
				// o MESMO GTIN pode ter mais de um apelido — é o caso do fornecedor
				// que manda o código da caixa para dois SKUs parecidos. Com
				// `maybeSingle` isso virava PGRST116, o erro era descartado e a
				// leitura respondia "não está no catálogo" justamente para os
				// códigos que a tabela de apelidos existe para resolver.
				const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
				const { data: aliases, error: aliasError } = await gs1
					.from("gtin_alias")
					.select("ingredient_item_id, status")
					.eq("gtin", data.gtin)
					.neq("status", "rejected")
					// apelido já aprovado ganha do pendente: 'approved' < 'pending'
					.order("status", { ascending: true })
					.order("ingredient_item_id", { ascending: true })
					.limit(1)
				if (aliasError) throw new Error(`Erro ao resolver o código lido: ${aliasError.message}`)
				const alias = (aliases ?? [])[0]
				if (alias?.ingredient_item_id) {
					const { data: aliasItem, error: aliasItemError } = await kit
						.from("ingredient_item")
						.select("ingredient_id")
						.eq("id", alias.ingredient_item_id)
						.is("deleted_at", null)
						.maybeSingle()
					if (aliasItemError) throw new Error(`Erro ao resolver o código lido: ${aliasItemError.message}`)
					ingredientId = (aliasItem?.ingredient_id as string | undefined) ?? undefined
					matchedBy = "alias"
				}
			}

			if (!ingredientId) return { ingredientId: null, lotId: null, description: null, matchedBy: null }
			const { data: ingredient, error: ingredientError } = await kit.from("ingredient").select("description").eq("id", ingredientId).maybeSingle()
			if (ingredientError) throw new Error(`Erro ao carregar o insumo: ${ingredientError.message}`)
			return { ingredientId, lotId: null, description: ingredient?.description ?? null, matchedBy }
		}
	)
