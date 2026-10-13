/**
 * Caracterização de `validateForm`: cada mensagem, o campo em que ela cai e a ordem em que os
 * erros entram no objeto (é a ordem da lista de erros no resumo do pedido).
 */

import type { SnackStandardSnapshot } from "@iefa/sisub-domain/utils"
import { describe, expect, test } from "vitest"
import { type FormContext, type FormLine, initialFormState, type SnackRequestFormState, validateForm } from "./snack-request-form"

const NOW = new Date("2026-01-01T12:00:00-03:00")

const STANDARDS = new Map<string, SnackStandardSnapshot>([["s1", { id: "s1" } as SnackStandardSnapshot]])

function validState(patch: Partial<SnackRequestFormState> = {}): SnackRequestFormState {
	return {
		...initialFormState(),
		kitchenId: 1,
		requesterUnitLabel: "Setor",
		missionDescription: "Missão",
		departureLocal: "2026-01-10T10:00",
		totalHours: "4",
		missionOrderNumber: "OM-1",
		crewCount: "2",
		pickupResponsible: "Fulano",
		...patch,
	}
}

function line(patch: Partial<FormLine> = {}): FormLine {
	return { key: "l1", standardId: "s1", audience: "crew", quantity: "2", ...patch }
}

function context(patch: Partial<FormContext> = {}): FormContext {
	return { now: NOW, entitlement: null, lines: [line()], standardsById: STANDARDS, divergences: [], ...patch }
}

function validate(statePatch: Partial<SnackRequestFormState> = {}, contextPatch: Partial<FormContext> = {}) {
	return validateForm(validState(statePatch), context(contextPatch))
}

