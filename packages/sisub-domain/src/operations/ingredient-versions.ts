import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListIngredientVersions, RecordIngredientVersion, RestoreIngredientVersion, VersionActor } from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client (ingredient_version pode não estar nos tipos gerados ainda)
type AnyClient = SupabaseClient<any, any, any>

// ── Shape do snapshot (deve espelhar o backfill SQL em 20260609_ingredient_versioning.sql) ──

export interface IngredientSnapshot {
	ingredient: {
		description: string | null
		folder_id: string | null
		folder_description: string | null
		measure_unit: string | null
		correction_factor: number | null
		ceafa_id: string | null
		ceafa_description: string | null
	}
	nutrients: { nutrient_id: string; name: string | null; value: number }[]
	product_items: {
		id: string
		description: string | null
		barcode: string | null
		purchase_measure_unit: string | null
		unit_content_quantity: number | null
		correction_factor: number | null
		purchase_item_id: string | null
	}[]
	purchase_links: {
		link_id: string
		purchase_item_id: string
		description: string | null
		catmat_item_codigo: number | null
		catmat_item_descricao: string | null
		purchase_measure_unit: string | null
		unit_price: number | null
		conversion_factor: number | null
		is_default: boolean
	}[]
}

export interface IngredientVersionRow {
	id: string
	ingredient_id: string
	version_number: number
	snapshot: IngredientSnapshot
	change_summary: string | null
	changed_by: string | null
	changed_by_name: string | null
	created_at: string
}

/** Stringify estável (chaves ordenadas recursivamente) para comparar snapshots
 *  independente da ordem de chaves do jsonb retornado pelo Postgres. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
	const obj = value as Record<string, unknown>
	const keys = Object.keys(obj).sort()
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

/** Lê o agregado completo do insumo (perspectiva da tela de edição) → snapshot. */
export async function buildIngredientSnapshot(client: AnyClient, ingredientId: string): Promise<IngredientSnapshot> {
	const { data: ing, error: ingErr } = await client
		.from("ingredient")
		.select("description, folder_id, measure_unit, correction_factor, ceafa_id, folder:folder_id(description), ceafa:ceafa_id(description)")
		.eq("id", ingredientId)
		.single()
	if (ingErr || !ing) throw new NotFoundError("ingredient", ingredientId)

	const folder = Array.isArray(ing.folder) ? ing.folder[0] : ing.folder
	const ceafa = Array.isArray(ing.ceafa) ? ing.ceafa[0] : ing.ceafa

	const { data: nutrientRows, error: nutErr } = await client
		.from("ingredient_nutrient")
		.select("nutrient_id, nutrient_value, nutrient:nutrient_id(name, display_order)")
		.eq("ingredient_id", ingredientId)
		.is("deleted_at", null)
	if (nutErr) throw new DomainError("QUERY_FAILED", nutErr.message)

	const nutrients = (nutrientRows ?? [])
		.map((r: Record<string, unknown>) => {
			const n = Array.isArray(r.nutrient) ? r.nutrient[0] : r.nutrient
			return {
				nutrient_id: r.nutrient_id as string,
				name: (n?.name as string) ?? null,
				value: Number(r.nutrient_value),
				_order: (n?.display_order as number) ?? 9999,
			}
		})
		.sort((a, b) => a._order - b._order || (a.name ?? "").localeCompare(b.name ?? ""))
		.map(({ _order, ...rest }) => rest)

	const { data: itemRows, error: itemErr } = await client
		.from("ingredient_item")
		.select("id, description, barcode, purchase_measure_unit, unit_content_quantity, correction_factor, purchase_item_id, created_at")
		.eq("ingredient_id", ingredientId)
		.is("deleted_at", null)
		.order("created_at", { ascending: true })
	if (itemErr) throw new DomainError("QUERY_FAILED", itemErr.message)

	const product_items = (itemRows ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		description: (r.description as string) ?? null,
		barcode: (r.barcode as string) ?? null,
		purchase_measure_unit: (r.purchase_measure_unit as string) ?? null,
		unit_content_quantity: r.unit_content_quantity != null ? Number(r.unit_content_quantity) : null,
		correction_factor: r.correction_factor != null ? Number(r.correction_factor) : null,
		purchase_item_id: (r.purchase_item_id as string) ?? null,
	}))

	const { data: linkRows, error: linkErr } = await client
		.from("purchase_item_ingredient")
		.select(
			"id, conversion_factor, is_default, created_at, purchase_item:purchase_item_id(id, description, catmat_item_codigo, catmat_item_descricao, purchase_measure_unit, unit_price, deleted_at)"
		)
		.eq("ingredient_id", ingredientId)
		.order("created_at", { ascending: true })
	if (linkErr) throw new DomainError("QUERY_FAILED", linkErr.message)

	const purchase_links = (linkRows ?? [])
		.map((r: Record<string, unknown>) => {
			const pi = Array.isArray(r.purchase_item) ? r.purchase_item[0] : r.purchase_item
			return { r, pi: pi as Record<string, unknown> | null }
		})
		.filter(({ pi }) => pi && pi.deleted_at == null)
		.map(({ r, pi }) => ({
			link_id: r.id as string,
			purchase_item_id: pi?.id as string,
			description: (pi?.description as string) ?? null,
			catmat_item_codigo: pi?.catmat_item_codigo != null ? Number(pi.catmat_item_codigo) : null,
			catmat_item_descricao: (pi?.catmat_item_descricao as string) ?? null,
			purchase_measure_unit: (pi?.purchase_measure_unit as string) ?? null,
			unit_price: pi?.unit_price != null ? Number(pi.unit_price) : null,
			conversion_factor: r.conversion_factor != null ? Number(r.conversion_factor) : null,
			is_default: Boolean(r.is_default),
		}))

	return {
		ingredient: {
			description: ing.description ?? null,
			folder_id: ing.folder_id ?? null,
			folder_description: (folder?.description as string) ?? null,
			measure_unit: ing.measure_unit ?? null,
			correction_factor: ing.correction_factor != null ? Number(ing.correction_factor) : null,
			ceafa_id: ing.ceafa_id ?? null,
			ceafa_description: (ceafa?.description as string) ?? null,
		},
		nutrients,
		product_items,
		purchase_links,
	}
}

