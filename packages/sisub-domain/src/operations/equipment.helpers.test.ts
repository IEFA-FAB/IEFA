import { describe, expect, test } from "bun:test"
import type { UpdateEquipmentModel, UpdateEquipmentUnit } from "../schemas/index.ts"
import { aggregateFitnessByTarget, buildEquipmentModelPatch, buildEquipmentUnitPatch, type MenuDemandMeta, planMenuItemBatches } from "./equipment.ts"

const MODEL_ID = "11111111-1111-4111-8111-111111111111"
const UNIT_ID = "22222222-2222-4222-8222-222222222222"

describe("buildEquipmentModelPatch", () => {
	test("só o id: patch vazio (a edição relê a linha em vez de gravar)", () => {
		expect(buildEquipmentModelPatch({ modelId: MODEL_ID } as UpdateEquipmentModel)).toEqual({})
	})

	test("ausente mantém, nulo limpa; obrigatório nulo não entra", () => {
		const patch = buildEquipmentModelPatch({
			modelId: MODEL_ID,
			name: null,
			simultaneousSlots: null,
			manufacturer: null,
			powerKw: null,
			widthCm: 60,
			voltage: "220",
			requiresHood: false,
		} as unknown as UpdateEquipmentModel)
		expect(patch).toEqual({ manufacturer: null, powerKw: null, voltage: "220", widthCm: 60, requiresHood: false })
	})

	test("todos os campos, na ordem das regras", () => {
		const patch = buildEquipmentModelPatch({
			modelId: MODEL_ID,
			expectedLifespanYears: 10,
			manualUrl: "https://x",
			drainRequired: true,
			waterInlet: false,
			requiresHood: true,
			weightKg: 80,
			heightCm: 90,
			depthCm: 70,
			widthCm: 60,
			voltage: "380",
			energySource: "gas",
			notes: "n",
			powerKw: 12,
			simultaneousSlots: 6,
			capacityLabel: "6 GN",
			slotCapacityGn: "1/1",
			slotCapacityLiters: 10,
			name: "Combinado",
			manufacturer: "Rational",
			roles: [],
		} as unknown as UpdateEquipmentModel)
		expect(Object.keys(patch)).toEqual([
			"manufacturer",
			"name",
			"slotCapacityLiters",
			"slotCapacityGn",
			"capacityLabel",
			"simultaneousSlots",
			"powerKw",
			"notes",
			"energySource",
			"voltage",
			"widthCm",
			"depthCm",
			"heightCm",
			"weightKg",
			"requiresHood",
			"waterInlet",
			"drainRequired",
			"manualUrl",
			"expectedLifespanYears",
		])
		expect(patch.name).toBe("Combinado")
		expect(patch.slotCapacityLiters).toBe(10)
	})
})

describe("buildEquipmentUnitPatch", () => {
	const NOW = "2026-10-13T12:00:00.000Z"

	test("sempre carimba updatedAt; só o id não muda mais nada", () => {
		expect(buildEquipmentUnitPatch({ unitId: UNIT_ID } as UpdateEquipmentUnit, NOW)).toEqual({ updatedAt: NOW })
	})

	test("ausente mantém, nulo limpa; rótulo, modelo e status nulos não entram", () => {
		const patch = buildEquipmentUnitPatch(
			{
				unitId: UNIT_ID,
				label: null,
				modelId: null,
				status: null,
				assetTag: null,
				simultaneousSlots: null,
				supplier: "ACME",
				notes: "ok",
			} as unknown as UpdateEquipmentUnit,
			NOW
		)
		expect(patch).toEqual({ updatedAt: NOW, assetTag: null, simultaneousSlots: null, supplier: "ACME", notes: "ok" })
	})

	test("todos os campos, na ordem das regras", () => {
		const patch = buildEquipmentUnitPatch(
			{
				unitId: UNIT_ID,
				notes: "n",
				supplier: "s",
				warrantyUntil: "2027-01-01",
				installedOn: "2025-01-02",
				acquiredOn: "2025-01-01",
				simultaneousSlots: 2,
				status: "active",
				serialNumber: "SN",
				assetTag: "PAT",
				modelId: MODEL_ID,
				label: "Forno 1",
			} as unknown as UpdateEquipmentUnit,
			NOW
		)
		expect(Object.keys(patch)).toEqual([
			"updatedAt",
			"label",
			"modelId",
			"assetTag",
			"serialNumber",
			"status",
			"simultaneousSlots",
			"acquiredOn",
			"installedOn",
			"warrantyUntil",
			"supplier",
			"notes",
		])
	})
})

describe("planMenuItemBatches", () => {
	test("porções planejadas do item ÷ rendimento, arredondado para cima", () => {
		expect(planMenuItemBatches({ portionYield: 40, plannedPortions: 100 }, 500)).toEqual({ recipeBatch: 40, portions: 100, batches: 3 })
	})

	test("sem porções no item, o efetivo do cardápio", () => {
		expect(planMenuItemBatches({ portionYield: 50, plannedPortions: null }, 120)).toEqual({ recipeBatch: 50, portions: 120, batches: 3 })
	})

	test("uma batelada quando falta porção, rendimento, ou o rendimento não é positivo", () => {
		expect(planMenuItemBatches({ portionYield: 50, plannedPortions: null }, null)).toEqual({ recipeBatch: 50, portions: null, batches: 1 })
		expect(planMenuItemBatches({ portionYield: null, plannedPortions: 100 }, null)).toEqual({ recipeBatch: null, portions: 100, batches: 1 })
		expect(planMenuItemBatches({ portionYield: 0, plannedPortions: 100 }, null)).toEqual({ recipeBatch: 0, portions: 100, batches: 1 })
	})
})

describe("aggregateFitnessByTarget", () => {
	const meta = (targetKey: string, label: string, itemId: string, quantity: number): MenuDemandMeta => ({
		targetKey,
		label,
		itemId,
		recipeName: `Receita ${itemId}`,
		quantity,
	})

	test("soma por alvo, lista quem disputa e ordena pelo que mais falta, depois pelo rótulo", () => {
		const demandMeta = new Map([
			["i1:a", meta("forno", "Forno combinado", "i1", 2)],
			["i2:a", meta("forno", "Forno combinado", "i2", 1)],
			["i1:b", meta("fogao", "Fogão", "i1", 1)],
			["i3:c", meta("batedeira", "Batedeira", "i3", 1)],
		])
		const targets = aggregateFitnessByTarget(
			[
				{ requirementId: "i1:a", required: 2, satisfied: 1, missing: 1 },
				{ requirementId: "i2:a", required: 1, satisfied: 0, missing: 1 },
				{ requirementId: "i1:b", required: 1, satisfied: 1, missing: 0 },
				{ requirementId: "i3:c", required: 1, satisfied: 1, missing: 0 },
				{ requirementId: "sem-meta", required: 9, satisfied: 0, missing: 9 },
			],
			demandMeta
		)
		expect(targets.map((t) => [t.target_key, t.required, t.satisfied, t.missing])).toEqual([
			["forno", 3, 1, 2],
			["batedeira", 1, 1, 0],
			["fogao", 1, 1, 0],
		])
		expect(targets[0]?.competing_items).toEqual([
			{ menu_item_id: "i1", recipe_name: "Receita i1", quantity: 2 },
			{ menu_item_id: "i2", recipe_name: "Receita i2", quantity: 1 },
		])
	})
})
