import { describe, expect, test } from "vitest"
import { dayOriginsOf } from "./day-origins"

describe("dayOriginsOf", () => {
	test("agrupa por origem, conta preparações, ignora item manual e produção de pedido de lanche", () => {
		const origins = dayOriginsOf(
			[
				{
					menu_items: [
						{ origin_template_id: "apoio", origin_template_type: "exception" },
						{ origin_template_id: "apoio", origin_template_type: "exception" },
						{ origin_template_id: "semana", origin_template_type: "weekly" },
						{ origin_template_id: null },
						{ origin_template_id: "padrao-lanche", origin_template_type: "exception", origin_snack_request_id: "pedido" },
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
			["Apoio", "Apoio viagem", 2],
		])
	})
})
