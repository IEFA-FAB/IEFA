import { createHash } from "node:crypto"
import type { ParsedFood, ParsedSource, SupabaseAny } from "./types.ts"

/**
 * Persists a parsed source into `nutrition_reference.*`, versioned and SAFE:
 *
 *  - Every read and write is scoped to `sourceId`. A TACO import can only ever
 *    touch TACO rows; it never reads, updates or deletes another source's data.
 *  - Nothing is ever DELETED. A re-import that changes a food inserts a NEW
 *    `food_item_revision` and flips `is_current`; the old revision and its
 *    nutrient values stay for audit and to keep `kitchen.ingredient_nutrition_reference`
 *    links (FK `on delete restrict`) intact.
 *  - Unchanged foods (same content hash) are skipped — re-runs are idempotent.
 */

const CHUNK = 500

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
	return out
}

function contentHash(food: ParsedFood): string {
	const canonical = {
		name: food.displayName,
		original: food.originalName ?? null,
		group: food.groupCode ?? null,
		base: [food.baseQuantity ?? 100, food.baseUnit ?? "g"],
		values: [...food.values].map((v) => [v.componentCode, v.value, v.valueKind, v.rawValue ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
	}
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export async function persistSourceImport(supabase: SupabaseAny, sourceId: string, parsed: ParsedSource): Promise<number> {
	const now = new Date().toISOString()

	// 1) Release row (unique per source_id + version_label). Scoped write.
	const { data: releaseRow, error: relErr } = await supabase
		.from("source_release")
		.upsert(
			{
				source_id: sourceId,
				version_label: parsed.versionLabel,
				upstream_url: parsed.upstreamUrl,
				download_url: parsed.downloadUrl,
				published_at: parsed.publishedAt ?? null,
				checksum_sha256: parsed.checksumSha256 ?? null,
				status: "active",
				fetched_at: now,
			},
			{ onConflict: "source_id,version_label" }
		)
		.select("id")
		.single()
	if (relErr || !releaseRow) throw new Error(`source_release upsert falhou: ${relErr?.message}`)
	const releaseId = releaseRow.id as string

	// 2) Nutrient components (unique per source_id + external_code). Scoped write.
	for (const part of chunk(parsed.components, CHUNK)) {
		const { error } = await supabase.from("nutrient_component").upsert(
			part.map((c) => ({
				source_id: sourceId,
				external_code: c.externalCode,
				name: c.name,
				unit: c.unit,
				infoods_tag: c.infoodsTag ?? null,
			})),
			{ onConflict: "source_id,external_code" }
		)
		if (error) throw new Error(`nutrient_component upsert falhou: ${error.message}`)
	}
	const { data: compRows, error: compErr } = await supabase.from("nutrient_component").select("id, external_code").eq("source_id", sourceId)
	if (compErr) throw new Error(`nutrient_component select falhou: ${compErr.message}`)
	const componentIdByCode = new Map<string, string>((compRows ?? []).map((r) => [r.external_code as string, r.id as string]))

	// 3) Food identities (unique per source_id + external_code). Scoped write; never clobbers current_revision_id.
	for (const part of chunk(parsed.foods, CHUNK)) {
		const { error } = await supabase.from("food_item").upsert(
			part.map((f) => ({ source_id: sourceId, external_code: f.externalCode })),
			{ onConflict: "source_id,external_code" }
		)
		if (error) throw new Error(`food_item upsert falhou: ${error.message}`)
	}
	const { data: foodRows, error: foodErr } = await supabase.from("food_item").select("id, external_code, current_revision_id").eq("source_id", sourceId)
	if (foodErr) throw new Error(`food_item select falhou: ${foodErr.message}`)
	const foodIdByCode = new Map<string, string>((foodRows ?? []).map((r) => [r.external_code as string, r.id as string]))
	// The pointer `food_item.current_revision_id` (a scalar column) is the single
	// source of truth for "which revision is current" — NOT `is_current`. If a crash
	// between steps 6–8 ever leaves two `is_current=true` rows for a food (no wrapping
	// transaction), reading `is_current` would be ambiguous; the scalar pointer never is.
	const currentRevIdByFoodId = new Map<string, string>()
	for (const r of foodRows ?? []) {
		if (r.current_revision_id) currentRevIdByFoodId.set(r.id as string, r.current_revision_id as string)
	}

	// 4) Hash of each food's CURRENT revision (resolved via the pointer) — to skip unchanged foods.
	const currentRevIds = [...currentRevIdByFoodId.values()]
	const hashByRevId = new Map<string, string>()
	for (const part of chunk(currentRevIds, CHUNK)) {
		const { data, error } = await supabase.from("food_item_revision").select("id, content_hash").in("id", part)
		if (error) throw new Error(`food_item_revision select falhou: ${error.message}`)
		for (const r of data ?? []) hashByRevId.set(r.id as string, r.content_hash as string)
	}
	const currentByFoodId = new Map<string, { id: string; hash: string }>()
	for (const [foodItemId, revId] of currentRevIdByFoodId) {
		const hash = hashByRevId.get(revId)
		if (hash != null) currentByFoodId.set(foodItemId, { id: revId, hash })
	}

	// 5) Diff: only changed/new foods produce a new revision.
	type Pending = { food: ParsedFood; foodItemId: string; hash: string }
	const pending: Pending[] = []
	for (const food of parsed.foods) {
		const foodItemId = foodIdByCode.get(food.externalCode)
		if (!foodItemId) continue
		const hash = contentHash(food)
		const current = currentByFoodId.get(foodItemId)
		if (current && current.hash === hash) continue // unchanged — skip
		pending.push({ food, foodItemId, hash })
	}

	if (pending.length === 0) {
		await supabase.from("source_release").update({ imported_at: now }).eq("id", releaseId)
		return 0
	}

	// Steps 6–8 are not wrapped in a single DB transaction (Supabase REST). To keep
	// re-runs self-healing after a mid-way crash, they are ordered so the scalar pointer
	// `food_item.current_revision_id` is the authority and is moved AFTER the new revision
	// exists but BEFORE `is_current` is flipped. New revisions are inserted `is_current=false`
	// and promoted only once the pointer is in place, so a crash can leave at most a stray
	// `is_current` flag (ignored — step 4 reads the pointer, not `is_current`), never an
	// ambiguous "current" or a stale/orphaned pointer.

	// 6) Insert new revisions as NOT current yet, mapped back by food_item_id.
	const revIdByFoodItemId = new Map<string, string>()
	for (const part of chunk(pending, CHUNK)) {
		const { data, error } = await supabase
			.from("food_item_revision")
			.insert(
				part.map((p) => ({
					food_item_id: p.foodItemId,
					source_release_id: releaseId,
					display_name: p.food.displayName,
					original_name: p.food.originalName ?? null,
					group_code: p.food.groupCode ?? null,
					group_name: p.food.groupName ?? null,
					food_type: p.food.foodType ?? null,
					scientific_name: p.food.scientificName ?? null,
					base_quantity: p.food.baseQuantity ?? 100,
					base_unit: p.food.baseUnit ?? "g",
					normalized_name: normalizeName(p.food.displayName),
					content_hash: p.hash,
					raw: p.food.raw ?? {},
					is_current: false,
				}))
			)
			.select("id, food_item_id")
		if (error) throw new Error(`food_item_revision insert falhou: ${error.message}`)
		for (const r of data ?? []) revIdByFoodItemId.set(r.food_item_id as string, r.id as string)
	}

	// 7a) Point food_item at the new revision (the authority). No deletes.
	// Batched upsert on the primary key (id) — updates current_revision_id for many
	// foods per round-trip. source_id/external_code are re-sent unchanged (NOT NULL cols).
	const pointerRows = pending
		.map((p) => {
			const newRevId = revIdByFoodItemId.get(p.foodItemId)
			return newRevId ? { id: p.foodItemId, source_id: sourceId, external_code: p.food.externalCode, current_revision_id: newRevId } : null
		})
		.filter((r): r is NonNullable<typeof r> => r !== null)
	for (const part of chunk(pointerRows, CHUNK)) {
		const { error } = await supabase.from("food_item").upsert(part, { onConflict: "id" })
		if (error) throw new Error(`atualizar current_revision_id falhou: ${error.message}`)
	}

	// 7b) Reconcile `is_current` to match the pointer for the affected foods: demote every
	// prior/stray current revision, then promote the new ones. Demoting by food scope (not
	// just the recorded `supersedes`) also cleans up any stray flags left by an earlier crash.
	const newRevIds = [...revIdByFoodItemId.values()]
	const affectedFoodIds = pending.map((p) => p.foodItemId).filter((id) => revIdByFoodItemId.has(id))
	for (const part of chunk(affectedFoodIds, CHUNK)) {
		const { error } = await supabase.from("food_item_revision").update({ is_current: false }).in("food_item_id", part).eq("is_current", true)
		if (error) throw new Error(`demote revisão anterior falhou: ${error.message}`)
	}
	for (const part of chunk(newRevIds, CHUNK)) {
		const { error } = await supabase.from("food_item_revision").update({ is_current: true }).in("id", part)
		if (error) throw new Error(`promover revisão atual falhou: ${error.message}`)
	}

	// 8) Nutrient values for the new revisions only. Deduplicate by (revision, component):
	// some sources (USDA food_nutrient.csv) list the same nutrient more than once per food,
	// which would otherwise break the ON CONFLICT upsert. Keep the first non-null value.
	type ValueRow = { food_revision_id: string; component_id: string; value: number | null; value_kind: string; raw_value: string | null }
	const valueByKey = new Map<string, ValueRow>()
	for (const p of pending) {
		const revId = revIdByFoodItemId.get(p.foodItemId)
		if (!revId) continue
		for (const v of p.food.values) {
			const componentId = componentIdByCode.get(v.componentCode)
			if (!componentId) continue
			const key = `${revId}|${componentId}`
			const existing = valueByKey.get(key)
			if (existing && existing.value != null) continue // keep the first non-null value we saw
			valueByKey.set(key, { food_revision_id: revId, component_id: componentId, value: v.value, value_kind: v.valueKind, raw_value: v.rawValue ?? null })
		}
	}
	const valueRows = [...valueByKey.values()]
	for (const part of chunk(valueRows, CHUNK)) {
		const { error } = await supabase.from("food_nutrient_value").upsert(part, { onConflict: "food_revision_id,component_id" })
		if (error) throw new Error(`food_nutrient_value upsert falhou: ${error.message}`)
	}

	await supabase.from("source_release").update({ imported_at: now }).eq("id", releaseId)
	return pending.length
}

function normalizeName(name: string): string {
	return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}
