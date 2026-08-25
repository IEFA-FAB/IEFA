import { describe, expect, test } from "bun:test"
import {
	type ConcurrencyRow,
	type EquipmentDemandSpec,
	type EquipmentSlot,
	evaluateEquipmentFitness,
	expandUnitSlots,
	resolveUnitRoleIds,
	selectConcurrentRequirements,
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

	test("capacidade é POR ZONA: duas cubas de 25 L não atendem uma exigência de 40 L", () => {
		// Regressão da modelagem: o iVario Pro 2-S anuncia "2 × 25 L". Guardar 50 no modelo e
		// replicar nos dois slots faria este caso passar, prometendo uma panela que não existe.
		const slots = expandUnitSlots({
			unitId: "ivario-1",
			unitLabel: "iVario 1",
			modelId: IVARIO,
			slots: 2,
			roleIds: [PRESSURE],
			capacityLiters: 25,
			capacityGn: null,
		})
		const result = evaluateEquipmentFitness([demand("r1", { roleId: PRESSURE, minCapacityLiters: 40 })], slots)
		expect(result.satisfied).toBe(false)
		expect(evaluateEquipmentFitness([demand("r2", { roleId: PRESSURE, minCapacityLiters: 25 })], slots).satisfied).toBe(true)
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

describe("volume: bateladas e ciclos", () => {
	const oven = (id: string) => slot(id, [COMBI], { modelId: ICOMBI })

	test("sem volume informado, uma batelada e um ciclo", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI })], [oven("u1")])
		expect(result.satisfied).toBe(true)
		expect(result.maxParallelBatches).toBe(1)
		expect(result.cycles).toBe(1)
	})

	test("nove bateladas num forno só: atende, em nove ciclos (não pede nove fornos)", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI })], [oven("u1")], { batches: 9 })
		expect(result.satisfied).toBe(true)
		expect(result.requirements[0].missing).toBe(0)
		expect(result.maxParallelBatches).toBe(1)
		expect(result.cycles).toBe(9)
	})

	test("três fornos vencem nove bateladas em três ciclos", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI })], [oven("u1"), oven("u2"), oven("u3")], { batches: 9 })
		expect(result.maxParallelBatches).toBe(3)
		expect(result.cycles).toBe(3)
	})

	test("parque que não roda nem uma batelada não tem ciclo", () => {
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI, quantity: 2 })], [oven("u1")], { batches: 4 })
		expect(result.satisfied).toBe(false)
		expect(result.maxParallelBatches).toBe(0)
		expect(result.cycles).toBeNull()
	})

	test("exigência fixa não acompanha o volume — uma seladora serve a leva inteira", () => {
		const sealer = slot("sel-1", ["role-sealer"], { modelId: "m-sealer" })
		const result = evaluateEquipmentFitness(
			[demand("r1", { roleId: COMBI }), demand("r2", { roleId: "role-sealer", scalesWithBatch: false })],
			[oven("u1"), oven("u2"), sealer],
			{ batches: 6 }
		)
		// Duas bateladas simultâneas pelos dois fornos; a seladora não vira duas.
		expect(result.maxParallelBatches).toBe(2)
		expect(result.cycles).toBe(3)
	})

	test("o paralelo respeita a disputa ENTRE exigências, não só a contagem por alvo", () => {
		// u2 é multifuncional (forno e chapa); u1 só forno. Duas bateladas exigiriam 2 fornos + 2
		// chapas, e só existem 3 slots — dividir slots por exigência isoladamente diria que cabe.
		const griddleAndOven = slot("u2", [COMBI, GRIDDLE], { modelId: ICOMBI })
		const result = evaluateEquipmentFitness([demand("r1", { roleId: COMBI }), demand("r2", { roleId: GRIDDLE })], [oven("u1"), griddleAndOven], { batches: 2 })
		expect(result.satisfied).toBe(true)
		expect(result.maxParallelBatches).toBe(1)
		expect(result.cycles).toBe(2)
	})
})

describe("selectConcurrentRequirements", () => {
	const row = (id: string, targetKey: string, level: number | null, quantity = 1): ConcurrencyRow => ({
		requirementId: id,
		targetKey,
		level,
		quantity,
	})

	test("exigência sem etapa é sempre concorrente", () => {
		const ids = selectConcurrentRequirements([row("a", "forno", null), row("b", "chapa", null)])
		expect([...ids].sort()).toEqual(["a", "b"])
	})

	test("mesmo alvo em níveis diferentes: só o de pico disputa", () => {
		// assar (nível 2) e gratinar (nível 5) = o MESMO forno, duas vezes.
		const ids = selectConcurrentRequirements([row("assar", "forno", 2), row("gratinar", "forno", 5)])
		expect([...ids]).toEqual(["assar"])
	})

	test("mesmo alvo no mesmo nível: os dois disputam", () => {
		const ids = selectConcurrentRequirements([row("assar", "forno", 2), row("desidratar", "forno", 2)])
		expect([...ids].sort()).toEqual(["assar", "desidratar"])
	})

	test("o nível de MAIOR demanda vence, não o primeiro", () => {
		const ids = selectConcurrentRequirements([row("n1", "forno", 1, 1), row("n3a", "forno", 3, 1), row("n3b", "forno", 3, 1)])
		expect([...ids].sort()).toEqual(["n3a", "n3b"])
	})

	test("alvos distintos não competem entre si", () => {
		const ids = selectConcurrentRequirements([row("forno-n1", "forno", 1), row("chapa-n5", "chapa", 5)])
		expect([...ids].sort()).toEqual(["chapa-n5", "forno-n1"])
	})

	test("capacidade mínima diferente é OUTRO alvo (não reaproveita a mesma panela)", () => {
		const ids = selectConcurrentRequirements([row("p50", "panela|50", 1), row("p100", "panela|100", 3)])
		expect([...ids].sort()).toEqual(["p100", "p50"])
	})
})
