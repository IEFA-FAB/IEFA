/**
 * Lista MÍNIMA de equipamentos de uma preparação + o atendimento na cozinha dona.
 *
 * A exigência fala por PAPEL ("1 forno combinado" — serve qualquer modelo que o assuma) ou por
 * MODELO ("1 Rational iVario Pro L"), nunca pelos dois. Papel é o default deliberado: preparação
 * amarrada a modelo só é executável por quem tem aquele equipamento, e o catálogo é da FAB
 * inteira.
 *
 * Salva SEPARADAMENTE da preparação (mesmo contrato do fluxo de produção): a lista pertence à
 * versão aberta e é copiada adiante quando uma versão nova nasce.
 */

import type { EquipmentModelWire, RecipeEquipmentRequirementWire, SaveRecipeEquipment } from "@iefa/sisub-domain"
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useEquipmentModels, useEquipmentRoles, useRecipeEquipment, useRecipeEquipmentFitness, useSaveRecipeEquipment } from "@/hooks/data/useEquipment"

type CapacityUnit = "L" | "GN"

/** Linha em edição. `recipeStepId` viaja intacto: a UI ainda não amarra exigência a etapa. */
type RequirementRow = {
	key: string
	target: "role" | "model"
	roleId: string | null
	modelId: string | null
	quantity: number
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
	const { data: requirements, isLoading } = useRecipeEquipment(recipeId)
	const { data: roles = [] } = useEquipmentRoles()
	const { data: models = [] } = useEquipmentModels(kitchenId)
	const fitness = useRecipeEquipmentFitness(recipeId, kitchenId)
	const save = useSaveRecipeEquipment(recipeId)

	const [rows, setRows] = useState<RequirementRow[]>([])
	const [dirty, setDirty] = useState(false)

	// Só sincroniza do servidor enquanto o usuário não mexeu — recarregar por cima de edição
	// aberta apagaria o trabalho dele sem aviso.
	useEffect(() => {
		if (!dirty && requirements) setRows(requirements.map(toRow))
	}, [requirements, dirty])

	const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
	const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

	const update = (key: string, patch: Partial<RequirementRow>) => {
		setDirty(true)
		setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
	}

	const addRow = () => {
		setDirty(true)
		setRows((current) => [
			...current,
			{
				key: `${rowIdPrefix}-${current.length}-${current.reduce((acc, r) => acc + r.quantity, 0)}`,
				target: "role",
				roleId: roles[0]?.id ?? null,
				modelId: null,
				quantity: 1,
				capacityValue: null,
				capacityUnit: "L",
				notes: null,
				recipeStepId: null,
			},
		])
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
				<p className="text-caption text-muted-foreground">
					Equipamentos necessários para executar esta preparação. Salvos separadamente e copiados para a próxima versão.
				</p>
				<div className="flex gap-2">
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

								<Input
									className="mt-2"
									placeholder="Observação (ex.: cocção sob pressão por 25 min)"
									value={row.notes ?? ""}
									onChange={(e) => update(row.key, { notes: e.target.value === "" ? null : e.target.value })}
								/>
							</li>
						)
					})}
				</ul>
			)}

			{kitchenId != null && fitness.data && !fitness.data.unspecified ? (
				<Alert>
					{fitness.data.satisfied ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
					<AlertTitle>{fitness.data.satisfied ? "Esta cozinha está equipada" : "Faltam equipamentos nesta cozinha"}</AlertTitle>
					<AlertDescription>
						<ul className="space-y-1">
							{fitness.data.requirements.map((req) => (
								<li key={req.requirement_id} className="flex items-center gap-2">
									<Badge variant={req.missing > 0 ? "destructive" : "secondary"}>
										{req.satisfied}/{req.required}
									</Badge>
									<span>{req.target_label}</span>
									{req.assigned_unit_labels.length > 0 ? <span className="text-muted-foreground">· {req.assigned_unit_labels.join(", ")}</span> : null}
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	)
}
