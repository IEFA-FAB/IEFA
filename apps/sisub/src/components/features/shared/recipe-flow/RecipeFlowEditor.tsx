/**
 * Editor do Fluxo de Produção (DAG do modo de preparo).
 *
 * Controller xyflow: carrega o grafo persistido (useRecipeFlow), edita nós/edges
 * localmente, valida conexões (sem ciclo) e persiste inteiro (saveRecipeFlow).
 * Insumos crus entram pela palette; saídas de etapa ligam etapa→etapa.
 */

import { type Connection, type EdgeChange, type Node, type NodeChange, ReactFlowProvider, useEdgesState, useNodesState } from "@xyflow/react"
import { Loader2, Plus, Save } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useCreateStepTemplate, useCreateUtensil, useRecipeFlow, useSaveRecipeFlow, useStepTemplates, useUtensils } from "@/hooks/data/useRecipeFlow"
import { type FetchedStep, flowToGraph, graphToSave, makeIngredientNode } from "@/lib/recipe-flow/transform"
import { isValidRecipeFlowConnection } from "@/lib/recipe-flow/validate"
import {
	type FlowNode,
	type FlowOutput,
	INGREDIENT_NODE_PREFIX,
	type MaterialEdge,
	type RecipeIngredientSource,
	STEP_TARGET_HANDLE,
	type StepNode,
} from "@/types/domain/recipe-flow"
import { IngredientPalette } from "./IngredientPalette"
import { MaterialBalanceIndicator } from "./MaterialBalanceIndicator"
import { RecipeFlowCanvas } from "./RecipeFlowCanvas"
import { type CatalogTemplate, type CatalogUtensil, StepSidePanel } from "./StepSidePanel"

interface RecipeFlowEditorProps {
	recipeId: string
	kitchenId: number | null
	ingredients: RecipeIngredientSource[]
}

