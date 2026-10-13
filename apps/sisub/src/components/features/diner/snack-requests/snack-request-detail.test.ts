import type { SnackRequestDetail } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildComparison, describeDuration, describeEquipment, describePeople, describeStops, describeVehicle } from "./snack-request-detail"

function request(patch: Partial<SnackRequestDetail> = {}): SnackRequestDetail {
	return {
		vehicle_type: null,
		vehicle_registration: null,
		vehicle_om: null,
		stops: null,
		stops_without_mess: false,
		total_minutes: 90,
		longest_leg_minutes: null,
		crew_count: 3,
		pax_count: 2,
		is_operational: true,
		has_galley: false,
		has_oven: false,
		calculator_snapshot: null,
		lines: [],
		...patch,
	} as unknown as SnackRequestDetail
}

describe("textos da missão", () => {
	test("veículo junta só o que existe", () => {
		expect(describeVehicle(request())).toBe("")
		expect(describeVehicle(request({ vehicle_type: "C-105", vehicle_om: "1º/9º GAV" } as Partial<SnackRequestDetail>))).toBe("C-105 · 1º/9º GAV")
	})

	test("escalas", () => {
		expect(describeStops(request())).toBe("")
		expect(describeStops(request({ stops: "SBMN", stops_without_mess: true } as Partial<SnackRequestDetail>))).toBe("SBMN · com escala sem apoio de refeitório")
	})

	test("duração: maior perna e envolvimento (só aérea)", () => {
		expect(describeDuration(request(), true, null)).toBe("1 h 30 min")
		expect(describeDuration(request({ longest_leg_minutes: 60 } as Partial<SnackRequestDetail>), true, 120)).toBe(
			"1 h 30 min · maior perna 1 h · envolvimento 2 h"
		)
		expect(describeDuration(request(), false, 120)).toBe("1 h 30 min")
		expect(describeDuration(request({ longest_leg_minutes: 0 } as Partial<SnackRequestDetail>), true, 0)).toBe(
			"1 h 30 min · maior perna 0 min · envolvimento 0 min"
		)
	})

	test("efetivo e operacional", () => {
		expect(describePeople(request())).toBe("3 / 2 · missão operacional")
		expect(describePeople(request({ is_operational: false } as Partial<SnackRequestDetail>))).toBe("3 / 2 · não operacional")
	})

	test("equipamento", () => {
		expect(describeEquipment(request())).toBe("sem copa")
		expect(describeEquipment(request({ has_galley: true, has_oven: true } as Partial<SnackRequestDetail>))).toBe("copa ou minicozinha · forno")
	})
})

describe("buildComparison", () => {
	test("sem sugestão: só o pedido, sugerido 0", () => {
		const rows = buildComparison(
			request({
				lines: [{ standard_snapshot: { family: "bordo", snackClass: "A" }, audience: "crew", quantity: 2 }],
			} as unknown as Partial<SnackRequestDetail>)
		)
		expect(rows).toEqual([{ key: "bordo:A:crew", family: "bordo", snackClass: "A", audience: "crew", suggested: 0, requested: 2, optional: false }])
	})

	test("soma pedido na linha sugerida e ordena pela chave", () => {
		const rows = buildComparison(
			request({
				calculator_snapshot: {
					entitlement: {
						lines: [
							{ family: "bordo", snackClass: "B", audience: "pax", quantity: 4, optional: true, variants: [] },
							{ family: "bordo", snackClass: "A", audience: "crew", quantity: 3, optional: false, variants: [] },
						],
					},
				},
				lines: [
					{ standard_snapshot: { family: "bordo", snackClass: "A" }, audience: "crew", quantity: 1 },
					{ standard_snapshot: { family: "bordo", snackClass: "A" }, audience: "crew", quantity: 2 },
				],
			} as unknown as Partial<SnackRequestDetail>)
		)
		expect(rows).toEqual([
			{ key: "bordo:A:crew", family: "bordo", snackClass: "A", audience: "crew", suggested: 3, requested: 3, optional: false },
			{ key: "bordo:B:pax", family: "bordo", snackClass: "B", audience: "pax", suggested: 4, requested: 0, optional: true },
		])
	})
})
