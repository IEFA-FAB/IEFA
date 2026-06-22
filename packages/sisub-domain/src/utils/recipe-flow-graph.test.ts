import { describe, expect, test } from "bun:test"
import { collectFinalOutputs, computeMaterialBalance, type DeclaredIngredient, type FlowGraphStep, findFlowCycle, validateFlow } from "./recipe-flow-graph.ts"

/** Atalho: etapa com uma saída e inputs. */
function step(clientId: string, outputs: { clientId: string; isFinal?: boolean }[], inputs: FlowGraphStep["inputs"] = []): FlowGraphStep {
	return { clientId, outputs: outputs.map((o) => ({ clientId: o.clientId, isFinal: o.isFinal ?? false })), inputs }
}

const declared = (id: string, qty: number, isOptional = false): DeclaredIngredient => ({ recipeIngredientId: id, netQuantity: qty, isOptional })

describe("findFlowCycle", () => {
	test("DAG linear não tem ciclo", () => {
		const steps = [step("a", [{ clientId: "oa" }]), step("b", [{ clientId: "ob", isFinal: true }], [{ sourceOutputClientId: "oa", quantity: 1 }])]
		expect(findFlowCycle(steps)).toBeNull()
	})

	test("detecta self-loop (etapa consome a própria saída)", () => {
		const steps = [step("a", [{ clientId: "oa" }], [{ sourceOutputClientId: "oa", quantity: 1 }])]
		expect(findFlowCycle(steps)).toEqual(["a"])
	})

	test("detecta ciclo a→b→a", () => {
		const steps = [
			step("a", [{ clientId: "oa" }], [{ sourceOutputClientId: "ob", quantity: 1 }]),
			step("b", [{ clientId: "ob" }], [{ sourceOutputClientId: "oa", quantity: 1 }]),
		]
		expect(findFlowCycle(steps)).not.toBeNull()
	})

	test("ramos paralelos que convergem não são ciclo", () => {
		const steps = [
			step("a", [{ clientId: "oa" }]),
			step("b", [{ clientId: "ob" }]),
			step(
				"c",
				[{ clientId: "oc", isFinal: true }],
				[
					{ sourceOutputClientId: "oa", quantity: 1 },
					{ sourceOutputClientId: "ob", quantity: 1 },
				]
			),
		]
		expect(findFlowCycle(steps)).toBeNull()
	})
})

describe("computeMaterialBalance", () => {
	test("consumo exato → ok", () => {
		const steps = [step("a", [{ clientId: "oa", isFinal: true }], [{ recipeIngredientId: "ri1", quantity: 100 }])]
		const [b] = computeMaterialBalance(steps, [declared("ri1", 100)])
		expect(b.status).toBe("ok")
		expect(b.consumed).toBe(100)
	})

	test("soma consumo do mesmo insumo em várias etapas", () => {
		const steps = [
			step("a", [{ clientId: "oa" }], [{ recipeIngredientId: "ri1", quantity: 60 }]),
			step("b", [{ clientId: "ob", isFinal: true }], [{ recipeIngredientId: "ri1", quantity: 40 }]),
		]
		const [b] = computeMaterialBalance(steps, [declared("ri1", 100)])
		expect(b.consumed).toBe(100)
		expect(b.status).toBe("ok")
	})

	test("excesso → over; falta → under; zero → unconsumed", () => {
		const over = computeMaterialBalance([step("a", [{ clientId: "oa" }], [{ recipeIngredientId: "ri1", quantity: 150 }])], [declared("ri1", 100)])
		expect(over[0].status).toBe("over")
		const under = computeMaterialBalance([step("a", [{ clientId: "oa" }], [{ recipeIngredientId: "ri1", quantity: 50 }])], [declared("ri1", 100)])
		expect(under[0].status).toBe("under")
		const none = computeMaterialBalance([], [declared("ri1", 100)])
		expect(none[0].status).toBe("unconsumed")
	})
})

describe("collectFinalOutputs", () => {
	test("coleta só as saídas marcadas como final", () => {
		const steps = [step("a", [{ clientId: "oa" }]), step("b", [{ clientId: "ob", isFinal: true }])]
		expect(collectFinalOutputs(steps)).toEqual(["ob"])
	})
})

describe("validateFlow", () => {
	const okFlow: FlowGraphStep[] = [step("a", [{ clientId: "oa", isFinal: true }], [{ recipeIngredientId: "ri1", quantity: 100 }])]

	test("fluxo válido: sem erros", () => {
		const r = validateFlow(okFlow, [declared("ri1", 100)])
		expect(r.errors).toEqual([])
	})

	test("excesso de insumo é erro bloqueante", () => {
		const r = validateFlow([step("a", [{ clientId: "oa", isFinal: true }], [{ recipeIngredientId: "ri1", quantity: 150 }])], [declared("ri1", 100)])
		expect(r.errors.some((e) => e.includes("ri1"))).toBe(true)
	})

	test("insumo obrigatório não consumido é apenas aviso", () => {
		const r = validateFlow(okFlow, [declared("ri1", 100), declared("ri2", 50)])
		expect(r.errors).toEqual([])
		expect(r.warnings.some((w) => w.includes("ri2"))).toBe(true)
	})

	test("insumo OPCIONAL não consumido não gera aviso nem erro", () => {
		const r = validateFlow(okFlow, [declared("ri1", 100), declared("ri2", 50, true)])
		expect(r.errors).toEqual([])
		expect(r.warnings).toEqual([])
	})

	test("zero saídas finais é erro", () => {
		const r = validateFlow([step("a", [{ clientId: "oa" }], [{ recipeIngredientId: "ri1", quantity: 100 }])], [declared("ri1", 100)])
		expect(r.errors.some((e) => e.includes("final"))).toBe(true)
	})

	test("duas saídas finais é erro", () => {
		const steps = [
			step("a", [{ clientId: "oa", isFinal: true }], [{ recipeIngredientId: "ri1", quantity: 100 }]),
			step("b", [{ clientId: "ob", isFinal: true }]),
		]
		const r = validateFlow(steps, [declared("ri1", 100)])
		expect(r.errors.some((e) => e.includes("fina"))).toBe(true)
	})

	test("input referenciando insumo fora da receita é erro", () => {
		const r = validateFlow([step("a", [{ clientId: "oa", isFinal: true }], [{ recipeIngredientId: "ghost", quantity: 1 }])], [declared("ri1", 100)])
		expect(r.errors.some((e) => e.includes("ghost"))).toBe(true)
	})

	test("input referenciando saída inexistente é erro", () => {
		const r = validateFlow([step("a", [{ clientId: "oa", isFinal: true }], [{ sourceOutputClientId: "ghost", quantity: 1 }])], [])
		expect(r.errors.some((e) => e.includes("ghost"))).toBe(true)
	})

	test("ciclo é erro", () => {
		const steps = [
			step("a", [{ clientId: "oa", isFinal: true }], [{ sourceOutputClientId: "ob", quantity: 1 }]),
			step("b", [{ clientId: "ob" }], [{ sourceOutputClientId: "oa", quantity: 1 }]),
		]
		const r = validateFlow(steps, [])
		expect(r.errors.some((e) => e.includes("ciclo"))).toBe(true)
	})

	test("fluxo vazio é válido (sem etapas, sem exigência de final)", () => {
		const r = validateFlow([], [declared("ri1", 100)])
		expect(r.errors).toEqual([])
	})
})
