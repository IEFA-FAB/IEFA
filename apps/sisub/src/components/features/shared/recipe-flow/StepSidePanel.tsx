import { Flag, Plus, Save, Trash2, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/cn"
import type { FlowOutput, MaterialEdge, StepNode } from "@/types/domain/recipe-flow"

export interface CatalogTemplate {
	id: string
	name: string
	description: string | null
	default_duration_minutes: number | null
	utensils?: { utensil_id: string; utensil: { name: string } | null }[]
}
export interface CatalogUtensil {
	id: string
	name: string
}

interface StepSidePanelProps {
	node: StepNode
	incomingEdges: MaterialEdge[]
	sourceLabelFor: (edge: MaterialEdge) => string
	templates: CatalogTemplate[]
	utensils: CatalogUtensil[]
	onPatchStep: (patch: Partial<StepNode["data"]>) => void
	onAddOutput: () => void
	onPatchOutput: (clientId: string, patch: Partial<FlowOutput>) => void
	onRemoveOutput: (clientId: string) => void
	onSetFinalOutput: (clientId: string) => void
	onPatchEdge: (edgeId: string, quantity: number | null) => void
	onRemoveEdge: (edgeId: string) => void
	onRemoveStep: () => void
	onApplyTemplate: (template: CatalogTemplate) => void
	onSaveAsTemplate: () => void
	onToggleUtensil: (utensil: CatalogUtensil) => void
	onQuickCreateUtensil: (name: string) => void
	onClose: () => void
}

export function StepSidePanel(props: StepSidePanelProps) {
	const { node, incomingEdges, sourceLabelFor, templates, utensils } = props
	const data = node.data
	const [newUtensil, setNewUtensil] = useState("")
	const selectedUtensilIds = new Set(data.utensils.map((u) => u.id))

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<p className="text-subheading text-foreground">Etapa</p>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar painel" onClick={props.onClose}>
					<X className="size-4" />
				</Button>
			</div>

			<div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
				<Field>
					<FieldLabel htmlFor="step-label">Nome da etapa</FieldLabel>
					<FieldContent>
						<Input
							id="step-label"
							value={data.label ?? ""}
							placeholder="ex.: Refogar temperos"
							onChange={(e) => props.onPatchStep({ label: e.target.value })}
						/>
					</FieldContent>
				</Field>

				<Field>
					<FieldLabel htmlFor="step-desc">Descrição</FieldLabel>
					<FieldContent>
						<Textarea
							id="step-desc"
							className="min-h-20"
							value={data.description ?? ""}
							placeholder="Como executar esta etapa..."
							onChange={(e) => props.onPatchStep({ description: e.target.value })}
						/>
					</FieldContent>
				</Field>

				<Field orientation="horizontal">
					<FieldContent>
						<FieldLabel htmlFor="step-duration">Tempo (min)</FieldLabel>
					</FieldContent>
					<Input
						id="step-duration"
						type="number"
						min={0}
						className="w-24 shrink-0"
						value={data.durationMinutes ?? 0}
						onChange={(e) => props.onPatchStep({ durationMinutes: Number(e.target.value) || null })}
					/>
				</Field>

				{/* Saídas / produtos intermediários */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-label uppercase text-muted-foreground">Saídas</span>
						<Button type="button" variant="ghost" size="sm" onClick={props.onAddOutput}>
							<Plus className="size-3.5 mr-1" /> Saída
						</Button>
					</div>
					{data.outputs.length === 0 && (
						<p className="text-caption text-muted-foreground">Sem saídas. Adicione ao menos uma (a etapa final marca a preparação).</p>
					)}
					{data.outputs.map((o) => (
						<div key={o.clientId} className="rounded-md border border-border p-2 space-y-2">
							<div className="flex items-center gap-1.5">
								<Input
									value={o.label ?? ""}
									placeholder="ex.: arroz lavado"
									className="flex-1"
									onChange={(e) => props.onPatchOutput(o.clientId, { label: e.target.value })}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Remover saída"
									className="text-muted-foreground hover:text-destructive"
									onClick={() => props.onRemoveOutput(o.clientId)}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
							<div className="flex items-center gap-1.5">
								<Input
									type="number"
									step="0.001"
									className="w-24"
									aria-label="Quantidade da saída"
									value={o.quantity ?? 0}
									onChange={(e) => props.onPatchOutput(o.clientId, { quantity: Number(e.target.value) || null })}
								/>
								<Input
									value={o.measureUnit ?? ""}
									placeholder="un"
									className="w-16"
									aria-label="Unidade da saída"
									onChange={(e) => props.onPatchOutput(o.clientId, { measureUnit: e.target.value })}
								/>
								<Toggle variant="outline" size="sm" pressed={o.isFinal} onPressedChange={() => props.onSetFinalOutput(o.clientId)} className="ml-auto">
									<Flag className={cn("size-3.5", o.isFinal && "text-success")} /> Final
								</Toggle>
							</div>
						</div>
					))}
				</div>

				{/* Inputs / insumos consumidos */}
				<div className="space-y-2">
					<span className="text-label uppercase text-muted-foreground">Entradas</span>
					{incomingEdges.length === 0 && <p className="text-caption text-muted-foreground">Arraste de um insumo ou de uma saída até esta etapa.</p>}
					{incomingEdges.map((e) => (
						<div key={e.id} className="flex items-center gap-1.5">
							<span className="flex-1 truncate text-caption text-foreground">{sourceLabelFor(e)}</span>
							<Input
								type="number"
								step="0.001"
								className="w-24"
								aria-label="Quantidade consumida"
								value={e.data?.quantity ?? 0}
								onChange={(ev) => props.onPatchEdge(e.id, Number(ev.target.value) || null)}
							/>
							<span className="w-8 text-caption text-muted-foreground">{e.data?.measureUnit ?? ""}</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Remover entrada"
								className="text-muted-foreground hover:text-destructive"
								onClick={() => props.onRemoveEdge(e.id)}
							>
								<Trash2 className="size-3.5" />
							</Button>
						</div>
					))}
				</div>

				{/* Utensílios */}
				<div className="space-y-2">
					<span className="text-label uppercase text-muted-foreground">Utensílios</span>
					<div className="flex flex-wrap gap-1.5">
						{utensils.map((u) => (
							<Toggle key={u.id} variant="outline" size="sm" pressed={selectedUtensilIds.has(u.id)} onPressedChange={() => props.onToggleUtensil(u)}>
								{u.name}
							</Toggle>
						))}
					</div>
					<div className="flex items-center gap-1.5">
						<Input value={newUtensil} placeholder="Novo utensílio" onChange={(e) => setNewUtensil(e.target.value)} />
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!newUtensil.trim()}
							onClick={() => {
								props.onQuickCreateUtensil(newUtensil.trim())
								setNewUtensil("")
							}}
						>
							<Plus className="size-3.5" />
						</Button>
					</div>
				</div>

				{/* Catálogo de etapas reutilizáveis */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-label uppercase text-muted-foreground">Catálogo de etapas</span>
						<Button type="button" variant="ghost" size="sm" onClick={props.onSaveAsTemplate}>
							<Save className="size-3.5 mr-1" /> Salvar
						</Button>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{templates.length === 0 && <p className="text-caption text-muted-foreground">Nenhuma etapa no catálogo ainda.</p>}
						{templates.map((t) => (
							<Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => props.onApplyTemplate(t)}>
								{t.name}
							</Badge>
						))}
					</div>
				</div>
			</div>

			<div className="border-t border-border px-4 py-3">
				<Button type="button" variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={props.onRemoveStep}>
					<Trash2 className="size-3.5 mr-2" /> Remover etapa
				</Button>
			</div>
		</div>
	)
}
