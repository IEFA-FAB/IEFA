import { describe, expect, test } from "bun:test"
import {
	type EquipmentDemandSpec,
	type EquipmentSlot,
	evaluateEquipmentFitness,
	expandUnitSlots,
	resolveUnitRoleIds,
	slotServesDemand,
} from "./equipment-matching.ts"

const COMBI = "role-combi"
const GRIDDLE = "role-griddle"
const PRESSURE = "role-pressure"
const FRYER = "role-fryer"

const IVARIO = "model-ivario-2s"
const ICOMBI = "model-icombi-10"

/** Slot avulso; por padrão sem restrição de capacidade. */
function slot(unitId: string, roleIds: string[], over: Partial<EquipmentSlot> = {}): EquipmentSlot {
	return { unitId, unitLabel: unitId, modelId: over.modelId ?? IVARIO, slotIndex: 0, roleIds, capacityLiters: null, capacityGn: null, ...over }
}

function demand(requirementId: string, over: Partial<EquipmentDemandSpec> = {}): EquipmentDemandSpec {
	return { requirementId, roleId: null, modelId: null, quantity: 1, minCapacityLiters: null, minCapacityGn: null, ...over }
}

describe("slotServesDemand", () => {
	test("papel exigido presente no slot", () => {
		expect(slotServesDemand(slot("u1", [GRIDDLE, PRESSURE]), demand("r", { roleId: GRIDDLE }))).toBe(true)
	})

	test("papel exigido ausente reprova", () => {
		expect(slotServesDemand(slot("u1", [GRIDDLE]), demand("r", { roleId: COMBI }))).toBe(false)
	})

	test("modelo exigido casa só com o modelo exato", () => {
		const s = slot("u1", [COMBI], { modelId: ICOMBI })
		expect(slotServesDemand(s, demand("r", { modelId: ICOMBI }))).toBe(true)
		expect(slotServesDemand(s, demand("r", { modelId: IVARIO }))).toBe(false)
	})

	test("capacidade em litros abaixo do mínimo reprova", () => {
		const s = slot("u1", [PRESSURE], { capacityLiters: 50 })
		expect(slotServesDemand(s, demand("r", { roleId: PRESSURE, minCapacityLiters: 50 }))).toBe(true)
		expect(slotServesDemand(s, demand("r", { roleId: PRESSURE, minCapacityLiters: 100 }))).toBe(false)
	})

	test("capacidade desconhecida com mínimo exigido reprova (não presume)", () => {
		const s = slot("u1", [PRESSURE], { capacityLiters: null })
		expect(slotServesDemand(s, demand("r", { roleId: PRESSURE, minCapacityLiters: 10 }))).toBe(false)
	})

	test("capacidade em GN respeita o mínimo", () => {
		const s = slot("u1", [COMBI], { capacityGn: 10 })
		expect(slotServesDemand(s, demand("r", { roleId: COMBI, minCapacityGn: 10 }))).toBe(true)
		expect(slotServesDemand(s, demand("r", { roleId: COMBI, minCapacityGn: 20 }))).toBe(false)
	})
})

