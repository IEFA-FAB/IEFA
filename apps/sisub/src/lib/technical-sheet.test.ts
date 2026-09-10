/**
 * Matemática da Ficha Técnica de Preparação (`technical-sheet.ts`).
 *
 * O que a suíte protege é o que nenhum tipo pega: o banco guarda o peso líquido TOTAL da
 * preparação, o formulário oficial é lido POR CAPITA, e a divisão pelo rendimento estava
 * espalhada por cada tela. A tabela do editor e a folha de impressão têm que imprimir o
 * mesmo número — e um FC zerado não pode zerar a ficha inteira em silêncio.
 */

import { describe, expect, test } from "vitest"
import {
	correctionFactorFromGross,
	equipmentCapacityLabel,
	equipmentQuantityLabel,
	equipmentTargetLabel,
	equipmentTechnicalNotes,
	flowStepLabel,
	flowStepUtensils,
	flowTotalMinutes,
	formatSheetDuration,
	formatSheetNumber,
	fromStoredQuantity,
	orderRequirementsForSheet,
	portionYieldOrOne,
	rehydrationIndexFromRehydrated,
	roundSheetQuantity,
	type SheetEquipmentRequirement,
	type SheetFlowStep,
	stepLabelById,
	technicalSheetLine,
	technicalSheetTotals,
	toStoredQuantity,
} from "./technical-sheet"

const line = (netQuantity: number | null, correctionFactor: number | null = null, rehydrationIndex: number | null = null) =>
	technicalSheetLine({ netQuantity, correctionFactor, rehydrationIndex }, 100)

describe("technicalSheetLine", () => {
	test("divide o peso líquido total pelo rendimento", () => {
		expect(line(50).netWeight).toBeCloseTo(0.5, 10)
	})

	test("PB = PL x FC", () => {
		const result = line(50, 1.33)
		expect(result.grossWeight).toBeCloseTo(0.665, 10)
		expect(result.correctionFactor).toBe(1.33)
	})

	test("peso reidratado = PL x IR", () => {
		const result = line(10, null, 2.5)
		expect(result.rehydratedWeight).toBeCloseTo(0.25, 10)
	})

	test("fator ausente vale 1 — campo vazio é 'sem correção', não zero", () => {
		const result = line(50)
		expect(result.correctionFactor).toBe(1)
		expect(result.rehydrationIndex).toBe(1)
		expect(result.grossWeight).toBeCloseTo(result.netWeight, 10)
		expect(result.rehydratedWeight).toBeCloseTo(result.netWeight, 10)
	})

	test("fator não-positivo é ignorado — FC zerado zeraria a ficha inteira", () => {
		expect(line(50, 0).grossWeight).toBeCloseTo(0.5, 10)
		expect(line(50, -2).correctionFactor).toBe(1)
	})

	test("quantidade nula vira zero, não NaN", () => {
		const result = line(null)
		expect(result.netWeight).toBe(0)
		expect(result.grossWeight).toBe(0)
	})

	test('base "total" devolve o peso do rendimento inteiro, sem passar pelo per capita', () => {
		const result = technicalSheetLine({ netQuantity: 3333, correctionFactor: 1.33, rehydrationIndex: 2 }, 100, "total")
		// Exato, não `toBeCloseTo`: o valor tem que ser o `net_quantity` gravado. Calcular
		// 3333 ÷ 100 × 100 devolveria 3332,9999999999995 e imprimiria isso na folha.
		expect(result.netWeight).toBe(3333)
		expect(result.grossWeight).toBeCloseTo(4432.89, 10)
		expect(result.rehydratedWeight).toBe(6666)
	})

	test('base "total" é o per capita x rendimento — as duas folhas descrevem a mesma ficha', () => {
		const perCapita = technicalSheetLine({ netQuantity: 50, correctionFactor: 1.2, rehydrationIndex: null }, 100, "porcao")
		const total = technicalSheetLine({ netQuantity: 50, correctionFactor: 1.2, rehydrationIndex: null }, 100, "total")
		expect(total.netWeight).toBeCloseTo(perCapita.netWeight * 100, 10)
		expect(total.grossWeight).toBeCloseTo(perCapita.grossWeight * 100, 10)
	})

	test("a base padrão é o per capita do modelo em papel", () => {
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: null, rehydrationIndex: null }, 100).netWeight).toBeCloseTo(0.5, 10)
	})

	test("rendimento zero ou nulo não produz Infinity", () => {
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: null, rehydrationIndex: null }, 0).netWeight).toBe(50)
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: null, rehydrationIndex: null }, null).netWeight).toBe(50)
		expect(portionYieldOrOne(0)).toBe(1)
		expect(portionYieldOrOne(120)).toBe(120)
	})
})

