import type { Connection } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import {
	type FlowNode,
	INGREDIENT_NODE_PREFIX,
	INGREDIENT_SOURCE_HANDLE,
	type MaterialEdge,
	STEP_TARGET_HANDLE,
	type StepNode,
} from "@/types/domain/recipe-flow"
import { isValidRecipeFlowConnection } from "./validate"

function stepNode(id: string, outputs: { clientId: string; isFinal?: boolean }[]): StepNode {
	return {
		id,
		type: "step",
		position: { x: 0, y: 0 },
		data: {
			label: id,
			description: null,
			durationMinutes: null,
			stepTemplateId: null,
			outputs: outputs.map((o) => ({ clientId: o.clientId, label: null, quantity: null, measureUnit: null, isFinal: o.isFinal ?? false })),
			utensils: [],
		},
	}
}

function ingredientNode(recipeIngredientId: string): FlowNode {
	return {
		id: `${INGREDIENT_NODE_PREFIX}${recipeIngredientId}`,
		type: "ingredient",
		position: { x: 0, y: 0 },
		data: { recipeIngredientId, name: recipeIngredientId, measureUnit: "g", netQuantity: 100, isOptional: false },
	}
}

/** Edge intermediária: saída `outputClientId` da etapa `from` entra na etapa `to`. */
function intermediateEdge(from: string, outputClientId: string, to: string): MaterialEdge {
	return {
		id: `e-${from}-${to}`,
		source: from,
		sourceHandle: outputClientId,
		target: to,
		targetHandle: STEP_TARGET_HANDLE,
		type: "material",
		data: { kind: "intermediate", quantity: null, measureUnit: null },
	}
}

function conn(source: string | null, target: string | null, sourceHandle: string | null = null): Connection {
	// source/target são não-nulos no tipo Connection; o cast permite exercitar os
	// caminhos de guarda (null) que a função trata em runtime.
	return { source, target, sourceHandle, targetHandle: STEP_TARGET_HANDLE } as Connection
}

// Cenário base: etapa A (saída oA) alimenta etapa B (saída final oB); etapa C solta.
const stepA = stepNode("A", [{ clientId: "oA" }])
const stepB = stepNode("B", [{ clientId: "oB", isFinal: true }])
const stepC = stepNode("C", [{ clientId: "oC" }])
const ing1 = ingredientNode("i1")
const nodes: FlowNode[] = [ing1, stepA, stepB, stepC]
const edges: MaterialEdge[] = [intermediateEdge("A", "oA", "B")]

describe("isValidRecipeFlowConnection", () => {
	test("insumo → etapa é válido", () => {
		expect(isValidRecipeFlowConnection(conn(ing1.id, "A", INGREDIENT_SOURCE_HANDLE), nodes, edges)).toBe(true)
	})

	test("saída de etapa → outra etapa (sem ciclo) é válido", () => {
		expect(isValidRecipeFlowConnection(conn("B", "C", "oB"), nodes, edges)).toBe(true)
	})

	test("conexão que fecha ciclo (B → A, já existindo A → B) é rejeitada", () => {
		expect(isValidRecipeFlowConnection(conn("B", "A", "oB"), nodes, edges)).toBe(false)
	})

	test("target que não é etapa (é insumo) é rejeitado", () => {
		expect(isValidRecipeFlowConnection(conn("A", ing1.id, "oA"), nodes, edges)).toBe(false)
	})

	test("self-loop é rejeitado", () => {
		expect(isValidRecipeFlowConnection(conn("A", "A", "oA"), nodes, edges)).toBe(false)
	})

	test("edge duplicada (mesma fonte/handle → mesmo target) é rejeitada", () => {
		expect(isValidRecipeFlowConnection(conn("A", "B", "oA"), nodes, edges)).toBe(false)
	})

	test("source ou target ausente é rejeitado", () => {
		expect(isValidRecipeFlowConnection(conn(null, "A"), nodes, edges)).toBe(false)
		expect(isValidRecipeFlowConnection(conn("A", null, "oA"), nodes, edges)).toBe(false)
	})

	test("source inexistente no grafo é rejeitado", () => {
		expect(isValidRecipeFlowConnection(conn("fantasma", "A"), nodes, edges)).toBe(false)
	})
})
