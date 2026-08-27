/**
 * Lista MÍNIMA de equipamentos de uma preparação + o atendimento na cozinha dona.
 *
 * A exigência fala por PAPEL ("1 forno combinado" — serve qualquer modelo que o assuma) ou por
 * MODELO ("1 Rational iVario Pro L"), nunca pelos dois. Papel é o default deliberado: preparação
 * amarrada a modelo só é executável por quem tem aquele equipamento, e o catálogo é da FAB
 * inteira.
 *
 * A lista descreve UMA BATELADA (o rendimento da receita). Volume não vira mais equipamento:
 * 900 porções de uma preparação que rende 100 são nove ciclos do mesmo forno. Por isso o painel
 * separa as duas perguntas — "a cozinha tem?" e "cabe, em quantas rodadas?".
 *
 * Salva SEPARADAMENTE da preparação (mesmo contrato do fluxo de produção): a lista pertence à
 * versão aberta e é copiada adiante quando uma versão nova nasce.
 */

import type { EquipmentModelWire, EquipmentScaling, RecipeEquipmentRequirementWire, SaveRecipeEquipment } from "@iefa/sisub-domain"
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Trash2, Workflow } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
	useEquipmentModels,
	useEquipmentRoles,
	useRecipeEquipment,
	useRecipeEquipmentFitness,
	useRecipeEquipmentSuggestions,
	useSaveRecipeEquipment,
} from "@/hooks/data/useEquipment"

type CapacityUnit = "L" | "GN"

/** Linha em edição. `recipeStepId` viaja intacto: a UI ainda não amarra exigência a etapa. */
type RequirementRow = {
	key: string
	target: "role" | "model"
	roleId: string | null
	modelId: string | null
	quantity: number
	scaling: EquipmentScaling
	batchPortions: number | null
	capacityValue: number | null
	capacityUnit: CapacityUnit
	notes: string | null
	recipeStepId: string | null
}

function toRow(req: RecipeEquipmentRequirementWire): RequirementRow {
	const hasGn = req.min_capacity_gn != null
	return {
		key: req.id,
		target: req.model_id != null ? "model" : "role",
		roleId: req.role_id,
		modelId: req.model_id,
		quantity: req.quantity,
		scaling: req.scaling as EquipmentScaling,
		batchPortions: req.batch_portions,
		capacityValue: hasGn ? req.min_capacity_gn : req.min_capacity_liters,
		capacityUnit: hasGn ? "GN" : "L",
		notes: req.notes,
		recipeStepId: req.recipe_step_id,
	}
}

function modelLabel(model: EquipmentModelWire): string {
	const base = [model.manufacturer, model.name].filter(Boolean).join(" ")
	return model.capacity_label ? `${base} · ${model.capacity_label}` : base
}

