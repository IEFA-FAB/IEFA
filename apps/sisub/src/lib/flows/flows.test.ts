import type { DemandForecastStatus, ProcurementPlanningStatus } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildDemandForecastSteps } from "./demand-forecast"
import { computeOverallStatus, deriveStatusFromIssues, formatMonthYear } from "./model"
import { buildProcurementPlanningSteps } from "./procurement-planning"

const baseUnit: ProcurementPlanningStatus = {
	unitId: 10,
	today: "2026-10-15",
	kitchens: [{ id: 1, name: "Cozinha A", weeklyWithItems: 2, events: 1, supportMenus: 1, forecast: null }],
	segmentation: { segmentCount: 0, lineCount: 30, unassignedCount: 30, conflictCount: 0 },
	calendar: [],
	drafts: [],
	pricing: [],
}
const step = (steps: ReturnType<typeof buildProcurementPlanningSteps>, id: string) => steps.find((s) => s.id === id)

describe("modelo", () => {
	test("bloqueio vence aviso, que vence o status padrão", () => {
		expect(deriveStatusFromIssues([{ severity: "info", message: "" }])).toBe("done")
		expect(
			deriveStatusFromIssues([
				{ severity: "warning", message: "" },
				{ severity: "blocking", message: "" },
			])
		).toBe("blocked")
		expect(deriveStatusFromIssues([], "todo")).toBe("todo")
	})

	test("status geral é o pior entre as etapas", () => {
		expect(computeOverallStatus([{ id: "a", title: "", objective: "", status: "done", issues: [] }])).toBe("done")
		expect(
			computeOverallStatus([
				{ id: "a", title: "", objective: "", status: "todo", issues: [] },
				{ id: "b", title: "", objective: "", status: "attention", issues: [] },
			])
		).toBe("attention")
	})

	test("formatMonthYear", () => {
		expect(formatMonthYear("2027-03-01")).toBe("março/2027")
	})
})

describe("Planejar contratação", () => {
	test("sem cardápio semanal em nenhuma cozinha, a primeira etapa bloqueia e diz quem resolve", () => {
		const steps = buildProcurementPlanningSteps({ ...baseUnit, kitchens: [{ ...baseUnit.kitchens[0], weeklyWithItems: 0 }] })
		const menus = step(steps, "menus")
		expect(menus?.status).toBe("blocked")
		expect(menus?.issues[0].message).toMatch(/nutricionista/)
		// Pendência de outro módulo não tem link.
		expect(menus?.issues[0].action).toBeUndefined()
	})

	test("cozinha sem previsão vira aviso sem link; previsão enviada vira informação para importar", () => {
		const steps = buildProcurementPlanningSteps({
			...baseUnit,
			kitchens: [
				{ ...baseUnit.kitchens[0] },
				{
					id: 2,
					name: "Cozinha B",
					weeklyWithItems: 1,
					events: 0,
					supportMenus: 0,
					forecast: { id: "f", title: "Março", status: "sent", updatedAt: "2026-10-01T12:00:00Z", reviewedAt: null, imports: 0 },
				},
			],
		})
		const forecasts = step(steps, "forecasts")
		expect(forecasts?.status).toBe("attention")
		expect(forecasts?.issues.map((i) => i.severity)).toEqual(["warning", "info"])
		expect(forecasts?.issues[0].action).toBeUndefined()
		expect(forecasts?.summary).toBe("1 de 2 enviada")
	})

	test("conflito de segmentação bloqueia e leva à segmentação", () => {
		const steps = buildProcurementPlanningSteps({ ...baseUnit, segmentation: { segmentCount: 2, lineCount: 30, unassignedCount: 3, conflictCount: 1 } })
		const segments = step(steps, "segments")
		expect(segments?.status).toBe("blocked")
		expect(segments?.issues[0].action?.href).toBe("/unit/10/segments")
		expect(segments?.issues.map((i) => i.severity)).toEqual(["blocking", "warning"])
	})

	test("sem contratações a segmentação é 'a fazer', com orientação", () => {
		expect(step(buildProcurementPlanningSteps(baseUnit), "segments")?.status).toBe("todo")
	})

	test("contratação na janela sem anexo concluído aponta o rascunho em andamento", () => {
		const steps = buildProcurementPlanningSteps({
			...baseUnit,
			calendar: [
				{
					segmentId: "s",
					name: "Carnes",
					plannedMonth: 3,
					cycle: { due: "2027-03-01", windowStart: "2026-10-01", windowEnd: "2027-05-01", active: true, closed: false },
					lastAnnex: { id: "l1", title: "Carnes 2027", status: "draft", wizardStep: 2, updatedAt: null },
				},
			],
		})
		const calendar = step(steps, "calendar")
		expect(calendar?.status).toBe("attention")
		expect(calendar?.issues[0].message).toContain("março/2027")
		expect(calendar?.issues[0].action?.href).toBe("/unit/10/quantity-estimates/new?step=2&draft=l1")
	})

	test("preço sem pesquisa bloqueia a etapa de preços", () => {
		const steps = buildProcurementPlanningSteps({
			...baseUnit,
			pricing: [
				{ quantityEstimateId: "l1", title: "Carnes", status: "draft", segmentName: "Carnes", items: 10, withoutPrice: 2, withoutResearch: 3, oldResearch: 0 },
			],
		})
		const prices = step(steps, "prices")
		expect(prices?.status).toBe("blocked")
		expect(prices?.issues[0].message).toMatch(/3 itens com preço sem pesquisa/)
	})
})

