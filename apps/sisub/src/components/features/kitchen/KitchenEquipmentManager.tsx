/**
 * Parque de equipamentos de UMA cozinha: uma linha por equipamento físico.
 *
 * O que a tela precisa deixar explícito, porque é o que o cálculo de atendimento usa:
 *   - os PAPÉIS que o equipamento assume (vêm do modelo; a unidade pode habilitar ou
 *     desabilitar um deles — acessório comprado à parte, cuba interditada);
 *   - as ZONAS INDEPENDENTES (cubas, bocas, câmaras): quantas exigências ele atende ao mesmo
 *     tempo. Um iVario Pro 2-S sabe ser chapa, pressão e fritadeira, mas só duas de cada vez.
 */

import type { EquipmentModelWire, EquipmentUnitWire } from "@iefa/sisub-domain"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Toggle } from "@/components/ui/toggle"
import {
	useCreateEquipmentUnit,
	useDeleteEquipmentUnit,
	useEquipmentModels,
	useEquipmentRoles,
	useKitchenEquipment,
	useUpdateEquipmentUnit,
} from "@/hooks/data/useEquipment"

const STATUS_LABEL: Record<string, string> = {
	active: "Ativo",
	maintenance: "Em manutenção",
	decommissioned: "Baixado",
}

function modelLabel(model: EquipmentModelWire | null | undefined): string {
	if (!model) return "—"
	const base = [model.manufacturer, model.name].filter(Boolean).join(" ")
	return model.capacity_label ? `${base} · ${model.capacity_label}` : base
}

type UnitFormState = {
	modelId: string | null
	label: string
	assetTag: string
	status: "active" | "maintenance" | "decommissioned"
	slots: string
	/** Papéis desligados nesta unidade (viram override `available: false`). */
	disabledRoleIds: Set<string>
	/** Papéis ligados além do modelo (override `available: true`). */
	extraRoleIds: Set<string>
}

const emptyForm = (): UnitFormState => ({
	modelId: null,
	label: "",
	assetTag: "",
	status: "active",
	slots: "",
	disabledRoleIds: new Set(),
	extraRoleIds: new Set(),
})