describe("technicalSheetTotals", () => {
	test("soma as três colunas de peso", () => {
		const totals = technicalSheetTotals([line(50, 1.2), line(30)])
		expect(totals.netWeight).toBeCloseTo(0.8, 10)
		expect(totals.grossWeight).toBeCloseTo(0.9, 10)
	})

	test("coleta as unidades distintas — o TOTAL do papel pressupõe uma só", () => {
		const totals = technicalSheetTotals([
			{ ...line(50), measureUnit: "KG" },
			{ ...line(30), measureUnit: "KG" },
			{ ...line(10), measureUnit: "UN" },
		])
		expect(totals.units).toEqual(["KG", "UN"])
	})

	test("unidade em branco não vira grupo próprio", () => {
		const totals = technicalSheetTotals([
			{ ...line(50), measureUnit: "KG" },
			{ ...line(30), measureUnit: "  " },
			{ ...line(10), measureUnit: null },
		])
		expect(totals.units).toEqual(["KG"])
	})

	test("ficha vazia soma zero", () => {
		expect(technicalSheetTotals([])).toEqual({ grossWeight: 0, netWeight: 0, rehydratedWeight: 0, units: [] })
	})
})

describe("formatSheetNumber", () => {
	test("três casas por padrão — tempero em preparação de 100 porções cai na terceira", () => {
		expect(formatSheetNumber(0.0025)).toBe("0,003")
		expect(formatSheetNumber(0.5)).toBe("0,5")
	})

	test("valor não finito não imprime NaN", () => {
		expect(formatSheetNumber(Number.NaN)).toBe("—")
		expect(formatSheetNumber(Number.POSITIVE_INFINITY)).toBe("—")
	})
})

/**
 * Base de digitação: a ficha de papel vem "por porção" ou "para o rendimento", e o banco
 * guarda sempre o total. O que a suíte protege é a IDA E VOLTA — o campo relê o que
 * gravou a cada tecla, e um resíduo de ponto flutuante ali aparece na tela como
 * 0,004999999999999999 no lugar de 0,005.
 */
describe("toStoredQuantity / fromStoredQuantity", () => {
	test("base total grava e relê o número digitado, sem tocar no rendimento", () => {
		expect(toStoredQuantity(50, "total", 100)).toBe(50)
		expect(fromStoredQuantity(50, "total", 100)).toBe(50)
	})

	test("base porção multiplica pelo rendimento na gravação", () => {
		expect(toStoredQuantity(0.5, "porcao", 100)).toBeCloseTo(50, 10)
		expect(toStoredQuantity(0.12, "porcao", 250)).toBeCloseTo(30, 10)
	})

	test("ida e volta na base porção devolve o mesmo número que foi digitado", () => {
		for (const typed of [0.005, 0.12, 1.5, 33.333, 0.001]) {
			expect(fromStoredQuantity(toStoredQuantity(typed, "porcao", 100), "porcao", 100)).toBe(typed)
		}
	})

	test("a multiplicação não guarda resíduo de ponto flutuante no total", () => {
		// 33,333 × 100 dá 3.333,2999999999997 em binário — e é o total que vai para o banco.
		expect(toStoredQuantity(33.333, "porcao", 100)).toBe(3333.3)
		expect(toStoredQuantity(0.07, "porcao", 3)).toBe(0.21)
	})

	test("na base total o número passa intacto — ali não houve conta a arredondar", () => {
		expect(toStoredQuantity(0.0000001, "total", 100)).toBe(0.0000001)
	})

	test("rendimento inválido cai em 1 — não devolve Infinity nem NaN para a tela", () => {
		expect(toStoredQuantity(2, "porcao", 0)).toBe(2)
		expect(fromStoredQuantity(2, "porcao", null)).toBe(2)
		expect(fromStoredQuantity(2, "porcao", Number.NaN)).toBe(2)
	})

	test("quantidade ausente ou não finita lê como zero", () => {
		expect(fromStoredQuantity(null, "porcao", 100)).toBe(0)
		expect(fromStoredQuantity(Number.NaN, "total", 100)).toBe(0)
		expect(toStoredQuantity(Number.NaN, "porcao", 100)).toBe(0)
	})

	test("trocar de base não altera o dado — só a leitura dele", () => {
		const stored = toStoredQuantity(0.5, "porcao", 100)
		expect(fromStoredQuantity(stored, "total", 100)).toBeCloseTo(50, 10)
		expect(fromStoredQuantity(stored, "porcao", 100)).toBeCloseTo(0.5, 10)
	})
})

