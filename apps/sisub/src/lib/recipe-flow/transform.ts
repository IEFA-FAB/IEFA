/**
 * Conversão entre o contrato do domínio (fetchRecipeFlow / SaveRecipeFlow) e o
 * grafo do xyflow (nodes/edges).
 *
 * Cada `recipe_step` vira um StepNode; cada `recipe_ingredient` referenciado (ou
 * adicionado pela palette) vira um IngredientNode (fonte). Cada `recipe_step_input`
 * vira uma edge: insumo cru (`raw`) parte de um IngredientNode; saída de etapa
 * (`intermediate`) parte do handle de output da etapa produtora.
 */

import type { FlowGraphStep, SaveRecipeFlow } from "@iefa/sisub-domain"
import {
	type FlowNode,
	INGREDIENT_NODE_PREFIX,
	INGREDIENT_SOURCE_HANDLE,
	type MaterialEdge,
	type RecipeIngredientSource,
	STEP_TARGET_HANDLE,
	type StepNode,
} from "@/types/domain/recipe-flow"

// Shape (lean) do que o domínio devolve em fetchRecipeFlow.
interface FetchedOutput {
	id: string
	label: string | null
	quantity: string | null
	measure_unit: string | null
	is_final: boolean
}
interface FetchedInput {
	recipe_ingredient_id: string | null
	source_output_id: string | null
	quantity: string | null
	measure_unit: string | null
}
interface FetchedUtensil {
	utensil_id: string
	utensil: { name: string } | null
}
export interface FetchedStep {
	id: string
	step_template_id: string | null
	label: string | null
	description: string | null
	duration_minutes: number | null
	canvas_x: number
	canvas_y: number
	outputs: FetchedOutput[]
	inputs: FetchedInput[]
	utensils: FetchedUtensil[]
}

const num = (s: string | null): number | null => (s != null && s !== "" ? Number(s) : null)

export const ingredientNodeId = (recipeIngredientId: string): string => `${INGREDIENT_NODE_PREFIX}${recipeIngredientId}`

/** Constrói nodes/edges a partir do fluxo persistido + insumos da receita. */
export function flowToGraph(steps: FetchedStep[], ingredients: RecipeIngredientSource[]): { nodes: FlowNode[]; edges: MaterialEdge[] } {
	const ingredientById = new Map(ingredients.map((i) => [i.recipeIngredientId, i]))
	// outputId → stepId produtor (para resolver edges intermediárias)
	const outputToStep = new Map<string, string>()
	for (const s of steps) for (const o of s.outputs) outputToStep.set(o.id, s.id)

	const stepNodes: StepNode[] = steps.map((s) => ({
		id: s.id,
		type: "step",
		position: { x: s.canvas_x, y: s.canvas_y },
		data: {
			label: s.label,
			description: s.description,
			durationMinutes: s.duration_minutes,
			stepTemplateId: s.step_template_id,
			outputs: s.outputs.map((o) => ({ clientId: o.id, label: o.label, quantity: num(o.quantity), measureUnit: o.measure_unit, isFinal: o.is_final })),
			utensils: s.utensils.map((u) => ({ id: u.utensil_id, name: u.utensil?.name ?? "Utensílio" })),
		},
	}))

	const edges: MaterialEdge[] = []
	const usedIngredientIds = new Set<string>()
	for (const s of steps) {
		for (const inp of s.inputs) {
			if (inp.recipe_ingredient_id != null) {
				usedIngredientIds.add(inp.recipe_ingredient_id)
				edges.push({
					id: `e-${ingredientNodeId(inp.recipe_ingredient_id)}-${s.id}`,
					source: ingredientNodeId(inp.recipe_ingredient_id),
					sourceHandle: INGREDIENT_SOURCE_HANDLE,
					target: s.id,
					targetHandle: STEP_TARGET_HANDLE,
					type: "material",
					data: { kind: "raw", quantity: num(inp.quantity), measureUnit: inp.measure_unit, recipeIngredientId: inp.recipe_ingredient_id },
				})
			} else if (inp.source_output_id != null) {
				const producer = outputToStep.get(inp.source_output_id)
				if (!producer) continue
				edges.push({
					id: `e-${producer}-${inp.source_output_id}-${s.id}`,
					source: producer,
					sourceHandle: inp.source_output_id,
					target: s.id,
					targetHandle: STEP_TARGET_HANDLE,
					type: "material",
					data: { kind: "intermediate", quantity: num(inp.quantity), measureUnit: inp.measure_unit },
				})
			}
		}
	}

	// Nós de insumo: só os referenciados entram no canvas inicial (palette adiciona o resto).
	const ingredientNodes: FlowNode[] = []
	let row = 0
	for (const riId of usedIngredientIds) {
		const ing = ingredientById.get(riId)
		if (!ing) continue
		ingredientNodes.push(makeIngredientNode(ing, { x: 0, y: row * 88 }))
		row++
	}

	return { nodes: [...ingredientNodes, ...stepNodes], edges }
}