export function KitchenEquipmentManager({ kitchenId }: { kitchenId: number }) {
	const { data: units, isLoading } = useKitchenEquipment(kitchenId, true)
	const { data: models = [] } = useEquipmentModels(kitchenId)
	const { data: roles = [] } = useEquipmentRoles()
	const createUnit = useCreateEquipmentUnit()
	const updateUnit = useUpdateEquipmentUnit()
	const deleteUnit = useDeleteEquipmentUnit()

	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<EquipmentUnitWire | null>(null)
	const [form, setForm] = useState<UnitFormState>(emptyForm)

	const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
	const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])
	const selectedModel = form.modelId ? modelById.get(form.modelId) : undefined
	const modelRoleIds = useMemo(() => (selectedModel?.roles ?? []).map((r) => r.role_id), [selectedModel])

	const openCreate = () => {
		setEditing(null)
		setForm(emptyForm())
		setOpen(true)
	}

	const openEdit = (unit: EquipmentUnitWire) => {
		setEditing(unit)
		const unitModelRoleIds = new Set((unit.model?.roles ?? []).map((r) => r.role_id))
		setForm({
			modelId: unit.model_id,
			label: unit.label,
			assetTag: unit.asset_tag ?? "",
			status: unit.status as UnitFormState["status"],
			slots: unit.simultaneous_slots != null ? String(unit.simultaneous_slots) : "",
			disabledRoleIds: new Set(unit.role_overrides.filter((o) => !o.available).map((o) => o.role_id)),
			extraRoleIds: new Set(unit.role_overrides.filter((o) => o.available && !unitModelRoleIds.has(o.role_id)).map((o) => o.role_id)),
		})
		setOpen(true)
	}

	const toggleSet = (set: Set<string>, id: string): Set<string> => {
		const next = new Set(set)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		return next
	}

	const roleOverrides = () => [
		...[...form.disabledRoleIds].map((roleId) => ({ roleId, available: false })),
		...[...form.extraRoleIds].map((roleId) => ({ roleId, available: true })),
	]

	const handleSubmit = () => {
		if (!form.modelId || form.label.trim() === "") return
		const slots = form.slots.trim() === "" ? null : Math.max(1, Number(form.slots))
		const common = {
			label: form.label.trim(),
			assetTag: form.assetTag.trim() === "" ? null : form.assetTag.trim(),
			status: form.status,
			simultaneousSlots: slots,
			roleOverrides: roleOverrides(),
		}
		const onSuccess = () => setOpen(false)
		if (editing) updateUnit.mutate({ unitId: editing.id, modelId: form.modelId, ...common }, { onSuccess })
		else createUnit.mutate({ kitchenId, modelId: form.modelId, ...common, serialNumber: null, acquiredOn: null, notes: null }, { onSuccess })
	}

	if (isLoading) return <Skeleton className="h-64 w-full" />

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button size="sm" onClick={openCreate}>
					<Plus className="size-4 mr-2" />
					Adicionar equipamento
				</Button>
			</div>

			{!units || units.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Nenhum equipamento cadastrado</EmptyTitle>
						<EmptyDescription>Sem o parque cadastrado, o sistema não consegue dizer quais preparações esta cozinha consegue produzir.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Equipamento</TableHead>
							<TableHead>Modelo</TableHead>
							<TableHead>Funções</TableHead>
							<TableHead className="w-24">Zonas</TableHead>
							<TableHead className="w-32">Situação</TableHead>
							<TableHead className="w-24 text-right">Ações</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{units.map((unit) => (
							<TableRow key={unit.id}>
								<TableCell>
									<span className="font-medium">{unit.label}</span>
									{unit.asset_tag ? <span className="block text-caption text-muted-foreground">Patrimônio {unit.asset_tag}</span> : null}
								</TableCell>
								<TableCell>{modelLabel(unit.model)}</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{unit.effective_role_ids.map((roleId) => (
											<Badge key={roleId} variant="secondary">
												{roleById.get(roleId)?.name ?? roleId}
											</Badge>
										))}
									</div>
								</TableCell>
								<TableCell>{unit.effective_slots}</TableCell>
								<TableCell>
									<Badge variant={unit.status === "active" ? "secondary" : "outline"}>{STATUS_LABEL[unit.status] ?? unit.status}</Badge>
								</TableCell>
								<TableCell className="text-right">
									<Button variant="ghost" size="icon" onClick={() => openEdit(unit)} aria-label={`Editar ${unit.label}`}>
										<Pencil className="size-4" />
									</Button>
									<Button variant="ghost" size="icon" onClick={() => deleteUnit.mutate(unit.id)} aria-label={`Remover ${unit.label}`}>
										<Trash2 className="size-4" />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{editing ? "Editar equipamento" : "Adicionar equipamento"}</DialogTitle>
						<DialogDescription>O modelo define as funções e as zonas independentes; ajuste aqui o que for diferente nesta unidade.</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="equipment-model">Modelo</FieldLabel>
							<FieldContent>
								<Select value={form.modelId} onValueChange={(value) => setForm((f) => ({ ...f, modelId: value as string }))}>
									<SelectTrigger id="equipment-model" className="w-full">
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
							</FieldContent>
						</Field>

						<Field>
							<FieldLabel htmlFor="equipment-label">Como esta cozinha chama</FieldLabel>
							<FieldContent>
								<Input id="equipment-label" value={form.label} placeholder="Forno 1" onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
								<FieldDescription>Único dentro da cozinha — é o nome que aparece no atendimento das preparações.</FieldDescription>
							</FieldContent>
						</Field>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<Field>
								<FieldLabel htmlFor="equipment-tag">Patrimônio</FieldLabel>
								<FieldContent>
									<Input id="equipment-tag" value={form.assetTag} onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))} />
								</FieldContent>
							</Field>

							<Field>
								<FieldLabel htmlFor="equipment-slots">Zonas independentes</FieldLabel>
								<FieldContent>
									<Input
										id="equipment-slots"
										type="number"
										min={1}
										placeholder={selectedModel ? String(selectedModel.simultaneous_slots) : "1"}
										value={form.slots}
										onChange={(e) => setForm((f) => ({ ...f, slots: e.target.value }))}
									/>
									<FieldDescription>Vazio = herda do modelo.</FieldDescription>
								</FieldContent>
							</Field>

							<Field>
								<FieldLabel htmlFor="equipment-status">Situação</FieldLabel>
								<FieldContent>
									<Select value={form.status} onValueChange={(value) => setForm((f) => ({ ...f, status: value as UnitFormState["status"] }))}>
										<SelectTrigger id="equipment-status" className="w-full">
											<SelectValue>{STATUS_LABEL[form.status]}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="active">Ativo</SelectItem>
											<SelectItem value="maintenance">Em manutenção</SelectItem>
											<SelectItem value="decommissioned">Baixado</SelectItem>
										</SelectContent>
									</Select>
									<FieldDescription>Só equipamento ativo conta no atendimento.</FieldDescription>
								</FieldContent>
							</Field>
						</div>

						{selectedModel ? (
							<div className="space-y-3">
								<div>
									<p className="text-subheading">Funções do modelo</p>
									<p className="text-caption text-muted-foreground">Desligue o que esta unidade não faz (acessório ausente, defeito).</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{modelRoleIds.map((roleId) => (
											<Toggle
												key={roleId}
												pressed={!form.disabledRoleIds.has(roleId)}
												onPressedChange={() => setForm((f) => ({ ...f, disabledRoleIds: toggleSet(f.disabledRoleIds, roleId) }))}
											>
												{roleById.get(roleId)?.name ?? roleId}
											</Toggle>
										))}
									</div>
								</div>

								<div>
									<p className="text-subheading">Funções extras</p>
									<p className="text-caption text-muted-foreground">Ligue o que esta unidade faz e o modelo não declara.</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{roles
											.filter((role) => !modelRoleIds.includes(role.id))
											.map((role) => (
												<Toggle
													key={role.id}
													pressed={form.extraRoleIds.has(role.id)}
													onPressedChange={() => setForm((f) => ({ ...f, extraRoleIds: toggleSet(f.extraRoleIds, role.id) }))}
												>
													{role.name}
												</Toggle>
											))}
									</div>
								</div>
							</div>
						) : null}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button onClick={handleSubmit} disabled={!form.modelId || form.label.trim() === "" || createUnit.isPending || updateUnit.isPending}>
							{editing ? "Salvar alterações" : "Adicionar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
