/**
 * Regressão happy-path — operations de EQUIPAMENTOS (@iefa/sisub-domain).
 *
 * Foco no que só o banco real prova: o XOR papel/modelo, o índice único que impede a mesma
 * exigência duas vezes, e — o cálculo que motivou o épico — o multifuncional atendendo dois
 * papéis ao mesmo tempo e falhando no terceiro.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createEquipmentModel,
	createEquipmentRole,
	createEquipmentUnit,
	evaluateRecipeEquipmentFitness,
	fetchRecipeEquipment,
	listEquipmentModels,
	listKitchenEquipment,
	saveRecipeEquipment,
	updateEquipmentUnit,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("equipment operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("equipment_role")
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

	/** Papel novo por execução — o catálogo semeado é compartilhado e não pode ser mutado no teste. */
	async function seedRole(database: SisubDb, s: Seeder, suffix: string) {
		const code = uid("test_role_")
			.toLowerCase()
			.replace(/[^a-z0-9_]/g, "_")
		const role = await createEquipmentRole(database, ctx, { code: `${code}_${suffix}`, name: `[TEST] ${suffix}`, category: "coccao", sortOrder: 900 })
		s.track("equipment_role", role.id)
		return role
	}

	/** Modelo global com os papéis informados; `slots` = zonas independentes. */
	async function seedModel(database: SisubDb, s: Seeder, roleIds: string[], slots: number) {
		const model = await createEquipmentModel(database, ctx, {
			name: uid("[TEST] Modelo "),
			manufacturer: "[TEST]",
			simultaneousSlots: slots,
			isGeneric: false,
			kitchenId: null,
			roles: roleIds.map((roleId, index) => ({ roleId, isPrimary: index === 0 })),
		})
		s.track("equipment_model", model.id)
		s.trackWhere("equipment_model_role", "model_id", model.id)
		return model
	}

	test("modelo criado aparece na listagem com os papéis que assume", async () => {
		if (!reachable || !seeder || !db) return
		const griddle = await seedRole(db, seeder, "chapa")
		const pressure = await seedRole(db, seeder, "pressao")
		const model = await seedModel(db, seeder, [griddle.id, pressure.id], 2)

		expect(model.roles.map((r) => r.role_id).sort()).toEqual([griddle.id, pressure.id].sort())
		expect(model.roles.find((r) => r.is_primary)?.role_id).toBe(griddle.id)

		const list = await listEquipmentModels(db, ctx, { kitchenId: null })
		expect(list.map((m) => m.id)).toContain(model.id)
	})

	test("unidade herda os papéis do modelo e a exceção da unidade os ajusta", async () => {
		if (!reachable || !seeder || !db) return
		const griddle = await seedRole(db, seeder, "chapa")
		const pressure = await seedRole(db, seeder, "pressao")
		const model = await seedModel(db, seeder, [griddle.id, pressure.id], 2)
		const { id: kitchenId } = await seeder.seedKitchen()

		const unit = await createEquipmentUnit(db, ctx, {
			kitchenId,
			modelId: model.id,
			label: uid("[TEST] Equip "),
			status: "active",
			roleOverrides: [],
		})
		seeder.track("equipment_unit", unit.id)
		seeder.trackWhere("equipment_unit_role", "unit_id", unit.id)

		expect(unit.effective_role_ids.sort()).toEqual([griddle.id, pressure.id].sort())
		expect(unit.effective_slots).toBe(2)

		// Tampa de pressão ausente nesta unidade: o papel some do parque efetivo.
		const patched = await updateEquipmentUnit(db, ctx, { unitId: unit.id, roleOverrides: [{ roleId: pressure.id, available: false }] })
		expect(patched.effective_role_ids).toEqual([griddle.id])

		const parque = await listKitchenEquipment(db, ctx, { kitchenId, includeInactive: false })
		expect(parque.find((u) => u.id === unit.id)?.effective_role_ids).toEqual([griddle.id])
	})

	test("lista mínima faz round-trip e o mesmo alvo repetido é recusado", async () => {
		if (!reachable || !seeder || !db) return
		const role = await seedRole(db, seeder, "forno")
		const recipeId = await seeder.seedRecipe({})
		seeder.trackWhere("recipe_equipment_requirement", "recipe_id", recipeId)

		const saved = await saveRecipeEquipment(db, ctx, {
			recipeId,
			requirements: [{ roleId: role.id, quantity: 2, minCapacityGn: 10, recipeStepId: null, modelId: null, minCapacityLiters: null, notes: null }],
		})
		expect(saved).toHaveLength(1)
		expect(saved[0].quantity).toBe(2)
		expect(saved[0].min_capacity_gn).toBe(10)
		expect(saved[0].role?.id).toBe(role.id)

		const fetched = await fetchRecipeEquipment(db, ctx, { recipeId })
		expect(fetched.map((r) => r.id)).toEqual(saved.map((r) => r.id))

		await expect(
			saveRecipeEquipment(db, ctx, {
				recipeId,
				requirements: [
					{ roleId: role.id, quantity: 1, recipeStepId: null, modelId: null, minCapacityLiters: null, minCapacityGn: null, notes: null },
					{ roleId: role.id, quantity: 1, recipeStepId: null, modelId: null, minCapacityLiters: null, minCapacityGn: null, notes: null },
				],
			})
		).rejects.toThrow()
	})

	test("multifuncional de 2 zonas atende dois papéis e falha no terceiro", async () => {
		if (!reachable || !seeder || !db) return
		const griddle = await seedRole(db, seeder, "chapa")
		const pressure = await seedRole(db, seeder, "pressao")
		const fryer = await seedRole(db, seeder, "fritadeira")
		const model = await seedModel(db, seeder, [griddle.id, pressure.id, fryer.id], 2)
		const { id: kitchenId } = await seeder.seedKitchen()

		const unit = await createEquipmentUnit(db, ctx, {
			kitchenId,
			modelId: model.id,
			label: uid("[TEST] Multi "),
			status: "active",
			roleOverrides: [],
		})
		seeder.track("equipment_unit", unit.id)
		seeder.trackWhere("equipment_unit_role", "unit_id", unit.id)

		const recipeId = await seeder.seedRecipe({ kitchenId })
		seeder.trackWhere("recipe_equipment_requirement", "recipe_id", recipeId)

		const base = { recipeStepId: null, modelId: null, minCapacityLiters: null, minCapacityGn: null, notes: null, quantity: 1 }
		await saveRecipeEquipment(db, ctx, {
			recipeId,
			requirements: [
				{ ...base, roleId: griddle.id },
				{ ...base, roleId: pressure.id },
			],
		})
		const duas = await evaluateRecipeEquipmentFitness(db, ctx, { recipeId, kitchenId })
		expect(duas.satisfied).toBe(true)
		expect(duas.missing_total).toBe(0)

		await saveRecipeEquipment(db, ctx, {
			recipeId,
			requirements: [
				{ ...base, roleId: griddle.id },
				{ ...base, roleId: pressure.id },
				{ ...base, roleId: fryer.id },
			],
		})
		const tres = await evaluateRecipeEquipmentFitness(db, ctx, { recipeId, kitchenId })
		expect(tres.satisfied).toBe(false)
		expect(tres.missing_total).toBe(1)
	})

	test("preparação sem lista mínima devolve unspecified, não 'não atende'", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const recipeId = await seeder.seedRecipe({ kitchenId })

		const fitness = await evaluateRecipeEquipmentFitness(db, ctx, { recipeId, kitchenId })
		expect(fitness.unspecified).toBe(true)
		expect(fitness.satisfied).toBe(true)
	})
})
