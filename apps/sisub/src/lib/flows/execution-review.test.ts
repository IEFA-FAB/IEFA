import type { ExecutionReviewStatus } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildExecutionReviewSteps } from "./execution-review"
import { computeOverallStatus } from "./model"

const empty: ExecutionReviewStatus = {
	kitchenId: 3,
	today: "2026-09-26",
	addedItems: [],
	provisionalRecipes: [],
	incompleteItems: [],
	unexplainedIssueDays: [],
	provisionalFrozenPreparations: [],
}

const step = (status: ExecutionReviewStatus, id: string) => buildExecutionReviewSteps(status).find((s) => s.id === id)

describe("fluxo Revisar a execução", () => {
	test("sem pendência, tudo em dia", () => {
		expect(computeOverallStatus(buildExecutionReviewSteps(empty))).toBe("done")
	})

	test("nada da execução bloqueia: toda pendência é aviso ou informação", () => {
		const status: ExecutionReviewStatus = {
			...empty,
			addedItems: [
				{
					menuItemId: "m1",
					serviceDate: "2026-09-26",
					mealTypeName: "Almoço",
					recipeId: "r1",
					recipeName: "Lentilha",
					provisional: false,
					reason: "faltou feijão",
					addedAt: "2026-09-26T14:00:00Z",
					addedBy: "cozinheiro@fab.mil.br",
				},
			],
			provisionalRecipes: [{ id: "p1", name: "Farofa", since: "2026-09-25T14:00:00Z", createdBy: null, uses: 2 }],
			incompleteItems: [{ menuItemId: "m2", serviceDate: "2026-09-27", recipeName: "Arroz", gaps: ["no_ingredients"] }],
			unexplainedIssueDays: [{ requestId: "q1", issueDate: "2026-09-24" }],
			provisionalFrozenPreparations: [{ id: "f1", description: "Estrogonofe", since: "2026-09-25T18:00:00Z" }],
		}
		const steps = buildExecutionReviewSteps(status)
		expect(steps.flatMap((s) => s.issues).some((i) => i.severity === "blocking")).toBe(false)
		expect(computeOverallStatus(steps)).toBe("attention")
	})

	test("inclusão do turno pede revisão", () => {
		const s = step(
			{
				...empty,
				addedItems: [
					{
						menuItemId: "m1",
						serviceDate: "2026-09-26",
						mealTypeName: null,
						recipeId: null,
						recipeName: "Lentilha",
						provisional: false,
						reason: "faltou feijão",
						addedAt: "2026-09-26T14:00:00Z",
						addedBy: null,
					},
				],
			},
			"added"
		)
		expect(s?.status).toBe("attention")
		expect(s?.issues[0]?.message).toMatch(/1 preparação incluída pelo turno aguarda revisão/)
	})

	test("ficha provisória leva à tela que completa a ficha", () => {
		const s = step({ ...empty, provisionalRecipes: [{ id: "p1", name: "Farofa", since: "2026-09-25T14:00:00Z", createdBy: null, uses: 3 }] }, "provisional")
		expect(s?.issues[0]?.action?.href).toBe("/kitchen/3/recipes/p1")
		expect(s?.issues[0]?.message).toMatch(/"Farofa".*já usada 3 vezes.*não entra em cardápio-modelo/)
	})

	test("ficha incompleta diz o dia e o que falta", () => {
		const s = step({ ...empty, incompleteItems: [{ menuItemId: "m2", serviceDate: "2026-09-27", recipeName: "Arroz", gaps: ["no_portions"] }] }, "incomplete")
		expect(s?.issues[0]?.message).toMatch(/^Arroz \(27\/09\): Ficha incompleta — item sem porções planejadas/)
	})

	test("pendência de outro módulo diz quem resolve e não tem link", () => {
		const s = step({ ...empty, unexplainedIssueDays: [{ requestId: "q1", issueDate: "2026-09-24" }] }, "others")
		expect(s?.issues[0]).toEqual({ severity: "info", message: expect.stringMatching(/24\/09.*Quem justifica é o Estoque/) })
		expect(s?.status).toBe("done")
	})

	test("lista longa corta e diz quantas faltam", () => {
		const many = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `Prep ${i}`, since: "2026-09-25T14:00:00Z", createdBy: null, uses: 1 }))
		const s = step({ ...empty, provisionalRecipes: many }, "provisional")
		expect(s?.issues).toHaveLength(9)
		expect(s?.issues.at(-1)?.message).toBe("E mais 3 preparações provisórias.")
	})
})