/**
 * Registra uma nova versão do insumo se o snapshot atual divergir da última registrada.
 * Idempotente: chamadas repetidas com o mesmo estado não criam versões duplicadas.
 * @returns a versão criada, ou null se nada mudou (dedup).
 */
export async function recordIngredientVersion(
	client: AnyClient,
	ctx: UserContext,
	input: RecordIngredientVersion,
	actor?: VersionActor
): Promise<IngredientVersionRow | null> {
	requirePermission(ctx, "kitchen", 1)

	const snapshot = await buildIngredientSnapshot(client, input.ingredientId)

	const { data: latest, error: latestErr } = await client
		.from("ingredient_version")
		.select("snapshot, version_number")
		.eq("ingredient_id", input.ingredientId)
		.order("version_number", { ascending: false })
		.limit(1)
		.maybeSingle()
	if (latestErr) throw new DomainError("QUERY_FAILED", latestErr.message)

	if (latest && stableStringify(latest.snapshot) === stableStringify(snapshot)) {
		return null // sem mudanças → não versiona (dedup)
	}

	const nextVersion = (latest?.version_number ?? 0) + 1

	const { data, error } = await client
		.from("ingredient_version")
		.insert({
			ingredient_id: input.ingredientId,
			version_number: nextVersion,
			snapshot,
			change_summary: input.changeSummary ?? null,
			changed_by: actor?.id ?? ctx.userId ?? null,
			changed_by_name: actor?.name ?? null,
		})
		.select()
		.single()
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return data as IngredientVersionRow
}

export async function listIngredientVersions(client: AnyClient, ctx: UserContext, input: ListIngredientVersions): Promise<IngredientVersionRow[]> {
	requirePermission(ctx, "kitchen", 1)
	const { data, error } = await client
		.from("ingredient_version")
		.select("*")
		.eq("ingredient_id", input.ingredientId)
		.order("version_number", { ascending: false })
	if (error) throw new DomainError("QUERY_FAILED", error.message)
	return (data ?? []) as IngredientVersionRow[]
}

/**
 * Restaura o insumo ao estado de uma versão.
 * Reaplica: campos do insumo + nutrientes (substituição total) + reconciliação de itens
 * de produto (por id) + reconciliação de vínculos de compra (por purchase_item_id).
 * NÃO altera o catálogo compartilhado purchase_item (description/CATMAT/preço) — apenas o
 * conjunto de vínculos e seus fatores, que são "propriedade" do insumo.
 * Registra a própria restauração como nova versão.
 */