/**
 * As voltas existem porque a tabela do formulário aceita digitação em qualquer coluna: a
 * Seção pesa o bruto e o líquido, e o fator é o que sobra. O que a suíte protege é que a
 * volta ajuste o FATOR e nunca o PL — e que a divisão por PL zerado devolva "não dá",
 * em vez de Infinity gravado como fator.
 */
describe("correctionFactorFromGross / rehydrationIndexFromRehydrated", () => {
	test("FC = PB ÷ PL", () => {
		expect(correctionFactorFromGross(0.665, 0.5)).toBeCloseTo(1.33, 10)
	})

	test("IR = peso reidratado ÷ PL", () => {
		expect(rehydrationIndexFromRehydrated(0.25, 0.1)).toBeCloseTo(2.5, 10)
	})

	test("volta e ida fecham — digitar PB devolve o mesmo PB na tela", () => {
		const netWeight = 0.5
		const factor = correctionFactorFromGross(0.665, netWeight)
		expect(technicalSheetLine({ netQuantity: 50, correctionFactor: factor, rehydrationIndex: null }, 100).grossWeight).toBeCloseTo(0.665, 10)
	})

	test("PL zerado não deriva fator — dividir por 0 gravaria Infinity", () => {
		expect(correctionFactorFromGross(0.665, 0)).toBeNull()
		expect(rehydrationIndexFromRehydrated(0.25, -1)).toBeNull()
	})

	test("entrada não numérica não deriva fator", () => {
		expect(correctionFactorFromGross(Number.NaN, 0.5)).toBeNull()
		expect(rehydrationIndexFromRehydrated(0.25, Number.NaN)).toBeNull()
	})

	test("o fator arredonda — o campo derivado não pode ecoar o resíduo binário", () => {
		// 0,1 × 3 = 0,30000000000000004; o FC de volta tem que sair 3, não 2,9999999999999996.
		expect(correctionFactorFromGross(0.1 * 3, 0.1)).toBe(3)
	})
})

describe("roundSheetQuantity", () => {
	test("corta o resíduo binário que um input controlado imprimiria inteiro", () => {
		expect(roundSheetQuantity(0.5 * 1.33)).toBe(0.665)
	})

	test("valor não finito vira 0 — o campo não pode receber NaN", () => {
		expect(roundSheetQuantity(Number.NaN)).toBe(0)
		expect(roundSheetQuantity(Number.POSITIVE_INFINITY)).toBe(0)
	})
})

// ── PARTE 04 / 05 ───────────────────────────────────────────────────────────
// A folha imprimia estas duas Seções em branco mesmo com equipamento e fluxo cadastrados.
// O que a suíte protege é a diferença entre "não cadastrado" e "zero": duração ausente sai
// vazia (nunca "0 min"), soma sem nenhuma duração é `null`, e a quantidade de equipamento
// carrega a batelada de referência — sem ela, "2" lê como duas unidades para a leva inteira.

const requirement = (overrides: Partial<SheetEquipmentRequirement> = {}): SheetEquipmentRequirement => ({
	quantity: 1,
	scaling: "per_batch",
	batch_portions: null,
	min_capacity_liters: null,
	min_capacity_gn: null,
	notes: null,
	recipe_step_id: null,
	role: { name: "Forno combinado" },
	model: null,
	...overrides,
})

const step = (overrides: Partial<SheetFlowStep> = {}): SheetFlowStep => ({
	id: "step-1",
	label: null,
	description: null,
	duration_minutes: null,
	step_template: null,
	utensils: [],
	...overrides,
})

describe("equipmentTargetLabel", () => {
	test("o modelo vence o papel — a exigência por modelo é uma restrição, não um sinônimo", () => {
		const req = requirement({ model: { manufacturer: "Rational", name: "iVario Pro L" } })
		expect(equipmentTargetLabel(req)).toBe("Rational iVario Pro L")
	})

	test("modelo sem fabricante sai só com o nome", () => {
		expect(equipmentTargetLabel(requirement({ role: null, model: { manufacturer: null, name: "iVario Pro L" } }))).toBe("iVario Pro L")
	})

	test("sem alvo resolvido a folha não imprime vazio", () => {
		expect(equipmentTargetLabel(requirement({ role: null, model: null }))).toBe("Equipamento")
	})
})

