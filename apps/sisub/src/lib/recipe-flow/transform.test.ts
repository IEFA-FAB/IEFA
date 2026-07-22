import { describe, expect, it } from "vitest"
import { type FetchedStep, orderStepsForExecution } from "./transform"

/** Etapa mínima: `outputs` são as saídas produzidas; `consumes` referencia saídas de outras etapas. */
function step(id: string, outputs: string[], consumes: string[] = []): FetchedStep {
	return {
		id,
		step_template_id: null,
		label: id,
		description: null,
		duration_minutes: null,
		canvas_x: 0,
		canvas_y: 0,
		outputs: outputs.map((o) => ({ id: o, label: null, quantity: null, measure_unit: null, is_final: false })),
		inputs: consumes.map((o) => ({ recipe_ingredient_id: null, source_output_id: o, quantity: null, measure_unit: null })),
		utensils: [],
	}
}

describe("orderStepsForExecution", () => {
	it("mantém a ordem original quando não há dependências", () => {
		const steps = [step("a", ["oa"]), step("b", ["ob"]), step("c", ["oc"])]
		expect(orderStepsForExecution(steps).map((s) => s.id)).toEqual(["a", "b", "c"])
	})

	it("ordena produtor antes do consumidor mesmo com ordem de chegada invertida", () => {
		// c consome de b, b consome de a — chegada invertida.
		const steps = [step("c", ["oc"], ["ob"]), step("b", ["ob"], ["oa"]), step("a", ["oa"])]
		expect(orderStepsForExecution(steps).map((s) => s.id)).toEqual(["a", "b", "c"])
	})

	it("resolve diamante (fan-out + fan-in) com desempate estável", () => {
		// a → b, a → c; d consome de b e c.
		const steps = [step("d", ["od"], ["ob", "oc"]), step("b", ["ob"], ["oa"]), step("c", ["oc"], ["oa"]), step("a", ["oa"])]
		expect(orderStepsForExecution(steps).map((s) => s.id)).toEqual(["a", "b", "c", "d"])
	})

	it("ignora inputs de insumo cru (source_output_id null)", () => {
		const raw = step("a", ["oa"])
		raw.inputs.push({ recipe_ingredient_id: "ing-1", source_output_id: null, quantity: null, measure_unit: null })
		expect(orderStepsForExecution([raw, step("b", ["ob"], ["oa"])]).map((s) => s.id)).toEqual(["a", "b"])
	})

	it("não trava em ciclo: emite os nós restantes na ordem original", () => {
		// a consome de b e b consome de a (inválido) + c independente.
		const steps = [step("a", ["oa"], ["ob"]), step("b", ["ob"], ["oa"]), step("c", ["oc"])]
		const ordered = orderStepsForExecution(steps).map((s) => s.id)
		expect(ordered).toHaveLength(3)
		expect(ordered[0]).toBe("c")
		expect(new Set(ordered)).toEqual(new Set(["a", "b", "c"]))
	})
})