export async function restoreIngredientVersion(
	client: AnyClient,
	ctx: UserContext,
	input: RestoreIngredientVersion,
	actor?: VersionActor
): Promise<IngredientVersionRow | null> {
	requirePermission(ctx, "kitchen", 1)

	const { data: version, error: vErr } = await client
		.from("ingredient_version")
		.select("*")
		.eq("id", input.versionId)
		.eq("ingredient_id", input.ingredientId)
		.single()
	if (vErr || !version) throw new NotFoundError("ingredient_version", input.versionId)

	const snap = version.snapshot as IngredientSnapshot

	// 1) Campos do insumo
	const { error: updErr } = await client
		.from("ingredient")
		.update({
			description: snap.ingredient.description,
			folder_id: snap.ingredient.folder_id,
			measure_unit: snap.ingredient.measure_unit,
			correction_factor: snap.ingredient.correction_factor,
			ceafa_id: snap.ingredient.ceafa_id,
		})
		.eq("id", input.ingredientId)
	if (updErr) throw new DomainError("UPDATE_FAILED", updErr.message)

	// 2) Nutrientes — substituição total (soft-delete ativos, reinsere do snapshot)
	const { error: nutDelErr } = await client
		.from("ingredient_nutrient")
		.update({ deleted_at: new Date().toISOString() })
		.eq("ingredient_id", input.ingredientId)
		.is("deleted_at", null)
	if (nutDelErr) throw new DomainError("UPDATE_FAILED", nutDelErr.message)

	const nutInsert = snap.nutrients
		.filter((n) => n.value != null && !Number.isNaN(n.value))
		.map((n) => ({ ingredient_id: input.ingredientId, nutrient_id: n.nutrient_id, nutrient_value: n.value }))
	if (nutInsert.length > 0) {
		const { error: nutInsErr } = await client.from("ingredient_nutrient").insert(nutInsert)
		if (nutInsErr) throw new DomainError("INSERT_FAILED", nutInsErr.message)
	}

	// 3) Itens de produto (ingredient_item) — reconciliação por id
	const snapItemIds = new Set(snap.product_items.map((i) => i.id))
	const { data: currentItems, error: curItemErr } = await client
		.from("ingredient_item")
		.select("id")
		.eq("ingredient_id", input.ingredientId)
		.is("deleted_at", null)
	if (curItemErr) throw new DomainError("QUERY_FAILED", curItemErr.message)

	// soft-delete itens ativos que não existem no snapshot
	for (const cur of currentItems ?? []) {
		if (!snapItemIds.has(cur.id)) {
			const { error } = await client.from("ingredient_item").update({ deleted_at: new Date().toISOString() }).eq("id", cur.id)
			if (error) throw new DomainError("DELETE_FAILED", error.message)
		}
	}
	// upsert itens do snapshot (recria/atualiza, garante deleted_at null)
	for (const item of snap.product_items) {
		const { error } = await client.from("ingredient_item").upsert({
			id: item.id,
			ingredient_id: input.ingredientId,
			description: item.description,
			barcode: item.barcode,
			purchase_measure_unit: item.purchase_measure_unit,
			unit_content_quantity: item.unit_content_quantity,
			correction_factor: item.correction_factor,
			purchase_item_id: item.purchase_item_id,
			deleted_at: null,
		})
		if (error) throw new DomainError("UPDATE_FAILED", error.message)
	}

	// 4) Vínculos de compra (purchase_item_ingredient) — reconciliação por purchase_item_id
	const snapLinkPiIds = new Set(snap.purchase_links.map((l) => l.purchase_item_id))
	const { data: currentLinks, error: curLinkErr } = await client
		.from("purchase_item_ingredient")
		.select("id, purchase_item_id")
		.eq("ingredient_id", input.ingredientId)
	if (curLinkErr) throw new DomainError("QUERY_FAILED", curLinkErr.message)

	// remove vínculos atuais ausentes no snapshot
	for (const cur of currentLinks ?? []) {
		if (!snapLinkPiIds.has(cur.purchase_item_id)) {
			const { error } = await client.from("purchase_item_ingredient").delete().eq("id", cur.id)
			if (error) throw new DomainError("DELETE_FAILED", error.message)
		}
	}
	// upsert vínculos do snapshot (apenas se o purchase_item ainda existir)
	for (const link of snap.purchase_links) {
		const { data: piExists } = await client.from("purchase_item").select("id").eq("id", link.purchase_item_id).is("deleted_at", null).maybeSingle()
		if (!piExists) continue // catálogo removido — não recria
		const { error } = await client.from("purchase_item_ingredient").upsert(
			{
				purchase_item_id: link.purchase_item_id,
				ingredient_id: input.ingredientId,
				conversion_factor: link.conversion_factor ?? 1.0,
				is_default: link.is_default,
			},
			{ onConflict: "purchase_item_id,ingredient_id" }
		)
		if (error) throw new DomainError("UPDATE_FAILED", error.message)
	}

	// 5) Registra a restauração como nova versão
	return recordIngredientVersion(client, ctx, { ingredientId: input.ingredientId, changeSummary: `Restaurado da versão ${version.version_number}` }, actor)
}