describe("equipmentQuantityLabel", () => {
	test("por batelada, a quantidade carrega a batelada de referência", () => {
		expect(equipmentQuantityLabel(requirement({ quantity: 2, batch_portions: 100 }))).toBe("2 · por batelada de 100 porções")
	})

	test("fixo na leva sai sem batelada — ali a quantidade não escala", () => {
		expect(equipmentQuantityLabel(requirement({ quantity: 2, scaling: "fixed", batch_portions: 100 }))).toBe("2")
	})

	test("batelada ausente ou zerada não vira 'por batelada de 0 porções'", () => {
		expect(equipmentQuantityLabel(requirement({ quantity: 3 }))).toBe("3")
		expect(equipmentQuantityLabel(requirement({ quantity: 3, batch_portions: 0 }))).toBe("3")
	})
})

describe("equipmentCapacityLabel", () => {
	test("GN tem precedência sobre litros — é a unidade em que a exigência foi cadastrada", () => {
		expect(equipmentCapacityLabel(requirement({ min_capacity_gn: 2, min_capacity_liters: 20 }))).toBe("2 GN")
	})

	test("litros quando é a única restrição", () => {
		expect(equipmentCapacityLabel(requirement({ min_capacity_liters: 20 }))).toBe("20 L")
	})

	test("sem restrição imprime vazio, não um número inventado", () => {
		expect(equipmentCapacityLabel(requirement())).toBe("")
	})
})

describe("formatSheetDuration", () => {
	test("abaixo de uma hora sai em minutos", () => {
		expect(formatSheetDuration(45)).toBe("45 min")
	})

	test("hora cheia não arrasta '0 min'", () => {
		expect(formatSheetDuration(120)).toBe("2 h")
	})

	test("hora e resto", () => {
		expect(formatSheetDuration(90)).toBe("1 h 30 min")
	})

	test("ausente e não-positivo saem VAZIOS — '0 min' afirmaria que a etapa é instantânea", () => {
		expect(formatSheetDuration(null)).toBe("")
		expect(formatSheetDuration(undefined)).toBe("")
		expect(formatSheetDuration(0)).toBe("")
		expect(formatSheetDuration(-5)).toBe("")
		expect(formatSheetDuration(Number.NaN)).toBe("")
	})
})

describe("flowTotalMinutes", () => {
	test("soma as durações declaradas", () => {
		expect(flowTotalMinutes([step({ duration_minutes: 20 }), step({ duration_minutes: 25 })])).toBe(45)
	})

	test("etapa sem duração não zera a soma das outras", () => {
		expect(flowTotalMinutes([step({ duration_minutes: 20 }), step()])).toBe(20)
	})

	test("nenhuma duração devolve null — 0 imprimiria 'a preparação leva zero minuto'", () => {
		expect(flowTotalMinutes([step(), step()])).toBeNull()
		expect(flowTotalMinutes([])).toBeNull()
	})
})

describe("flowStepLabel / flowStepUtensils", () => {
	test("o rótulo digitado vence o do modelo de etapa", () => {
		expect(flowStepLabel(step({ label: "Cocção do arroz", step_template: { name: "Cocção" } }))).toBe("Cocção do arroz")
	})

	test("rótulo em branco cai no modelo de etapa", () => {
		expect(flowStepLabel(step({ label: "   ", step_template: { name: "Cocção" } }))).toBe("Cocção")
	})

	test("sem rótulo nem modelo a linha ainda tem nome", () => {
		expect(flowStepLabel(step())).toBe("Etapa")
	})

	test("utensílios deduplicam e ignoram o vínculo órfão", () => {
		const utensils = [{ utensil: { name: "Caldeirão" } }, { utensil: { name: "Caldeirão" } }, { utensil: null }, { utensil: { name: "Escumadeira" } }]
		expect(flowStepUtensils(step({ utensils }))).toEqual(["Caldeirão", "Escumadeira"])
	})
})