function RecipeFlowEditorInner({ recipeId, kitchenId, ingredients }: RecipeFlowEditorProps) {
	const flowQuery = useRecipeFlow(recipeId)
	const saveMutation = useSaveRecipeFlow(recipeId)
	const templatesQuery = useStepTemplates(kitchenId)
	const utensilsQuery = useUtensils(kitchenId)
	const createUtensil = useCreateUtensil()
	const createTemplate = useCreateStepTemplate()

	const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
	const [edges, setEdges, onEdgesChange] = useEdgesState<MaterialEdge>([])
	const [selectedStepId, setSelectedStepId] = useState<string | null>(null)

	// Reseta o grafo a partir do estado persistido sempre que o fetch muda (carga inicial + pós-save).
	const flowData = flowQuery.data
	useEffect(() => {
		if (!flowData) return
		const { nodes: n, edges: e } = flowToGraph(flowData.steps as unknown as FetchedStep[], ingredients)
		setNodes(n)
		setEdges(e)
		setSelectedStepId(null)
	}, [flowData, ingredients, setNodes, setEdges])

	const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.recipeIngredientId, i])), [ingredients])
	const presentIngredientIds = useMemo(() => {
		const ids = new Set<string>()
		for (const n of nodes) if (n.type === "ingredient") ids.add((n.data as { recipeIngredientId: string }).recipeIngredientId)
		return ids
	}, [nodes])

	const selectedNode = useMemo(() => nodes.find((n): n is StepNode => n.type === "step" && n.id === selectedStepId) ?? null, [nodes, selectedStepId])
	const incomingEdges = useMemo(() => (selectedStepId ? edges.filter((e) => e.target === selectedStepId) : []), [edges, selectedStepId])

	// ── Mutadores de estado ──
	const patchStepData = useCallback(
		(nodeId: string, patch: Partial<StepNode["data"]>) => {
			setNodes((ns) => ns.map((n) => (n.id === nodeId && n.type === "step" ? { ...n, data: { ...n.data, ...patch } } : n)))
		},
		[setNodes]
	)

	const patchOutputs = useCallback(
		(nodeId: string, fn: (outputs: FlowOutput[]) => FlowOutput[]) => {
			setNodes((ns) => ns.map((n) => (n.id === nodeId && n.type === "step" ? { ...n, data: { ...n.data, outputs: fn(n.data.outputs) } } : n)))
		},
		[setNodes]
	)

	const handleAddStep = useCallback(() => {
		const id = crypto.randomUUID()
		const outputId = crypto.randomUUID()
		const node: StepNode = {
			id,
			type: "step",
			position: { x: 320, y: 40 + nodes.filter((n) => n.type === "step").length * 60 },
			data: {
				label: "Nova etapa",
				description: null,
				durationMinutes: null,
				stepTemplateId: null,
				utensils: [],
				outputs: [{ clientId: outputId, label: "resultado", quantity: null, measureUnit: null, isFinal: false }],
			},
		}
		setNodes((ns) => [...ns, node])
		setSelectedStepId(id)
	}, [nodes, setNodes])

	const handleConnect = useCallback(
		(conn: Connection) => {
			if (!conn.source || !conn.target) return
			const isRaw = conn.source.startsWith(INGREDIENT_NODE_PREFIX)
			const recipeIngredientId = isRaw ? conn.source.slice(INGREDIENT_NODE_PREFIX.length) : undefined
			const measureUnit = isRaw ? (ingredientById.get(recipeIngredientId as string)?.measureUnit ?? null) : null
			const edge: MaterialEdge = {
				id: `e-${conn.source}-${conn.sourceHandle ?? ""}-${conn.target}-${crypto.randomUUID().slice(0, 8)}`,
				source: conn.source,
				target: conn.target,
				sourceHandle: conn.sourceHandle ?? null,
				targetHandle: conn.targetHandle ?? STEP_TARGET_HANDLE,
				type: "material",
				data: isRaw ? { kind: "raw", quantity: null, measureUnit, recipeIngredientId } : { kind: "intermediate", quantity: null, measureUnit: null },
			}
			setEdges((es) => [...es, edge])
		},
		[ingredientById, setEdges]
	)

	const handleAddIngredient = useCallback(
		(ing: RecipeIngredientSource) => {
			if (presentIngredientIds.has(ing.recipeIngredientId)) return
			const node = makeIngredientNode(ing, { x: 0, y: 40 + presentIngredientIds.size * 88 })
			setNodes((ns) => [...ns, node])
		},
		[presentIngredientIds, setNodes]
	)

	const sourceLabelFor = useCallback(
		(edge: MaterialEdge): string => {
			if (edge.data?.kind === "raw") return ingredientById.get(edge.data.recipeIngredientId ?? "")?.name ?? "Insumo"
			// intermediate: acha a saída produtora pelo sourceHandle
			for (const n of nodes) {
				if (n.type !== "step") continue
				const out = n.data.outputs.find((o) => o.clientId === edge.sourceHandle)
				if (out) return `${n.data.label || "Etapa"} → ${out.label || "saída"}`
			}
			return "Saída de etapa"
		},
		[nodes, ingredientById]
	)

	const handleToggleUtensil = useCallback(
		(nodeId: string, utensil: CatalogUtensil) => {
			setNodes((ns) =>
				ns.map((n) => {
					if (n.id !== nodeId || n.type !== "step") return n
					const has = n.data.utensils.some((u) => u.id === utensil.id)
					const utensils = has ? n.data.utensils.filter((u) => u.id !== utensil.id) : [...n.data.utensils, { id: utensil.id, name: utensil.name }]
					return { ...n, data: { ...n.data, utensils } }
				})
			)
		},
		[setNodes]
	)

	const handleQuickCreateUtensil = useCallback(
		async (nodeId: string, name: string) => {
			const created = await createUtensil.mutateAsync({ name, kitchenId })
			setNodes((ns) =>
				ns.map((n) =>
					n.id === nodeId && n.type === "step" ? { ...n, data: { ...n.data, utensils: [...n.data.utensils, { id: created.id, name: created.name }] } } : n
				)
			)
		},
		[createUtensil, kitchenId, setNodes]
	)

	const handleApplyTemplate = useCallback(
		(nodeId: string, template: CatalogTemplate) => {
			const templateUtensils = (template.utensils ?? []).map((u) => ({ id: u.utensil_id, name: u.utensil?.name ?? "Utensílio" }))
			setNodes((ns) =>
				ns.map((n) => {
					if (n.id !== nodeId || n.type !== "step") return n
					const mergedUtensils = [...n.data.utensils]
					for (const u of templateUtensils) if (!mergedUtensils.some((x) => x.id === u.id)) mergedUtensils.push(u)
					return {
						...n,
						data: {
							...n.data,
							label: template.name,
							description: template.description ?? n.data.description,
							durationMinutes: template.default_duration_minutes ?? n.data.durationMinutes,
							stepTemplateId: template.id,
							utensils: mergedUtensils,
						},
					}
				})
			)
		},
		[setNodes]
	)

	const handleSaveAsTemplate = useCallback(
		(node: StepNode) => {
			createTemplate.mutate({
				name: node.data.label || "Etapa",
				description: node.data.description,
				defaultDurationMinutes: node.data.durationMinutes,
				kitchenId,
				utensilIds: node.data.utensils.map((u) => u.id),
			})
		},
		[createTemplate, kitchenId]
	)

	const handleSave = useCallback(() => {
		saveMutation.mutate(graphToSave(recipeId, nodes, edges))
	}, [saveMutation, recipeId, nodes, edges])

	const validateConnection = useCallback((conn: Connection) => isValidRecipeFlowConnection(conn, nodes, edges), [nodes, edges])

	if (flowQuery.isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<Spinner />
			</div>
		)
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button type="button" variant="outline" size="sm" onClick={handleAddStep}>
					<Plus className="size-4 mr-2" /> Adicionar etapa
				</Button>
				<Button type="button" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
					{saveMutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
					Salvar fluxo
				</Button>
			</div>

			<div className="flex flex-col gap-3 lg:flex-row">
				<div className="w-full space-y-4 lg:w-64 lg:shrink-0">
					<IngredientPalette ingredients={ingredients} presentIds={presentIngredientIds} onAdd={handleAddIngredient} />
					<div className="border-t border-border/60 pt-3">
						<MaterialBalanceIndicator nodes={nodes} edges={edges} ingredients={ingredients} />
					</div>
				</div>

				<div className="h-[560px] flex-1">
					<RecipeFlowCanvas
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange as (changes: NodeChange<FlowNode>[]) => void}
						onEdgesChange={onEdgesChange as (changes: EdgeChange<MaterialEdge>[]) => void}
						onConnect={handleConnect}
						onNodeClick={(_e: React.MouseEvent, node: Node) => setSelectedStepId(node.type === "step" ? node.id : null)}
						onEdgeClick={() => {}}
						onPaneClick={() => setSelectedStepId(null)}
						isValidConnection={validateConnection}
					/>
				</div>

				{selectedNode && (
					<div className="w-full rounded-md border border-border bg-card lg:w-80 lg:shrink-0">
						<StepSidePanel
							node={selectedNode}
							incomingEdges={incomingEdges}
							sourceLabelFor={sourceLabelFor}
							templates={(templatesQuery.data ?? []) as unknown as CatalogTemplate[]}
							utensils={(utensilsQuery.data ?? []) as unknown as CatalogUtensil[]}
							onPatchStep={(patch) => patchStepData(selectedNode.id, patch)}
							onAddOutput={() =>
								patchOutputs(selectedNode.id, (outs) => [
									...outs,
									{ clientId: crypto.randomUUID(), label: "saída", quantity: null, measureUnit: null, isFinal: false },
								])
							}
							onPatchOutput={(clientId, patch) => patchOutputs(selectedNode.id, (outs) => outs.map((o) => (o.clientId === clientId ? { ...o, ...patch } : o)))}
							onRemoveOutput={(clientId) => {
								patchOutputs(selectedNode.id, (outs) => outs.filter((o) => o.clientId !== clientId))
								setEdges((es) => es.filter((e) => e.sourceHandle !== clientId))
							}}
							onSetFinalOutput={(clientId) => {
								// exatamente 1 final no grafo inteiro
								setNodes((ns) =>
									ns.map((n) =>
										n.type === "step" ? { ...n, data: { ...n.data, outputs: n.data.outputs.map((o) => ({ ...o, isFinal: o.clientId === clientId })) } } : n
									)
								)
							}}
							onPatchEdge={(edgeId, quantity) => setEdges((es) => es.map((e) => (e.id === edgeId && e.data ? { ...e, data: { ...e.data, quantity } } : e)))}
							onRemoveEdge={(edgeId) => setEdges((es) => es.filter((e) => e.id !== edgeId))}
							onRemoveStep={() => {
								const id = selectedNode.id
								setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
								setNodes((ns) => ns.filter((n) => n.id !== id))
								setSelectedStepId(null)
							}}
							onApplyTemplate={(t) => handleApplyTemplate(selectedNode.id, t)}
							onSaveAsTemplate={() => handleSaveAsTemplate(selectedNode)}
							onToggleUtensil={(u) => handleToggleUtensil(selectedNode.id, u)}
							onQuickCreateUtensil={(name) => handleQuickCreateUtensil(selectedNode.id, name)}
							onClose={() => setSelectedStepId(null)}
						/>
					</div>
				)}
			</div>
		</div>
	)
}

export function RecipeFlowEditor(props: RecipeFlowEditorProps) {
	return (
		<ReactFlowProvider>
			<RecipeFlowEditorInner {...props} />
		</ReactFlowProvider>
	)
}
