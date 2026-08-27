/**
 * Contrato de autorização dos EQUIPAMENTOS.
 *
 * Três donos diferentes convivem nas mesmas operações, e trocá-los é o erro fácil:
 *   - modelo do CATÁLOGO GLOBAL (`kitchen_id` null) → escrita exige `global:2`;
 *   - modelo e PARQUE de uma cozinha → escrita exige `kitchen:2` NAQUELA cozinha;
 *   - lista mínima da preparação → segue a posse da RECEITA.
 *
 * O caso que este teste existe para travar é o mesmo do bug de `kitchen:2` mutando ativo global
 * (ver guards/asset-ownership.ts): o dono tem de sair da LINHA PERSISTIDA, nunca do input — e a
 * recusa tem de acontecer ANTES de qualquer escrita.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import {
	createEquipmentModel,
	createEquipmentUnit,
	deleteEquipmentUnit,
	fetchRecipeEquipment,
	listKitchenEquipment,
	saveRecipeEquipment,
	updateEquipmentModel,
	updateEquipmentUnit,
} from "./equipment.ts"
import {
	createMaintenancePlan,
	deleteMaintenancePlan,
	listEquipmentIssues,
	logMaintenance,
	reportEquipmentIssue,
	updateEquipmentIssue,
	updateMaintenancePlan,
} from "./equipment-maintenance.ts"

const OWNER_KITCHEN = 3
const OTHER_KITCHEN = 9
const MODEL_ID = "11111111-1111-4111-8111-111111111111"
const UNIT_ID = "22222222-2222-4222-8222-222222222222"
const ROLE_ID = "33333333-3333-4333-8333-333333333333"
const RECIPE_ID = "44444444-4444-4444-8444-444444444444"
const ISSUE_ID = "55555555-5555-4555-8555-555555555555"
const PLAN_ID = "66666666-6666-4666-8666-666666666666"

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions }
}

const kitchenCtx = (kitchenId: number, level = 2) => ctx([{ module: "kitchen", level, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])
const globalCtx = (level = 2) => ctx([{ module: "global", level, kitchen_id: null, mess_hall_id: null, unit_id: null }])
const productionCtx = (kitchenId: number, level = 1) => ctx([{ module: "kitchen-production", level, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])

/**
 * Stub do handle Drizzle. `rows` alimenta todo `select(...).from(...).where(...)`
 * (dono da unidade, papéis existentes, modelo visível); `owner` alimenta os `findFirst`
 * do guard de ownership. `writes` registra escritas para provar que a recusa vem antes.
 */
function fakeDb(rows: unknown[] = [], owner: { kitchenId: number | null } | undefined = undefined) {
	const writes: string[] = []
	const selectChain: Record<string, unknown> = {}
	selectChain.from = () => selectChain
	selectChain.where = () => Object.assign(Promise.resolve(rows), selectChain)
	// `orderBy`/`limit` devolvem a chain (não uma Promise crua): as operations encadeiam
	// `.where().orderBy().limit()`, e um Promise sem os métodos quebraria com TypeError —
	// que um teste de autorização leria como "recusado", passando por engano.
	selectChain.orderBy = () => Object.assign(Promise.resolve(rows), selectChain)
	selectChain.limit = () => Object.assign(Promise.resolve(rows), selectChain)

	const findFirst = () => Promise.resolve(owner)
	// Promise REAL com os métodos da chain pendurados: as operations tanto encadeiam
	// (`.returning()`) quanto aguardam direto (`.then(() => undefined)`), e um objeto literal
	// com `then` seria um thenable falso (biome/noThenProperty).
	const settled = () => Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) })
	const db = {
		select: () => selectChain,
		insert: () => {
			writes.push("insert")
			return { values: () => settled() }
		},
		update: () => {
			writes.push("update")
			const chain: Record<string, unknown> = {}
			chain.set = () => chain
			chain.where = () => settled()
			return chain
		},
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
		query: {
			recipesInKitchen: { findFirst },
			equipmentModelInKitchen: { findFirst },
		},
	}
	return { db: db as unknown as SisubDb, writes }
}