describe("orderRequirementsForSheet", () => {
	const flow = [step({ id: "s1", label: "Refogar" }), step({ id: "s2", label: "Preparar carnes" }), step({ id: "s3", label: "Cozinhar" })]

	test("as exigências de etapa saem na ordem de EXECUÇÃO, não na de cadastro", () => {
		// Cadastro na ordem inversa do fluxo — é o que `loadRequirements` (asc por created_at) devolve.
		const reqs = [requirement({ recipe_step_id: "s3" }), requirement({ recipe_step_id: "s1" }), requirement({ recipe_step_id: "s2" })]
		expect(orderRequirementsForSheet(reqs, flow).map((r) => r.recipe_step_id)).toEqual(["s1", "s2", "s3"])
	})

	test("a exigência da preparação inteira abre a lista — ela vale do começo ao fim", () => {
		const reqs = [requirement({ recipe_step_id: "s2" }), requirement({ recipe_step_id: null }), requirement({ recipe_step_id: "s1" })]
		expect(orderRequirementsForSheet(reqs, flow).map((r) => r.recipe_step_id)).toEqual([null, "s1", "s2"])
	})

	test("etapa fora do fluxo recebido vai para o fim, em bloco e na ordem de cadastro", () => {
		// É o caso do fluxo negado por permissão: a folha imprime a PARTE 04 assim mesmo, e sem
		// rótulo na linha reordenar entre essas exigências embaralharia o que ninguém recoloca.
		const reqs = [requirement({ recipe_step_id: "sumiu-1" }), requirement({ recipe_step_id: "s2" }), requirement({ recipe_step_id: "sumiu-2" })]
		expect(orderRequirementsForSheet(reqs, flow).map((r) => r.recipe_step_id)).toEqual(["s2", "sumiu-1", "sumiu-2"])
	})

	test("empate mantém o cadastro — duas exigências da MESMA etapa não trocam de lugar", () => {
		const reqs = [requirement({ recipe_step_id: "s1", role: { name: "Fogão" } }), requirement({ recipe_step_id: "s1", role: { name: "Coifa" } })]
		expect(orderRequirementsForSheet(reqs, flow).map((r) => r.role?.name)).toEqual(["Fogão", "Coifa"])
	})

	test("ficha sem exigência de etapa e ficha sem fluxo saem intactas", () => {
		const reqs = [requirement({ role: { name: "Forno" } }), requirement({ role: { name: "Caldeirão" } })]
		expect(orderRequirementsForSheet(reqs, flow).map((r) => r.role?.name)).toEqual(["Forno", "Caldeirão"])
		expect(orderRequirementsForSheet(reqs, []).map((r) => r.role?.name)).toEqual(["Forno", "Caldeirão"])
	})

	test("não muta a lista recebida — ela também alimenta a tabela da PARTE 04", () => {
		const reqs = [requirement({ recipe_step_id: "s3" }), requirement({ recipe_step_id: "s1" })]
		orderRequirementsForSheet(reqs, flow)
		expect(reqs.map((r) => r.recipe_step_id)).toEqual(["s3", "s1"])
	})
})

describe("equipmentTechnicalNotes", () => {
	test("a observação sai com o equipamento que a originou", () => {
		const reqs = [requirement({ notes: "cocção sob pressão por 25 min" }), requirement({ notes: null }), requirement({ notes: "   " })]
		expect(equipmentTechnicalNotes(reqs)).toEqual([{ target: "Forno combinado", step: null, note: "cocção sob pressão por 25 min" }])
	})

	test("a etapa entra na nota — duas notas do mesmo papel não podem sair idênticas", () => {
		const labels = stepLabelById([step({ id: "s1", label: "Refogar" }), step({ id: "s2", label: "Cozinhar" })])
		const reqs = [requirement({ recipe_step_id: "s1", notes: "fogo alto" }), requirement({ recipe_step_id: "s2", notes: "fogo brando" })]
		expect(equipmentTechnicalNotes(reqs, labels)).toEqual([
			{ target: "Forno combinado", step: "Refogar", note: "fogo alto" },
			{ target: "Forno combinado", step: "Cozinhar", note: "fogo brando" },
		])
	})

	test("etapa que a folha não sabe nomear sai sem etapa, não com o id cru", () => {
		const labels = stepLabelById([step({ id: "s1", label: "Refogar" })])
		expect(equipmentTechnicalNotes([requirement({ recipe_step_id: "sumiu", notes: "conferir" })], labels)).toEqual([
			{ target: "Forno combinado", step: null, note: "conferir" },
		])
	})

	test("sem observação a lista é vazia — a PARTE 05 volta às pautas", () => {
		expect(equipmentTechnicalNotes([requirement()])).toEqual([])
	})
})

describe("stepLabelById", () => {
	test("mapeia id → rótulo, com o mesmo fallback da tabela de etapas", () => {
		const map = stepLabelById([step({ id: "a", label: "Cocção" }), step({ id: "b" })])
		expect(map.get("a")).toBe("Cocção")
		expect(map.get("b")).toBe("Etapa")
		expect(map.has("c")).toBe(false)
	})
})
