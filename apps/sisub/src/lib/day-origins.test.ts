import { describe, expect, test } from "vitest"
import { dayOriginsOf } from "./day-origins"

describe("dayOriginsOf", () => {
	test("agrupa por origem, conta preparações, ignora item manual e produção de pedido de lanche", () => {
		const origins = dayOriginsOf(
			[
				{
					menu_items: [
						{ origin_template_id: "apoio", origin_template_type: "apoio" },
						{ origin_template_id: "apoio", origin_template_type: "apoio" },
						{ origin_template_id: "semana", origin_template_type: "weekly" },
						{ origin_template_id: null },
						{ origin_template_id: "padrao-lanche", origin_template_type: "apoio", origin_snack_request_id: "pedido" },
					],
				},
				{ menu_items: [{ origin_template_id: "evento", origin_template_type: "event" }] },
			],
			[
				{ id: "apoio", name: "Apoio viagem" },
				{ id: "semana", name: "Semana A" },
			]
		)
		expect(origins.map((o) => [o.typeLabel, o.name, o.itemCount])).toEqual([
			["Cardápio semanal", "Semana A", 1],
			["Evento", "Cardápio removido", 1],
			["Cardápio de apoio", "Apoio viagem", 2],
		])
	})

	test("conta as preparações sem porções de cada origem (aplicada sem efetivo)", () => {
		const [origin] = dayOriginsOf(
			[
				{
					menu_items: [
						{ origin_template_id: "apoio", origin_template_type: "apoio", planned_portion_quantity: null },
						{ origin_template_id: "apoio", origin_template_type: "apoio", planned_portion_quantity: 12 },
					],
				},
			],
			[{ id: "apoio", name: "Apoio viagem" }]
		)
		expect(origin).toMatchObject({ itemCount: 2, pendingCount: 1 })
	})
})
