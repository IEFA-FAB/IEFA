import { describe, expect, test } from "bun:test"
import {
	calculateSnackEntitlement,
	effectiveMissionMinutes,
	findEntitlementDivergences,
	kcalRangeFor,
	mealWindowsCovered,
	type SnackMissionInput,
} from "./snack-entitlement.ts"

// 15:00 em Brasília (18:00 UTC): fora de toda janela de refeição por até 3 h.
const AFTERNOON = "2026-10-05T18:00:00.000Z"
// 10:30 em Brasília: um voo de 2 h atravessa o almoço.
const LATE_MORNING = "2026-10-05T13:30:00.000Z"

function mission(overrides: Partial<SnackMissionInput> = {}): SnackMissionInput {
	return {
		missionKind: "aerea",
		departureAt: AFTERNOON,
		totalMinutes: 120,
		longestLegMinutes: null,
		stopsWithoutMess: false,
		groundMinutes: 0,
		isOperational: true,
		hasGalley: true,
		hasOven: true,
		crewCount: 6,
		paxCount: 0,
		...overrides,
	}
}

function classes(input: SnackMissionInput) {
	return [...new Set(calculateSnackEntitlement(input).lines.map((l) => `${l.family}:${l.snackClass}`))].toSorted()
}

describe("Lanche de Bordo", () => {
	test("voo curto fora de horário de refeição recebe só Classe A, para tripulação e passageiros", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 150, paxCount: 3 }))
		expect(result.lines.map((l) => [l.snackClass, l.audience, l.quantity])).toEqual([
			["A", "crew", 6],
			["A", "pax", 3],
		])
		expect(result.lines[0]?.kcal).toEqual({ min: 0, max: 100 })
	})

	test("Classe B é complemento da A, não substituta", () => {
		expect(classes(mission({ totalMinutes: 300 }))).toEqual(["bordo:A", "bordo:B"])
	})

	test("envolvimento, e não o voo, decide a Classe B (R-B1)", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 150, groundMinutes: 50 }))
		expect(result.involvementMinutes).toBe(200)
		expect(result.lines.find((l) => l.snackClass === "B")?.ruleId).toBe("R-B1")
	})

	test("exatamente 3 h de envolvimento fora de refeição não dá Classe B", () => {
		expect(classes(mission({ totalMinutes: 180 }))).toEqual(["bordo:A"])
	})

	test("voo de 1 a 3 h sobre o almoço dá Classe B (R-B2) e informa a janela", () => {
		const result = calculateSnackEntitlement(mission({ departureAt: LATE_MORNING, totalMinutes: 120 }))
		expect(result.mealWindowsCovered).toEqual(["almoco"])
		const lineB = result.lines.find((l) => l.snackClass === "B")
		expect(lineB?.ruleId).toBe("R-B2")
		expect(lineB?.reason).toContain("almoço")
	})

	test("voo de menos de 1 h sobre o almoço não dá Classe B", () => {
		expect(classes(mission({ departureAt: LATE_MORNING, totalMinutes: 50 }))).toEqual(["bordo:A"])
	})

	test("passageiro de voo não operacional fica fora da Classe B (R-B3)", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 300, paxCount: 4, isOperational: false }))
		expect(result.lines.filter((l) => l.snackClass === "B").map((l) => l.audience)).toEqual(["crew"])
		expect(result.lines.filter((l) => l.snackClass === "A").map((l) => [l.audience, l.quantity])).toEqual([
			["crew", 6],
			["pax", 4],
		])
		expect(result.notes.map((n) => n.ruleId)).toContain("R-B3")
	})

	test("passageiro militar de missão operacional entra na Classe B", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 300, paxCount: 4 }))
		expect(result.lines.filter((l) => l.snackClass === "B").map((l) => l.audience)).toEqual(["crew", "pax"])
	})

	test("fronteira de 6 h: Classe C e nunca B", () => {
		expect(classes(mission({ totalMinutes: 360 }))).toEqual(["bordo:A", "bordo:C"])
	})

	test("voo abaixo de 6 h com envolvimento de 6 h ou mais fica na B (N7)", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 300, groundMinutes: 90 }))
		expect(classes(mission({ totalMinutes: 300, groundMinutes: 90 }))).toEqual(["bordo:A", "bordo:B"])
		expect(result.lines.find((l) => l.snackClass === "B")?.ruleId).toBe("N7")
	})

	test("Classe C de 30 h: 2 cotas por tripulante e faixa de 1.200–2.000 kcal", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 1800 }))
		const lineC = result.lines.find((l) => l.snackClass === "C")
		expect(lineC?.quantity).toBe(12)
		expect(lineC?.kcal).toEqual({ min: 1200, max: 2000 })
	})

	test("Classe C de 24 h exatas é uma cota por dia", () => {
		expect(calculateSnackEntitlement(mission({ totalMinutes: 1440 })).lines.find((l) => l.snackClass === "C")?.quantity).toBe(6)
	})

	test("Classe C até 15 h fica em 600–1.200 kcal (N2)", () => {
		expect(kcalRangeFor("bordo", "C", 15 * 60)).toEqual({ min: 600, max: 1200 })
		expect(kcalRangeFor("bordo", "C", 15 * 60 + 1)).toEqual({ min: 1200, max: 2000 })
	})

	test("passageiros de voo não operacional são opcionais na Classe C (R-C3)", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 480, paxCount: 5, isOperational: false }))
		const paxC = result.lines.find((l) => l.snackClass === "C" && l.audience === "pax")
		expect(paxC?.optional).toBe(true)
		expect(paxC?.ruleId).toBe("R-C3")
	})

	test("aeronave sem copa só recebe sanduíche (R-V1)", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 300, hasGalley: false }))
		expect(result.lines.find((l) => l.snackClass === "B")?.variants).toEqual(["lanche"])
		expect(result.notes.map((n) => n.ruleId)).toContain("R-V1")
	})

	test("almoço a bordo sem forno não admite refeição (R-V2)", () => {
		const result = calculateSnackEntitlement(mission({ departureAt: LATE_MORNING, totalMinutes: 300, hasOven: false }))
		expect(result.lines.find((l) => l.snackClass === "B")?.variants).toEqual(["lanche"])
		expect(result.notes.map((n) => n.ruleId)).toContain("R-V2")
	})

	test("com copa, fora de almoço e jantar, refeição é permitida mesmo sem forno", () => {
		const result = calculateSnackEntitlement(mission({ totalMinutes: 120, groundMinutes: 90, hasOven: false }))
		expect(result.lines.find((l) => l.snackClass === "B")?.variants).toEqual(["lanche", "refeicao"])
	})
})