const MODEL_INPUT = { name: "Forno teste", roles: [{ roleId: ROLE_ID, isPrimary: true }], simultaneousSlots: 1, isGeneric: false }
const UNIT_INPUT = { modelId: MODEL_ID, label: "Forno 1", status: "active" as const, roleOverrides: [] }
const PLAN_INPUT = {
	roleId: ROLE_ID,
	modelId: null,
	title: "Limpeza",
	kind: "cleaning" as const,
	intervalDays: 30,
	toleranceDays: 5,
	instructions: null,
	estimatedMinutes: null,
	isRequired: true,
	sortOrder: 100,
}

describe("catálogo global de modelos", () => {
	test("criar modelo global com kitchen:2 é recusado (exige global:2)", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { ...MODEL_INPUT, kitchenId: null })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar modelo global com kitchen:2 é recusado — o dono vem da linha, não do input", async () => {
		const { db, writes } = fakeDb([], { kitchenId: null })
		await expect(updateEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { modelId: MODEL_ID, name: "outro" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar modelo de OUTRA cozinha é recusado mesmo com kitchen:2 na própria", async () => {
		const { db, writes } = fakeDb([], { kitchenId: OTHER_KITCHEN })
		await expect(updateEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { modelId: MODEL_ID, name: "outro" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})
})

describe("parque instalado", () => {
	test("cadastrar equipamento em outra cozinha é recusado", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { ...UNIT_INPUT, kitchenId: OTHER_KITCHEN })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("cadastrar equipamento com kitchen:1 é recusado (leitura não escreve)", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN, 1), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
		expect(writes).toEqual([])
	})

	test("editar equipamento resolve a cozinha DONA no banco antes de autorizar", async () => {
		const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(updateEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { unitId: UNIT_ID, label: "renomeado" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("remover equipamento de outra cozinha é recusado", async () => {
		const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(deleteEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { unitId: UNIT_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("listar o parque de outra cozinha é recusado", async () => {
		const { db } = fakeDb([])
		await expect(listKitchenEquipment(db, kitchenCtx(OWNER_KITCHEN), { kitchenId: OTHER_KITCHEN, includeInactive: false })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
	})

	test("global:2 NÃO abre o parque de uma cozinha — o módulo é outro", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, globalCtx(), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})
})

describe("lista mínima da preparação", () => {
	test("salvar exigência de preparação GLOBAL com kitchen:2 é recusado", async () => {
		const { db, writes } = fakeDb([], { kitchenId: null })
		await expect(saveRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN), { recipeId: RECIPE_ID, requirements: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("salvar exigência de preparação de OUTRA cozinha é recusado", async () => {
		const { db, writes } = fakeDb([], { kitchenId: OTHER_KITCHEN })
		await expect(saveRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN), { recipeId: RECIPE_ID, requirements: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("ler a lista de preparação de outra cozinha é recusado", async () => {
		const { db } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(fetchRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN, 1), { recipeId: RECIPE_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

/**
 * Regra R5 do change `sisub-equipment-condition-maintenance`: quem está na praça RELATA, quem
 * gerencia DECIDE.
 *
 * A metade positiva (produção consegue cadastrar, relatar e registrar) sozinha não prova nada —
 * um guard que deixa passar tudo também a satisfaz. O que trava a regra é a metade NEGATIVA
 * abaixo: `kitchen-production:1` tem de ser recusado em tudo que é destrutivo ou que reescreve a
 * versão oficial, e a recusa tem de vir ANTES de qualquer escrita.
 */
describe("R5 — produção relata, gestão decide", () => {
	const UNIT_ROW = [{ kitchenId: OWNER_KITCHEN, label: "Forno 1", modelId: MODEL_ID }]
	/**
	 * Linha que serve à pane E à unidade dona: `resolveIssueUnit` lê a pane e DEPOIS a unidade,
	 * e um stub sem `kitchenId` faria o guard receber `undefined` e recusar por escopo — o teste
	 * passaria com qualquer guard, provando nada. Foi um mutante sobrevivente que expôs isso.
	 */
	const ISSUE_ROWS = [
		{
			id: ISSUE_ID,
			unitId: UNIT_ID,
			status: "open",
			severity: "inoperative",
			resolvedAt: null,
			resolutionNote: null,
			kitchenId: OWNER_KITCHEN,
			label: "Forno 1",
			modelId: MODEL_ID,
		},
	]
	/** Linha que serve como modelo visível, unidade inserida e re-leitura da hidratação. */
	const UNIT_ROWS = [{ id: UNIT_ID, kitchenId: OWNER_KITCHEN, modelId: MODEL_ID, label: "Forno 1", status: "active", simultaneousSlots: null, deletedAt: null }]

	describe("o que a produção PODE", () => {
		test("cadastrar unidade ativa na própria cozinha", async () => {
			const { db, writes } = fakeDb(UNIT_ROWS)
			await expect(createEquipmentUnit(db, productionCtx(OWNER_KITCHEN), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).resolves.toBeDefined()
			expect(writes).toContain("insert")
		})

		test("relatar pane numa unidade da própria cozinha", async () => {
			const { db, writes } = fakeDb(UNIT_ROW)
			await expect(
				reportEquipmentIssue(db, productionCtx(OWNER_KITCHEN), { unitId: UNIT_ID, severity: "inoperative", category: "electrical", description: "não liga" })
			).resolves.toBeDefined()
			expect(writes).toContain("insert")
		})

		test("registrar execução de manutenção avulsa", async () => {
			const { db, writes } = fakeDb(UNIT_ROW)
			await expect(
				logMaintenance(db, productionCtx(OWNER_KITCHEN), {
					unitId: UNIT_ID,
					planId: null,
					issueId: null,
					kind: "corrective",
					performedOn: "2026-08-27",
					provider: "in_house",
					cost: null,
					notes: null,
					resolveIssue: false,
				})
			).resolves.toBeDefined()
			expect(writes).toContain("insert")
		})

		test("listar as panes da própria cozinha", async () => {
			const { db } = fakeDb([])
			await expect(
				listEquipmentIssues(db, productionCtx(OWNER_KITCHEN), { kitchenId: OWNER_KITCHEN, unitId: null, onlyOpen: true, limit: 100 })
			).resolves.toEqual([])
		})
	})

	describe("o que a produção NÃO pode", () => {
		test("editar a unidade", async () => {
			const { db, writes } = fakeDb([{ kitchenId: OWNER_KITCHEN }])
			await expect(updateEquipmentUnit(db, productionCtx(OWNER_KITCHEN), { unitId: UNIT_ID, label: "renomeado" })).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("dar baixa mudando o status pela edição", async () => {
			const { db, writes } = fakeDb([{ kitchenId: OWNER_KITCHEN }])
			await expect(updateEquipmentUnit(db, productionCtx(OWNER_KITCHEN), { unitId: UNIT_ID, status: "decommissioned" })).rejects.toBeInstanceOf(
				PermissionDeniedError
			)
			expect(writes).toEqual([])
		})

		test("excluir a unidade", async () => {
			const { db, writes } = fakeDb([{ kitchenId: OWNER_KITCHEN }])
			await expect(deleteEquipmentUnit(db, productionCtx(OWNER_KITCHEN), { unitId: UNIT_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("cadastrar unidade JÁ em manutenção — declarar estado administrativo é da gestão", async () => {
			const { db, writes } = fakeDb()
			await expect(
				createEquipmentUnit(db, productionCtx(OWNER_KITCHEN), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN, status: "maintenance" })
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("resolver pane", async () => {
			const { db, writes } = fakeDb(ISSUE_ROWS)
			await expect(
				updateEquipmentIssue(db, productionCtx(OWNER_KITCHEN), { issueId: ISSUE_ID, status: "resolved", severity: null, resolutionNote: "trocada" })
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("DESCARTAR pane — é o que devolve um equipamento quebrado ao planejamento", async () => {
			const { db, writes } = fakeDb(ISSUE_ROWS)
			await expect(
				updateEquipmentIssue(db, productionCtx(OWNER_KITCHEN), { issueId: ISSUE_ID, status: "dismissed", severity: null, resolutionNote: "não procede" })
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("encerrar pane de carona no registro de manutenção", async () => {
			const { db, writes } = fakeDb(UNIT_ROW)
			await expect(
				logMaintenance(db, productionCtx(OWNER_KITCHEN), {
					unitId: UNIT_ID,
					planId: null,
					issueId: ISSUE_ID,
					kind: "corrective",
					performedOn: "2026-08-27",
					provider: "in_house",
					cost: null,
					notes: null,
					resolveIssue: true,
				})
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("criar rotina de manutenção da cozinha", async () => {
			const { db, writes } = fakeDb()
			await expect(createMaintenancePlan(db, productionCtx(OWNER_KITCHEN), { ...PLAN_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(
				PermissionDeniedError
			)
			expect(writes).toEqual([])
		})
	})

	describe("escopo", () => {
		test("produção de OUTRA cozinha não cadastra aqui", async () => {
			const { db, writes } = fakeDb()
			await expect(createEquipmentUnit(db, productionCtx(OTHER_KITCHEN), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(
				PermissionDeniedError
			)
			expect(writes).toEqual([])
		})

		test("relatar pane em unidade de outra cozinha é recusado — o dono vem da LINHA", async () => {
			const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN, label: "Forno alheio", modelId: MODEL_ID }])
			await expect(
				reportEquipmentIssue(db, productionCtx(OWNER_KITCHEN), { unitId: UNIT_ID, severity: "degraded", category: "other", description: "x" })
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})

		test("registrar manutenção em unidade de outra cozinha é recusado", async () => {
			const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN, label: "Forno alheio", modelId: MODEL_ID }])
			await expect(
				logMaintenance(db, kitchenCtx(OWNER_KITCHEN), {
					unitId: UNIT_ID,
					planId: null,
					issueId: null,
					kind: "preventive",
					performedOn: "2026-08-27",
					provider: "in_house",
					cost: null,
					notes: null,
					resolveIssue: false,
				})
			).rejects.toBeInstanceOf(PermissionDeniedError)
			expect(writes).toEqual([])
		})
	})
})

describe("rotina de manutenção", () => {
	test("criar rotina GLOBAL com kitchen:2 é recusado (exige global:2)", async () => {
		const { db, writes } = fakeDb()
		await expect(createMaintenancePlan(db, kitchenCtx(OWNER_KITCHEN), { ...PLAN_INPUT, kitchenId: null })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar rotina GLOBAL com kitchen:2 é recusado — o dono vem da linha", async () => {
		const { db, writes } = fakeDb([{ kitchenId: null }])
		await expect(updateMaintenancePlan(db, kitchenCtx(OWNER_KITCHEN), { planId: PLAN_ID, title: "outro" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("excluir rotina de OUTRA cozinha é recusado", async () => {
		const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(deleteMaintenancePlan(db, kitchenCtx(OWNER_KITCHEN), { planId: PLAN_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("global:2 cria rotina global", async () => {
		const { db, writes } = fakeDb([{ id: PLAN_ID, kitchenId: null, roleId: ROLE_ID, modelId: null, title: "Limpeza", kind: "cleaning" }])
		await expect(createMaintenancePlan(db, globalCtx(), { ...PLAN_INPUT, kitchenId: null })).resolves.toBeDefined()
		expect(writes).toContain("insert")
	})
})
