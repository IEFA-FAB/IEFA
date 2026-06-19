/**
 * Regressão happy-path — operations de PURCHASE ITEM (@iefa/sisub-domain).
 * Congela CRUD de purchase_item + junção purchase_item_ingredient ANTES da migração Drizzle.
 * Foco: filtro deleted_at, ordenação, search ilike, shape achatado da junção, is_default exclusivo.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createPurchaseItem,
	deletePurchaseItem,
	deletePurchaseItemIngredient,
	fetchIngredientPurchaseItems,
	fetchPurchaseItem,
	fetchPurchaseItemIngredients,
	fetchPurchaseItems,
	setDefaultPurchaseItemIngredient,
	updatePurchaseItem,
	upsertPurchaseItemIngredient,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("purchase-item operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("purchase_item")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("fetchPurchaseItems exclui deleted_at e filtra por search (ilike)", async () => {
		if (!reachable || !seeder || !db) return
		const tag = uid("PIQ")
		const activeId = await seeder.seedPurchaseItem({ description: `${tag} ativo` })
		const deletedId = await seeder.seedPurchaseItem({ description: `${tag} excluido`, deleted: true })

		const results = await fetchPurchaseItems(db, ctx, { search: tag })
		const ids = results.map((r) => r.id)
		expect(ids).toContain(activeId)
		expect(ids).not.toContain(deletedId)
	})

	test("createPurchaseItem → fetchPurchaseItem (round-trip com junção aninhada)", async () => {
		if (!reachable || !seeder || !db) return
		const created = await createPurchaseItem(db, ctx, { payload: { description: uid("[TEST] PI ") } })
		seeder.track("purchase_item", created.id)
		expect(created.id).toBeDefined()

		const ingredientId = await seeder.seedIngredient()
		await seeder.seedPurchaseItemIngredient({ purchaseItemId: created.id, ingredientId, isDefault: true })

		const fetched = await fetchPurchaseItem(db, ctx, { id: created.id })
		expect(fetched.id).toBe(created.id)
		expect(Array.isArray(fetched.purchase_item_ingredient)).toBe(true)
		expect(fetched.purchase_item_ingredient).toHaveLength(1)
		expect(fetched.purchase_item_ingredient[0].ingredient_id).toBe(ingredientId)
	})

	test("updatePurchaseItem persiste e deletePurchaseItem é soft (some da listagem)", async () => {
		if (!reachable || !seeder || !db) return
		const tag = uid("PIU")
		const id = await seeder.seedPurchaseItem({ description: `${tag} v1` })

		const updated = await updatePurchaseItem(db, ctx, { id, payload: { description: `${tag} v2` } })
		expect(updated.description).toBe(`${tag} v2`)
		expect(updated.updated_at).toBeTruthy()

		await deletePurchaseItem(db, ctx, { id })
		const remaining = await fetchPurchaseItems(db, ctx, { search: tag })
		expect(remaining.map((r) => r.id)).not.toContain(id)
	})

	test("fetchIngredientPurchaseItems achata o vínculo (link_id, conversion_factor, is_default) e ignora purchase_item deletado", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const activePi = await seeder.seedPurchaseItem({ description: uid("[TEST] PI ativo ") })
		const deletedPi = await seeder.seedPurchaseItem({ description: uid("[TEST] PI del "), deleted: true })
		const linkId = await seeder.seedPurchaseItemIngredient({ purchaseItemId: activePi, ingredientId, conversionFactor: 2.5, isDefault: true })
		await seeder.seedPurchaseItemIngredient({ purchaseItemId: deletedPi, ingredientId })

		const rows = await fetchIngredientPurchaseItems(db, ctx, { ingredientId })
		expect(rows).toHaveLength(1)
		expect(rows[0].link_id).toBe(linkId)
		expect(Number(rows[0].conversion_factor)).toBe(2.5)
		expect(rows[0].is_default).toBe(true)
		expect(rows[0].id).toBe(activePi) // ...pi achatado: id do purchase_item
	})

	test("setDefaultPurchaseItemIngredient torna exclusivo o is_default", async () => {
		if (!reachable || !seeder || !db) return
		const purchaseItemId = await seeder.seedPurchaseItem()
		const ingA = await seeder.seedIngredient()
		const ingB = await seeder.seedIngredient()
		const linkA = await seeder.seedPurchaseItemIngredient({ purchaseItemId, ingredientId: ingA, isDefault: true })
		const linkB = await seeder.seedPurchaseItemIngredient({ purchaseItemId, ingredientId: ingB, isDefault: false })

		await setDefaultPurchaseItemIngredient(db, ctx, { purchaseItemId, id: linkB })

		const links = await fetchPurchaseItemIngredients(db, ctx, { purchaseItemId })
		const byId = new Map(links.map((l) => [l.id, l.is_default]))
		expect(byId.get(linkA)).toBe(false)
		expect(byId.get(linkB)).toBe(true)
	})

	test("upsertPurchaseItemIngredient resolve conflito (purchase_item_id, ingredient_id)", async () => {
		if (!reachable || !seeder || !db) return
		const purchaseItemId = await seeder.seedPurchaseItem()
		const ingredientId = await seeder.seedIngredient()
		const first = await upsertPurchaseItemIngredient(db, ctx, {
			payload: { purchase_item_id: purchaseItemId, ingredient_id: ingredientId, conversion_factor: 1, is_default: false },
		})
		seeder.trackWhere("purchase_item_ingredient", "purchase_item_id", purchaseItemId)
		const second = await upsertPurchaseItemIngredient(db, ctx, {
			payload: { purchase_item_id: purchaseItemId, ingredient_id: ingredientId, conversion_factor: 3, is_default: false },
		})

		expect(second.id).toBe(first.id) // mesma linha (upsert, não duplica)
		expect(Number(second.conversion_factor)).toBe(3)

		await deletePurchaseItemIngredient(db, ctx, { id: second.id })
		const after = await fetchPurchaseItemIngredients(db, ctx, { purchaseItemId })
		expect(after.map((r) => r.id)).not.toContain(second.id)
	})
})