export function RecipeEquipmentPanel({ recipeId, kitchenId }: { recipeId: string; kitchenId: number | null }) {
	const rowIdPrefix = useId()
	const rowCounter = useRef(0)
	const { data: requirements, isLoading } = useRecipeEquipment(recipeId)
	const { data: roles = [] } = useEquipmentRoles()
	const { data: models = [] } = useEquipmentModels(kitchenId)
	const { data: suggestions = [] } = useRecipeEquipmentSuggestions(recipeId)
	const save = useSaveRecipeEquipment(recipeId)

	const [rows, setRows] = useState<RequirementRow[]>([])
	const [dirty, setDirty] = useState(false)
	/** Volume simulado. Vazio = só a pergunta funcional ("a cozinha tem o equipamento?"). */
	const [portionsInput, setPortionsInput] = useState("")
	const portions = portionsInput.trim() === "" ? null : Math.max(1, Number(portionsInput))
	const fitness = useRecipeEquipmentFitness(recipeId, kitchenId, portions)

	// Só sincroniza do servidor enquanto o usuário não mexeu — recarregar por cima de edição
	// aberta apagaria o trabalho dele sem aviso.
	useEffect(() => {
		if (!dirty && requirements) setRows(requirements.map(toRow))
	}, [requirements, dirty])

	const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
	// Rótulo da etapa vem das sugestões do fluxo — a única fonte que a aba já carrega. Etapa
	// sem sugestão cai no rótulo genérico: melhor "Etapa do fluxo" do que um uuid na tela.
	const stepLabelById = useMemo(() => new Map(suggestions.map((s) => [s.recipe_step_id, s.step_label ?? s.utensil_name])), [suggestions])
	const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

	const update = (key: string, patch: Partial<RequirementRow>) => {
		setDirty(true)
		setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
	}

	// Chave de linha por CONTADOR, nunca por índice: adicionar, adicionar, remover, adicionar
	// devolveria a mesma chave de uma linha viva, e a edição passaria a atingir duas de uma vez.
	const nextKey = () => {
		rowCounter.current += 1
		return `${rowIdPrefix}-${rowCounter.current}`
	}

	const blankRow = (seed: Partial<RequirementRow> = {}): RequirementRow => ({
		key: nextKey(),
		target: "role",
		roleId: roles[0]?.id ?? null,
		modelId: null,
		quantity: 1,
		scaling: "per_batch",
		batchPortions: null,
		capacityValue: null,
		capacityUnit: "L",
		notes: null,
		recipeStepId: null,
		...seed,
	})

	const addRow = () => {
		setDirty(true)
		setRows((current) => [...current, blankRow()])
	}

	/** Importa as sugestões do fluxo: etapas que usam utensílio já mapeado a um papel. */
	const importFromFlow = () => {
		setDirty(true)
		setRows((current) => {
			const taken = new Set(current.map((r) => `${r.recipeStepId ?? ""}|${r.roleId ?? r.modelId}`))
			const fresh = suggestions
				.filter((s) => !taken.has(`${s.recipe_step_id}|${s.role_id}`))
				.map((s) =>
					blankRow({
						roleId: s.role_id,
						recipeStepId: s.recipe_step_id,
						notes: `Etapa: ${s.step_label ?? s.utensil_name}`,
					})
				)
			return [...current, ...fresh]
		})
	}

	const removeRow = (key: string) => {
		setDirty(true)
		setRows((current) => current.filter((row) => row.key !== key))
	}

	const incomplete = rows.some((row) => (row.target === "role" ? row.roleId == null : row.modelId == null))

	const handleSave = () => {
		const payload: SaveRecipeEquipment = {
			recipeId,
			requirements: rows.map((row) => ({
				recipeStepId: row.recipeStepId,
				roleId: row.target === "role" ? row.roleId : null,
				modelId: row.target === "model" ? row.modelId : null,
				quantity: row.quantity,
				scaling: row.scaling,
				batchPortions: row.scaling === "fixed" ? null : row.batchPortions,
				minCapacityLiters: row.capacityUnit === "L" ? row.capacityValue : null,
				minCapacityGn: row.capacityUnit === "GN" ? (row.capacityValue != null ? Math.trunc(row.capacityValue) : null) : null,
				notes: row.notes,
			})),
		}
		save.mutate(payload, { onSuccess: () => setDirty(false) })
	}

	if (isLoading) return <Skeleton className="h-40 w-full" />

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-caption text-muted-foreground">O que uma BATELADA desta preparação exige. Salvo separadamente e copiado para a próxima versão.</p>
				<div className="flex gap-2">
					{suggestions.length > 0 ? (
						<Button type="button" variant="outline" size="sm" onClick={importFromFlow}>
							<Workflow className="size-4 mr-2" />
							Importar do fluxo ({suggestions.length})
						</Button>
					) : null}
					<Button type="button" variant="outline" size="sm" onClick={addRow}>
						<Plus className="size-4 mr-2" />
						Adicionar
					</Button>
					<Button type="button" size="sm" onClick={handleSave} disabled={save.isPending || incomplete || !dirty}>
						{save.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
						Salvar equipamentos
					</Button>
				</div>
			</div>

			{rows.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Nenhum equipamento declarado</EmptyTitle>
						<EmptyDescription>Sem lista mínima, o sistema não consegue dizer se uma cozinha está equipada para produzir esta preparação.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="space-y-2">
					{rows.map((row) => {
						const selectedRole = row.roleId ? roleById.get(row.roleId) : undefined
						const selectedModel = row.modelId ? modelById.get(row.modelId) : undefined
						return (
							<li key={row.key} className="rounded-lg border border-border p-3">
								<div className="flex flex-wrap items-end gap-2">
									<div className="w-28">
										<span className="text-caption text-muted-foreground">Exigir por</span>
										<Select
											value={row.target}
											onValueChange={(value) => update(row.key, { target: value as RequirementRow["target"], roleId: null, modelId: null })}
										>
											<SelectTrigger className="w-full">
												<SelectValue>{row.target === "role" ? "Tipo" : "Modelo"}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="role">Tipo</SelectItem>
												<SelectItem value="model">Modelo</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="min-w-56 flex-1">
										<span className="text-caption text-muted-foreground">{row.target === "role" ? "Tipo de equipamento" : "Modelo específico"}</span>
										{row.target === "role" ? (
											<Select value={row.roleId} onValueChange={(value) => update(row.key, { roleId: value as string })}>
												<SelectTrigger className="w-full">
													<SelectValue>{selectedRole?.name ?? "Selecione o tipo"}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													{roles.map((role) => (
														<SelectItem key={role.id} value={role.id}>
															{role.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										) : (
											<Select value={row.modelId} onValueChange={(value) => update(row.key, { modelId: value as string })}>
												<SelectTrigger className="w-full">
													<SelectValue>{selectedModel ? modelLabel(selectedModel) : "Selecione o modelo"}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													{models.map((model) => (
														<SelectItem key={model.id} value={model.id}>
															{modelLabel(model)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</div>

									<div className="w-20">
										<span className="text-caption text-muted-foreground">Qtd.</span>
										<Input
											type="number"
											min={1}
											max={99}
											value={row.quantity}
											onChange={(e) => update(row.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
										/>
									</div>

									<div className="w-28">
										<span className="text-caption text-muted-foreground">Capac. mín.</span>
										<Input
											type="number"
											min={1}
											placeholder="opcional"
											value={row.capacityValue ?? ""}
											onChange={(e) => update(row.key, { capacityValue: e.target.value === "" ? null : Number(e.target.value) })}
										/>
									</div>

									<div className="w-20">
										<span className="text-caption text-muted-foreground">Unid.</span>
										<Select value={row.capacityUnit} onValueChange={(value) => update(row.key, { capacityUnit: value as CapacityUnit })}>
											<SelectTrigger className="w-full">
												<SelectValue>{row.capacityUnit}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="L">L</SelectItem>
												<SelectItem value="GN">GN</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label="Remover exigência">
										<Trash2 className="size-4" />
									</Button>
								</div>

								<div className="mt-2 flex flex-wrap items-end gap-2">
									{/* O vínculo com a etapa decide concorrência (etapas em níveis diferentes do DAG
									    não competem), então precisa ser visível — e desfazível sem apagar a linha. */}
									{row.recipeStepId != null ? (
										<Badge variant="secondary" className="mb-1">
											{stepLabelById.get(row.recipeStepId) ?? "Etapa do fluxo"}
											<button type="button" className="ml-1 underline" onClick={() => update(row.key, { recipeStepId: null })} aria-label="Desamarrar da etapa">
												desamarrar
											</button>
										</Badge>
									) : null}
									<div className="w-40">
										<span className="text-caption text-muted-foreground">Escala</span>
										<Select value={row.scaling} onValueChange={(value) => update(row.key, { scaling: value as EquipmentScaling })}>
											<SelectTrigger className="w-full">
												<SelectValue>{row.scaling === "fixed" ? "Fixo na leva" : "Por batelada"}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="per_batch">Por batelada</SelectItem>
												<SelectItem value="fixed">Fixo na leva</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{row.scaling === "per_batch" ? (
										<div className="w-32">
											<span className="text-caption text-muted-foreground">Porções/batelada</span>
											<Input
												type="number"
												min={1}
												placeholder="rendimento"
												value={row.batchPortions ?? ""}
												onChange={(e) => update(row.key, { batchPortions: e.target.value === "" ? null : Number(e.target.value) })}
											/>
										</div>
									) : null}

									<Input
										className="min-w-56 flex-1"
										placeholder="Observação (ex.: cocção sob pressão por 25 min)"
										value={row.notes ?? ""}
										onChange={(e) => update(row.key, { notes: e.target.value === "" ? null : e.target.value })}
									/>
								</div>
							</li>
						)
					})}
				</ul>
			)}

			{kitchenId != null && fitness.data && !fitness.data.unspecified ? (
				<Alert>
					{fitness.data.satisfied ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
					<AlertTitle>
						{fitness.data.units_considered === 0
							? "Esta cozinha ainda não cadastrou equipamentos"
							: fitness.data.satisfied
								? "Esta cozinha está equipada"
								: "Faltam equipamentos nesta cozinha"}
					</AlertTitle>
					<AlertDescription className="space-y-3">
						{/* Parque vazio não é parque insuficiente: acusar falta de forno para quem nunca
						    cadastrou nada é acusar toda a FAB no dia em que o recurso nasce. */}
						{fitness.data.units_considered === 0 ? (
							<p>
								A verificação compara esta lista com o parque instalado, e ele está vazio. Cadastre os equipamentos em Gestão Cozinha → Equipamentos para que a
								conferência passe a valer.
							</p>
						) : null}
						<ul className="space-y-1">
							{fitness.data.requirements.map((req) => (
								<li key={req.requirement_id} className="flex flex-wrap items-center gap-2">
									<Badge variant={req.missing > 0 ? "destructive" : "secondary"}>
										{req.satisfied}/{req.required}
									</Badge>
									<span>{req.target_label}</span>
									{req.sequential_reuse ? (
										<span className="text-muted-foreground">· etapa posterior, reaproveita o mesmo equipamento</span>
									) : req.assigned_unit_labels.length > 0 ? (
										<span className="text-muted-foreground">· {req.assigned_unit_labels.join(", ")}</span>
									) : null}
								</li>
							))}
						</ul>

						{/* Volume é a OUTRA pergunta: ter o equipamento não diz se a produção cabe na janela. */}
						<div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
							<div className="w-36">
								<span className="text-caption text-muted-foreground">Produzir quantas porções?</span>
								<Input
									type="number"
									min={1}
									placeholder={fitness.data.batch_portions != null ? String(fitness.data.batch_portions) : "porções"}
									value={portionsInput}
									onChange={(e) => setPortionsInput(e.target.value)}
								/>
							</div>
							{portions != null && fitness.data.cycles != null ? (
								<p className="text-caption text-muted-foreground">
									{fitness.data.batches} batelada{fitness.data.batches === 1 ? "" : "s"} de {fitness.data.batch_portions ?? "?"} porções ·{" "}
									{fitness.data.max_parallel_batches} por vez ·{" "}
									<strong>
										{fitness.data.cycles} rodada{fitness.data.cycles === 1 ? "" : "s"}
									</strong>
									{fitness.data.cycle_minutes != null ? ` · ~${fitness.data.cycles * fitness.data.cycle_minutes} min de equipamento` : ""}
								</p>
							) : portions != null ? (
								<p className="text-caption text-destructive">O parque não roda nem uma batelada — falta equipamento, não tempo.</p>
							) : (
								<p className="text-caption text-muted-foreground">Informe o volume para ver bateladas e rodadas.</p>
							)}
						</div>
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	)
}