describe("evaluateEquipmentFitness", () => {
	test("lista vazia é atendida por parque vazio", () => {
		const result = evaluateEquipmentFitness([], [])
		expect(result.satisfied).toBe(true)
		expect(result.missingTotal).toBe(0)
	})

	test("exigência sem nenhum equipamento compatível fica descoberta", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI })], [slot("u1", [GRIDDLE])])
		expect(result.satisfied).toBe(false)
		expect(result.requirements[0]).toMatchObject({ required: 1, satisfied: 0, missing: 1 })
	})

	test("multifuncional de 2 cubas atende DUAS exigências distintas ao mesmo tempo", () => {
		const slots = expandUnitSlots({
			unitId: "ivario-1",
			unitLabel: "iVario 1",
			modelId: IVARIO,
			slots: 2,
			roleIds: [GRIDDLE, PRESSURE, FRYER],
			capacityLiters: 50,
			capacityGn: null,
		})
		const result = evaluateEquipmentFitness([demand("r1", { roleId: GRIDDLE }), demand("r2", { roleId: PRESSURE })], slots)
		expect(result.satisfied).toBe(true)
		// Cubas distintas da MESMA unidade: os dois papéis saem do mesmo equipamento.
		expect(result.requirements.flatMap((r) => r.assignedUnitIds)).toEqual(["ivario-1", "ivario-1"])
	})

	test("multifuncional NÃO atende três papéis simultâneos com duas cubas", () => {
		const slots = expandUnitSlots({
			unitId: "ivario-1",
			unitLabel: "iVario 1",
			modelId: IVARIO,
			slots: 2,
			roleIds: [GRIDDLE, PRESSURE, FRYER],
			capacityLiters: 50,
			capacityGn: null,
		})
		const result = evaluateEquipmentFitness([demand("r1", { roleId: GRIDDLE }), demand("r2", { roleId: PRESSURE }), demand("r3", { roleId: FRYER })], slots)
		expect(result.satisfied).toBe(false)
		expect(result.missingTotal).toBe(1)
	})

	test("quantity > 1 exige unidades independentes", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI, quantity: 2 })], [slot("u1", [COMBI], { modelId: ICOMBI })])
		expect(result.requirements[0]).toMatchObject({ required: 2, satisfied: 1, missing: 1 })
	})

	test("realoca o slot disputado para maximizar o atendimento", () => {
		// u1 só sabe chapa; u2 sabe chapa e pressão. Pedindo chapa primeiro, a alocação ingênua
		// daria a chapa a u2 e deixaria a pressão descoberta — o caminho aumentante desfaz isso.
		const slots = [slot("u1", [GRIDDLE]), slot("u2", [GRIDDLE, PRESSURE])]
		const result = evaluateEquipmentFitness([demand("r1", { roleId: GRIDDLE }), demand("r2", { roleId: PRESSURE })], slots)
		expect(result.satisfied).toBe(true)
		expect(result.requirements[0].assignedUnitIds).toEqual(["u1"])
		expect(result.requirements[1].assignedUnitIds).toEqual(["u2"])
	})

	test("exigência por modelo específico ignora equipamento equivalente de outro modelo", () => {
		const slots = [slot("u1", [COMBI], { modelId: ICOMBI })]
		const result = evaluateEquipmentFitness([demand("r1", { modelId: "model-outro" })], slots)
		expect(result.satisfied).toBe(false)
	})
})

describe("resolveUnitRoleIds", () => {
	test("sem exceção, os papéis são os do modelo", () => {
		expect(resolveUnitRoleIds([GRIDDLE, PRESSURE], [])).toEqual([GRIDDLE, PRESSURE])
	})

	test("exceção com available=false remove o papel do modelo", () => {
		expect(resolveUnitRoleIds([GRIDDLE, PRESSURE], [{ roleId: PRESSURE, available: false }])).toEqual([GRIDDLE])
	})

	test("exceção com available=true adiciona papel que o modelo não declara", () => {
		expect(resolveUnitRoleIds([GRIDDLE], [{ roleId: FRYER, available: true }])).toEqual([GRIDDLE, FRYER])
	})

	test("remoção vence adição do mesmo papel", () => {
		const roles = resolveUnitRoleIds(
			[GRIDDLE],
			[
				{ roleId: FRYER, available: true },
				{ roleId: FRYER, available: false },
			]
		)
		expect(roles).toEqual([GRIDDLE])
	})
})

describe("expandUnitSlots", () => {
	test("uma unidade de N zonas vira N slots", () => {
		const slots = expandUnitSlots({ unitId: "u1", unitLabel: "Fogão", modelId: "m", slots: 6, roleIds: [], capacityLiters: null, capacityGn: null })
		expect(slots).toHaveLength(6)
		expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3, 4, 5])
	})

	test("contagem inválida vira uma zona (nunca zero slots em silêncio)", () => {
		expect(expandUnitSlots({ unitId: "u1", unitLabel: "x", modelId: "m", slots: 0, roleIds: [], capacityLiters: null, capacityGn: null })).toHaveLength(1)
	})
})
