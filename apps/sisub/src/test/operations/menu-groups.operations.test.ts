/**
 * Regressão happy-path — operations de CONJUNTOS DE GRUPOS (@iefa/sisub-domain).
 *
 * O que este arquivo protege, e que nenhum teste unitário alcança:
 *   • o seed em produção — as três refeições genéricas apontam para um conjunto,
 *     e o almoço TEM salada (foi o pedido que originou a tabela);
 *   • substituição destrutiva dos grupos (ausente não mexe, presente troca tudo);
 *   • a recusa de apagar conjunto em uso — sem ela a refeição cairia no conjunto
 *     padrão calada, com o cardápio inteiro parecendo desgrupado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createMenuGroupSet,
	DEFAULT_GROUP_SET_SLUG,
	DEFAULT_MENU_GROUP_SETS,
	deleteMenuGroupSet,
	fetchMenuGroupSets,
	updateMealType,
	updateMenuGroupSet,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("menu group set operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("menu_group_set")
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

	test("os conjuntos semeados estão no banco, com os grupos do domínio na ordem declarada", async () => {
		if (!reachable || !db) return
		const sets = await fetchMenuGroupSets(db, ctx, { kitchenId: null })

		for (const expected of DEFAULT_MENU_GROUP_SETS) {
			const found = sets.find((s) => s.slug === expected.slug)
			expect(found, `conjunto ${expected.slug} ausente no banco`).toBeTruthy()
			expect(found?.groups.map((g) => g.key)).toEqual(expected.groups.map((g) => g.key))
		}
	})

	test("o conjunto padrão do almoço tem salada", async () => {
		if (!reachable || !db) return
		const sets = await fetchMenuGroupSets(db, ctx, { kitchenId: null })
		const principal = sets.find((s) => s.slug === DEFAULT_GROUP_SET_SLUG)

		// O grupo que motivou a mudança: antes dele a salada do almoço não tinha
		// onde entrar e ficava sem grupo nenhum.
		expect(principal?.groups.map((g) => g.key)).toContain("salada")
	})

	test("createMenuGroupSet grava os grupos na ordem recebida (write→read)", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const created = await createMenuGroupSet(db, ctx, {
			name: uid("[TEST] Conjunto "),
			kitchenId,
			groups: [
				{ key: "sopa", label: "Sopa" },
				{ key: "pao", label: "Pães" },
			],
		})
		seeder.track("menu_group_set", created.id)

		expect(created.groups.map((g) => g.key)).toEqual(["sopa", "pao"])

		const list = await fetchMenuGroupSets(db, ctx, { kitchenId })
		expect(list.find((s) => s.id === created.id)?.groups.map((g) => g.label)).toEqual(["Sopa", "Pães"])
	})

	test("updateMenuGroupSet sem `groups` não mexe nos grupos; com `groups` substitui a lista", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const created = await createMenuGroupSet(db, ctx, {
			name: uid("[TEST] Conjunto "),
			kitchenId,
			groups: [{ key: "sopa", label: "Sopa" }],
		})
		seeder.track("menu_group_set", created.id)

		// Renomear o conjunto não pode apagar as colunas dele.
		const renamed = await updateMenuGroupSet(db, ctx, { groupSetId: created.id, name: uid("[TEST] Renomeado ") })
		expect(renamed.groups.map((g) => g.key)).toEqual(["sopa"])

		const replaced = await updateMenuGroupSet(db, ctx, {
			groupSetId: created.id,
			groups: [
				{ key: "salada", label: "Salada" },
				{ key: "sopa", label: "Sopa" },
			],
		})
		expect(replaced.groups.map((g) => g.key)).toEqual(["salada", "sopa"])
	})

	test("deleteMenuGroupSet recusa conjunto em uso por uma refeição", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const created = await createMenuGroupSet(db, ctx, {
			name: uid("[TEST] Conjunto "),
			kitchenId,
			groups: [{ key: "sopa", label: "Sopa" }],
		})
		seeder.track("menu_group_set", created.id)
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		await updateMealType(db, ctx, { mealTypeId, groupSetId: created.id })

		await expect(deleteMenuGroupSet(db, ctx, { groupSetId: created.id })).rejects.toThrow(/em uso/i)

		// Soltando a refeição, o conjunto sai. `null` aqui é escolha: volta ao padrão.
		await updateMealType(db, ctx, { mealTypeId, groupSetId: null })
		await deleteMenuGroupSet(db, ctx, { groupSetId: created.id })
		const list = await fetchMenuGroupSets(db, ctx, { kitchenId })
		expect(list.map((s) => s.id)).not.toContain(created.id)
	})
})