/** Cria um IngredientNode posicionado. */
export function makeIngredientNode(ing: RecipeIngredientSource, position: { x: number; y: number }): FlowNode {
	return {
		id: ingredientNodeId(ing.recipeIngredientId),
		type: "ingredient",
		position,
		data: {
			recipeIngredientId: ing.recipeIngredientId,
			name: ing.name,
			measureUnit: ing.measureUnit,
			netQuantity: ing.netQuantity,
			isOptional: ing.isOptional,
		},
	}
}

/** Serializa o grafo de volta no payload de SaveRecipeFlow (só StepNodes viram etapas). */
export function graphToSave(recipeId: string, nodes: FlowNode[], edges: MaterialEdge[]): SaveRecipeFlow {
	const stepNodes = nodes.filter((n): n is StepNode => n.type === "step")

	const steps = stepNodes.map((node) => {
		const inputs = edges
			.filter((e) => e.target === node.id)
			.map((e) => {
				if (e.data?.kind === "raw") {
					return {
						recipeIngredientId: e.data.recipeIngredientId ?? null,
						sourceOutputClientId: null,
						quantity: e.data.quantity ?? null,
						measureUnit: e.data.measureUnit ?? null,
					}
				}
				return {
					recipeIngredientId: null,
					sourceOutputClientId: e.sourceHandle ?? null,
					quantity: e.data?.quantity ?? null,
					measureUnit: e.data?.measureUnit ?? null,
				}
			})

		return {
			clientId: node.id,
			stepTemplateId: node.data.stepTemplateId ?? null,
			label: node.data.label ?? null,
			description: node.data.description ?? null,
			durationMinutes: node.data.durationMinutes ?? null,
			canvasX: node.position.x,
			canvasY: node.position.y,
			utensilIds: node.data.utensils.map((u) => u.id),
			outputs: node.data.outputs.map((o) => ({
				clientId: o.clientId,
				label: o.label ?? null,
				quantity: o.quantity ?? null,
				measureUnit: o.measureUnit ?? null,
				isFinal: o.isFinal,
			})),
			inputs,
		}
	})

	return { recipeId, steps }
}

/**
 * Ordena as etapas do DAG para execução (checklist do painel de produção):
 * ordenação topológica pelas arestas de fluxo de material (saída de A → entrada
 * de B ⇒ A antes de B), estável pela ordem original nos empates. Ciclos (dados
 * inválidos) não travam: os nós restantes são anexados na ordem original.
 */
export function orderStepsForExecution(steps: FetchedStep[]): FetchedStep[] {
	const outputToStep = new Map<string, string>()
	for (const s of steps) for (const o of s.outputs) outputToStep.set(o.id, s.id)

	// Grafo produtor → consumidores + grau de entrada por etapa.
	const dependents = new Map<string, Set<string>>()
	const inDegree = new Map<string, number>(steps.map((s) => [s.id, 0]))
	for (const s of steps) {
		for (const inp of s.inputs) {
			if (inp.source_output_id == null) continue
			const producer = outputToStep.get(inp.source_output_id)
			if (producer == null || producer === s.id) continue
			const set = dependents.get(producer) ?? new Set()
			if (!set.has(s.id)) {
				set.add(s.id)
				dependents.set(producer, set)
				inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1)
			}
		}
	}

	// Kahn estável: varre na ordem original, emitindo tudo que estiver liberado.
	const ordered: FetchedStep[] = []
	const emitted = new Set<string>()
	let progressed = true
	while (progressed && ordered.length < steps.length) {
		progressed = false
		for (const s of steps) {
			if (emitted.has(s.id) || (inDegree.get(s.id) ?? 0) > 0) continue
			emitted.add(s.id)
			ordered.push(s)
			progressed = true
			for (const dep of dependents.get(s.id) ?? []) inDegree.set(dep, (inDegree.get(dep) ?? 1) - 1)
		}
	}
	// Ciclo (nunca deveria passar na validação do save): anexa o resto na ordem original.
	for (const s of steps) if (!emitted.has(s.id)) ordered.push(s)
	return ordered
}

/** Deriva o shape estrutural do grafo para as funções puras de validação do domínio. */
export function toGraphSteps(nodes: FlowNode[], edges: MaterialEdge[]): FlowGraphStep[] {
	return graphToSave("preview", nodes, edges).steps.map((s) => ({
		clientId: s.clientId,
		outputs: s.outputs.map((o) => ({ clientId: o.clientId, isFinal: o.isFinal })),
		inputs: s.inputs.map((i) => ({ recipeIngredientId: i.recipeIngredientId, sourceOutputClientId: i.sourceOutputClientId, quantity: i.quantity })),
	}))
}