describe("validateForm", () => {
	test("formulário completo não tem erro", () => {
		expect(validate()).toEqual({})
	})

	test("formulário vazio: todos os erros, nesta ordem", () => {
		const errors = validateForm(initialFormState(), context({ lines: [] }))
		expect(Object.entries(errors)).toEqual([
			["kitchenId", "Escolha a cozinha apoiadora."],
			["requesterUnitLabel", "Informe o setor requisitante."],
			["missionDescription", "Descreva a missão."],
			["departureLocal", "Informe a data e a hora da partida."],
			["totalDuration", "Informe a duração total do deslocamento."],
			["missionOrderNumber", "Missão aérea exige o número da ordem de missão."],
			["people", "Informe a tripulação ou os passageiros."],
			["pickupResponsible", "Informe o responsável pela retirada."],
			["lines", "Inclua pelo menos um padrão com quantidade."],
		])
	})

	test("texto só com espaços conta como vazio", () => {
		expect(validate({ requesterUnitLabel: "  ", missionDescription: " ", missionOrderNumber: " ", pickupResponsible: " " })).toEqual({
			requesterUnitLabel: "Informe o setor requisitante.",
			missionDescription: "Descreva a missão.",
			missionOrderNumber: "Missão aérea exige o número da ordem de missão.",
			pickupResponsible: "Informe o responsável pela retirada.",
		})
	})

	test("duração total acima do teto", () => {
		expect(validate({ totalHours: String(14 * 24 + 1) })).toEqual({ totalDuration: "A duração total não pode passar de 336 h." })
	})

	test("tempo em solo acima do teto só vale na missão aérea", () => {
		expect(validate({ groundHours: "25" })).toEqual({ groundDuration: "O tempo em solo não pode passar de 24 h." })
		expect(validate({ groundHours: "25", missionKind: "terrestre" as const })).toEqual({})
	})

	test("maior perna: só com escala com refeitório e sem 'paradas sem refeitório'", () => {
		expect(validate({ hasMessStop: true })).toEqual({ legDuration: "Informe a maior perna até a escala com apoio de refeitório." })
		expect(validate({ hasMessStop: true, legHours: "5" })).toEqual({ legDuration: "A maior perna não pode ser maior que o deslocamento total." })
		expect(validate({ hasMessStop: true, legHours: "4" })).toEqual({})
		expect(validate({ hasMessStop: true, stopsWithoutMess: true })).toEqual({})
	})

	test("missão terrestre não exige ordem de missão e muda os textos de efetivo", () => {
		const terrestre = { missionKind: "terrestre" as const }
		expect(validate({ ...terrestre, missionOrderNumber: "" })).toEqual({})
		expect(validate({ ...terrestre, crewCount: "" })).toEqual({ people: "Informe o efetivo." })
		expect(validate({ ...terrestre, crewCount: "10000" })).toMatchObject({ crewCount: "O efetivo não pode passar de 9999 pessoas." })
		expect(validate({ ...terrestre, paxCount: "10000" })).toMatchObject({ paxCount: "Os demais não podem passar de 9999 pessoas." })
	})

	test("tripulação e passageiros acima do teto (aérea)", () => {
		expect(validate({ crewCount: "10000" })).toMatchObject({ crewCount: "A tripulação não pode passar de 9999 pessoas." })
		expect(validate({ paxCount: "10000" })).toMatchObject({ paxCount: "Os passageiros não podem passar de 9999 pessoas." })
	})

	test("civis sem motivo", () => {
		expect(validate({ includesNonMilitary: true })).toEqual({
			nonMilitaryReason: "Informe o motivo da participação de civis ou servidores na missão.",
		})
		expect(validate({ includesNonMilitary: true, nonMilitaryReason: "Convidado" })).toEqual({})
	})

	test("material: teto do valor digitado e do derivado, na ordem das chaves", () => {
		expect(validate({ materialOverrides: { ice: "10000" } })).toEqual({ "material-ice": "Gelo: no máximo 9999." })
		// 5000 pessoas: copos = 10000 pelo cálculo; água = 5000 fica no teto.
		const errors = validate({ crewCount: "5000" })
		expect(errors).toEqual({ "material-cups": "Copos: o cálculo por pessoa passou de 9999 — informe a quantidade." })
		const both = validate({ crewCount: "5000", materialOverrides: { water: "10000" } })
		expect(Object.keys(both)).toEqual(["material-water", "material-cups"])
	})

	test("retirada incompleta, depois da partida, no passado", () => {
		expect(validate({ pickupLocal: "2026-01-10" })).toEqual({ pickupLocal: "Data e hora da retirada incompletas." })
		expect(validate({ pickupLocal: "2026-01-10T11:00" })).toEqual({ pickupLocal: "A retirada tem que ser antes da partida." })
		expect(validate({ pickupLocal: "2026-01-01T11:00", lateReason: "x" })).toEqual({ pickupLocal: "A retirada tem que ser no futuro." })
		expect(validate({ pickupLocal: "2026-01-01T12:00", lateReason: "x" })).toEqual({ pickupLocal: "A retirada tem que ser no futuro." })
		expect(validate({ pickupLocal: "2026-01-10T10:00" })).toEqual({})
	})

	test("pedido em cima da hora exige justificativa", () => {
		const late = { departureLocal: "2026-01-02T10:00" }
		expect(validate(late)).toEqual({ lateReason: "Pedido com menos de 24 h de antecedência exige justificativa." })
		expect(validate({ ...late, lateReason: "Urgente" })).toEqual({})
	})

	test("linhas: teto, vazio, incompleta e quantidade acima do teto", () => {
		const many = Array.from({ length: 41 }, (_, i) => line({ key: `l${i}` }))
		expect(validate({}, { lines: many })).toEqual({ lines: "O pedido aceita no máximo 40 padrões — remova linhas." })
		expect(validate({}, { lines: [line({ quantity: "0" })] })).toEqual({ lines: "Inclua pelo menos um padrão com quantidade." })
		expect(validate({}, { lines: [line(), line({ key: "l2", standardId: null })] })).toEqual({
			lines: "Há linha sem padrão ou sem quantidade — complete ou remova.",
		})
		expect(validate({}, { lines: [line(), line({ key: "l2", standardId: "desconhecido" })] })).toEqual({
			lines: "Há linha sem padrão ou sem quantidade — complete ou remova.",
		})
		expect(validate({}, { lines: [line({ quantity: "10000" })] })).toEqual({ lines: "Cada padrão aceita no máximo 9999 kits." })
	})

	test("divergência da calculadora sem motivo", () => {
		expect(validate({}, { divergences: ["x"] })).toEqual({ divergenceReason: "O pedido difere da sugestão da calculadora: explique o motivo." })
		expect(validate({ divergenceReason: "porque" }, { divergences: ["x"] })).toEqual({})
	})
})