describe("Prever demanda para compra", () => {
	const base: DemandForecastStatus = {
		kitchenId: 5,
		kitchenName: "Cozinha A",
		today: "2026-10-15",
		weeklyWithItems: 1,
		weeklyEmpty: 0,
		events: 0,
		supportMenus: 1,
		supportMenusWithoutOccurrences: 0,
		ingredientsWithoutPurchaseItem: 0,
		pendingForecasts: 0,
		forecast: null,
		unitCalendar: [],
	}
	const cycle = { due: "2027-03-01", windowStart: "2026-10-01", windowEnd: "2027-05-01", active: true, closed: false }

	test("sem previsão enviada, a última etapa é 'a fazer' com o atalho para criar", () => {
		const send = buildDemandForecastSteps(base).find((s) => s.id === "send")
		expect(send?.status).toBe("todo")
		expect(send?.action?.href).toBe("/kitchen/5/demand-forecasts/new")
	})

	test("contratação da OM na janela pede a previsão; previsão atualizada na janela a cobre", () => {
		const pending = buildDemandForecastSteps({ ...base, unitCalendar: [{ name: "Carnes", plannedMonth: 3, cycle }] }).find((s) => s.id === "send")
		expect(pending?.issues[0]).toMatchObject({ severity: "warning" })
		expect(pending?.issues[0].message).toContain("Carnes")

		const covered = buildDemandForecastSteps({
			...base,
			forecast: {
				id: "f",
				title: "Out",
				status: "reviewed",
				updatedAt: "2026-10-05T10:00:00Z",
				reviewedAt: "2026-10-06T10:00:00Z",
				imports: [{ title: "Carnes 2027", importedAt: "2026-10-06" }],
			},
			unitCalendar: [{ name: "Carnes", plannedMonth: 3, cycle }],
		}).find((s) => s.id === "send")
		expect(covered?.status).toBe("done")
		expect(covered?.summary).toContain("recebida pela unidade")
		expect(covered?.summary).toContain('"Carnes 2027"')
	})

	test("apoio sem ocorrências e insumo sem item de compra são avisos", () => {
		const steps = buildDemandForecastSteps({ ...base, supportMenusWithoutOccurrences: 1, ingredientsWithoutPurchaseItem: 3 })
		expect(steps.find((s) => s.id === "occasions")?.status).toBe("attention")
		const catalog = steps.find((s) => s.id === "catalog")
		expect(catalog?.status).toBe("attention")
		expect(catalog?.issues[0].action).toBeUndefined()
	})

	test("previsão em elaboração aparece mesmo com outra já recebida", () => {
		const send = buildDemandForecastSteps({
			...base,
			pendingForecasts: 1,
			forecast: { id: "f", title: "Jan", status: "reviewed", updatedAt: "2026-01-05T10:00:00Z", reviewedAt: "2026-01-06T10:00:00Z", imports: [] },
		}).find((s) => s.id === "send")
		expect(send?.status).toBe("attention")
		expect(send?.issues[0].action?.label).toBe("Revisar e enviar")
	})

	test("nenhum cardápio semanal bloqueia", () => {
		expect(buildDemandForecastSteps({ ...base, weeklyWithItems: 0 })[0].status).toBe("blocked")
	})
})