describe("Lanche de Apoio", () => {
	const ground = (totalMinutes: number, overrides: Partial<SnackMissionInput> = {}) =>
		mission({ missionKind: "terrestre", totalMinutes, crewCount: 10, ...overrides })

	test("até 2 h não há lanche devido e o motivo é explicado", () => {
		const result = calculateSnackEntitlement(ground(120))
		expect(result.lines).toEqual([])
		expect(result.notes.map((n) => n.ruleId)).toEqual(["R-T0"])
	})

	test("de 2 h a 4 h: Classe A, só sanduíche", () => {
		const result = calculateSnackEntitlement(ground(121))
		expect(result.lines.map((l) => [l.snackClass, l.quantity, l.variants])).toEqual([["A", 10, ["lanche"]]])
	})

	test("4 h exatas vão à Classe B (N1)", () => {
		const result = calculateSnackEntitlement(ground(240))
		expect(result.lines.map((l) => [l.snackClass, l.ruleId])).toEqual([["B", "N1"]])
	})

	test("8 h exatas: Classe B sem reforço (N1)", () => {
		expect(calculateSnackEntitlement(ground(480)).lines.map((l) => [l.snackClass, l.quantity, l.ruleId])).toEqual([["B", 10, "N1"]])
	})

	test("12 h: Classe B mais 1 unidade adicional por pessoa (R-T3)", () => {
		const result = calculateSnackEntitlement(ground(720))
		expect(result.lines.map((l) => [l.ruleId, l.quantity])).toEqual([
			["R-T2", 10],
			["R-T3", 10],
		])
	})

	test("apoio nunca tem Classe C", () => {
		expect(calculateSnackEntitlement(ground(2000)).lines.every((l) => l.snackClass !== "C")).toBe(true)
	})
})

describe("escalas (R-P)", () => {
	test("escala sem rancho usa o deslocamento total", () => {
		const input = mission({ totalMinutes: 300, longestLegMinutes: 120, stopsWithoutMess: true })
		expect(effectiveMissionMinutes(input)).toBe(300)
		expect(classes(input)).toEqual(["bordo:A", "bordo:B"])
		expect(calculateSnackEntitlement(input).notes.map((n) => n.ruleId)).toContain("R-P")
	})

	test("escala com rancho usa a maior perna", () => {
		const input = mission({ totalMinutes: 300, longestLegMinutes: 120, stopsWithoutMess: false })
		expect(effectiveMissionMinutes(input)).toBe(120)
		expect(classes(input)).toEqual(["bordo:A"])
	})
})

describe("janelas de refeição", () => {
	test("voo noturno atravessando a meia-noite pega o café do dia seguinte", () => {
		// 23:00 de Brasília + 8 h = 07:00.
		expect(mealWindowsCovered("2026-10-06T02:00:00.000Z", 480)).toEqual(["cafe"])
	})

	test("data inválida não cobre janela", () => {
		expect(mealWindowsCovered("não é data", 300)).toEqual([])
	})
})

describe("divergência do pedido", () => {
	const entitlement = calculateSnackEntitlement(mission({ totalMinutes: 150 }))

	test("pedir classe que a sugestão não traz diverge", () => {
		expect(findEntitlementDivergences(entitlement, [{ family: "bordo", snackClass: "B", audience: "crew", quantity: 6 }])).toEqual(["bordo:B:crew"])
	})

	test("pedir mais unidades do que o sugerido diverge", () => {
		expect(findEntitlementDivergences(entitlement, [{ family: "bordo", snackClass: "A", audience: "crew", quantity: 7 }])).toEqual(["bordo:A:crew"])
	})

	test("pedir menos não diverge", () => {
		expect(findEntitlementDivergences(entitlement, [{ family: "bordo", snackClass: "A", audience: "crew", quantity: 4 }])).toEqual([])
	})
})
