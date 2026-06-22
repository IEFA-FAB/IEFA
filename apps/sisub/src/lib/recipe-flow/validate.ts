/**
 * Validação de conexão do editor de fluxo (espelha lib/places-graph/validate.ts):
 * regras declarativas + reuso do detector de ciclo do domínio (findFlowCycle).
 *
 * Regras: target é sempre uma etapa; source é insumo (palette) ou saída de etapa;
 * sem self-loop; sem fechar ciclo (DAG).
 */

import { findFlowCycle } from "@iefa/sisub-domain"
import type { Connection } from "@xyflow/react"
import { type FlowNode, INGREDIENT_NODE_PREFIX, type MaterialEdge } from "@/types/domain/recipe-flow"
import { toGraphSteps } from "./transform"

const isIngredientId = (id: string | null | undefined): boolean => !!id?.startsWith(INGREDIENT_NODE_PREFIX)

/** Constrói o synthetic MaterialEdge a partir de uma Connection proposta. */
function connectionToEdge(conn: Connection): MaterialEdge | null {
	if (!conn.source || !conn.target) return null
	if (isIngredientId(conn.source)) {
		return {
			id: `tmp-${conn.source}-${conn.target}`,
			source: conn.source,
			target: conn.target,
			sourceHandle: conn.sourceHandle ?? null,
			targetHandle: conn.targetHandle ?? null,
			type: "material",
			data: { kind: "raw", quantity: null, measureUnit: null, recipeIngredientId: conn.source.slice(INGREDIENT_NODE_PREFIX.length) },
		}
	}
	return {
		id: `tmp-${conn.source}-${conn.target}`,
		source: conn.source,
		target: conn.target,
		sourceHandle: conn.sourceHandle ?? null,
		targetHandle: conn.targetHandle ?? null,
		type: "material",
		data: { kind: "intermediate", quantity: null, measureUnit: null },
	}
}

export function isValidRecipeFlowConnection(conn: Connection, nodes: FlowNode[], edges: MaterialEdge[]): boolean {
	if (!conn.source || !conn.target) return false
	// target tem que ser uma etapa
	const target = nodes.find((n) => n.id === conn.target)
	if (target?.type !== "step") return false
	// source: insumo OU etapa (nunca um insumo como target já é coberto acima)
	const source = nodes.find((n) => n.id === conn.source)
	if (!source) return false
	// self-loop
	if (conn.source === conn.target) return false

	const synthetic = connectionToEdge(conn)
	if (!synthetic) return false
	// evita edge idêntica duplicada (mesma fonte/handle → mesmo target)
	const dup = edges.some((e) => e.source === conn.source && e.target === conn.target && (e.sourceHandle ?? null) === (conn.sourceHandle ?? null))
	if (dup) return false

	return findFlowCycle(toGraphSteps(nodes, [...edges, synthetic])) == null
}
