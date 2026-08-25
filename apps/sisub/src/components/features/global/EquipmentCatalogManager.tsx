/**
 * Catálogo global de equipamentos (SDAB): os PAPÉIS (taxonomia) e os MODELOS comerciais.
 *
 * Por que o papel é global e não da cozinha: se cada cozinha inventasse o seu "forno
 * combinado", a exigência de uma preparação do catálogo da FAB deixaria de casar com o parque
 * de quem a executa — e o atendimento passaria a acusar falta onde há equipamento sobrando.
 *
 * O modelo declara os papéis que assume (é o que representa o multifuncional) e as zonas
 * independentes, que limitam quantos deles ele exerce ao mesmo tempo.
 */

import type { EquipmentModelWire } from "@iefa/sisub-domain"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Toggle } from "@/components/ui/toggle"
import {
	useCreateEquipmentModel,
	useCreateEquipmentRole,
	useDeleteEquipmentModel,
	useEquipmentModels,
	useEquipmentRoles,
	useSetUtensilRole,
	useUpdateEquipmentModel,
} from "@/hooks/data/useEquipment"
import { useUtensils } from "@/hooks/data/useRecipeFlow"

const CATEGORY_LABEL: Record<string, string> = {
	coccao: "Cocção",
	preparo: "Preparo",
	conservacao: "Conservação",
	apoio: "Apoio",
}

type ModelFormState = {
	manufacturer: string
	name: string
	capacityLabel: string
	slotCapacityLiters: string
	slotCapacityGn: string
	slots: string
	roleIds: Set<string>
	primaryRoleId: string | null
}

const emptyModelForm = (): ModelFormState => ({
	manufacturer: "",
	name: "",
	capacityLabel: "",
	slotCapacityLiters: "",
	slotCapacityGn: "",
	slots: "1",
	roleIds: new Set(),
	primaryRoleId: null,
})

const numberOrNull = (value: string): number | null => (value.trim() === "" ? null : Number(value))

export function EquipmentCatalogManager() {
	const { data: roles = [], isLoading: rolesLoading } = useEquipmentRoles()
	const { data: models = [], isLoading: modelsLoading } = useEquipmentModels(null)
	const createModel = useCreateEquipmentModel()
	const updateModel = useUpdateEquipmentModel()
	const deleteModel = useDeleteEquipmentModel()
	const createRole = useCreateEquipmentRole()

	const [modelOpen, setModelOpen] = useState(false)
	const [editing, setEditing] = useState<EquipmentModelWire | null>(null)
	const [form, setForm] = useState<ModelFormState>(emptyModelForm)

	const [roleOpen, setRoleOpen] = useState(false)
	const [roleForm, setRoleForm] = useState({ code: "", name: "", category: "coccao", description: "" })

	const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])

	const openCreate = () => {
		setEditing(null)
		setForm(emptyModelForm())
		setModelOpen(true)
	}

	const openEdit = (model: EquipmentModelWire) => {
		setEditing(model)
		setForm({
			manufacturer: model.manufacturer ?? "",
			name: model.name,
			capacityLabel: model.capacity_label ?? "",
			slotCapacityLiters: model.slot_capacity_liters != null ? String(model.slot_capacity_liters) : "",
			slotCapacityGn: model.slot_capacity_gn != null ? String(model.slot_capacity_gn) : "",
			slots: String(model.simultaneous_slots),
			roleIds: new Set(model.roles.map((r) => r.role_id)),
			primaryRoleId: model.roles.find((r) => r.is_primary)?.role_id ?? null,
		})
		setModelOpen(true)
	}

	const toggleRole = (roleId: string) => {
		setForm((f) => {
			const roleIds = new Set(f.roleIds)
			if (roleIds.has(roleId)) roleIds.delete(roleId)
			else roleIds.add(roleId)
			const primaryRoleId = roleIds.has(f.primaryRoleId ?? "") ? f.primaryRoleId : (roleIds.values().next().value ?? null)
			return { ...f, roleIds, primaryRoleId }
		})
	}

	const handleSubmitModel = () => {
		if (form.name.trim() === "" || form.roleIds.size === 0) return
		const roles = [...form.roleIds].map((roleId) => ({ roleId, isPrimary: roleId === form.primaryRoleId, notes: null }))
		const common = {
			manufacturer: form.manufacturer.trim() === "" ? null : form.manufacturer.trim(),
			name: form.name.trim(),
			capacityLabel: form.capacityLabel.trim() === "" ? null : form.capacityLabel.trim(),
			slotCapacityLiters: numberOrNull(form.slotCapacityLiters),
			slotCapacityGn: numberOrNull(form.slotCapacityGn),
			simultaneousSlots: Math.max(1, Number(form.slots) || 1),
			roles,
		}
		const onSuccess = () => setModelOpen(false)
		// `powerKw`/`notes` ficam FORA do payload de edição: o diálogo não tem campo para eles, e
		// mandá-los como null apagaria o que já está gravado (a nota do iHexagon, por exemplo).
		// No domínio, ausente = mantém; null = limpa.
		if (editing) updateModel.mutate({ modelId: editing.id, ...common }, { onSuccess })
		else createModel.mutate({ ...common, powerKw: null, notes: null, isGeneric: false, kitchenId: null }, { onSuccess })
	}

	const handleSubmitRole = () => {
		if (roleForm.code.trim() === "" || roleForm.name.trim() === "") return
		createRole.mutate(
			{
				code: roleForm.code.trim(),
				name: roleForm.name.trim(),
				category: roleForm.category as "coccao",
				description: roleForm.description.trim() === "" ? null : roleForm.description.trim(),
				sortOrder: 100,
			},
			{
				onSuccess: () => {
					setRoleOpen(false)
					setRoleForm({ code: "", name: "", category: "coccao", description: "" })
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Tipos de equipamento</CardTitle>
					<CardDescription>O vocabulário pelo qual a preparação declara o que precisa. Um modelo multifuncional assume vários destes tipos.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{rolesLoading ? (
						<Skeleton className="h-24 w-full" />
					) : (
						<div className="flex flex-wrap gap-2">
							{roles.map((role) => (
								<Badge key={role.id} variant="secondary" title={role.description ?? undefined}>
									{role.name}
									<span className="ml-1 text-muted-foreground">· {CATEGORY_LABEL[role.category] ?? role.category}</span>
								</Badge>
							))}
						</div>
					)}
					<Button variant="outline" size="sm" onClick={() => setRoleOpen(true)}>
						<Plus className="size-4 mr-2" />
						Novo tipo
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Modelos</CardTitle>
					<CardDescription>Modelos comerciais e genéricos que as cozinhas usam ao cadastrar o parque.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex justify-end">
						<Button size="sm" onClick={openCreate}>
							<Plus className="size-4 mr-2" />
							Novo modelo
						</Button>
					</div>

					{modelsLoading ? (
						<Skeleton className="h-64 w-full" />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Modelo</TableHead>
									<TableHead>Capacidade</TableHead>
									<TableHead>Funções</TableHead>
									<TableHead className="w-24">Zonas</TableHead>
									<TableHead className="w-24 text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{models.map((model) => (
									<TableRow key={model.id}>
										<TableCell>
											<span className="font-medium">{model.name}</span>
											{model.manufacturer ? <span className="block text-caption text-muted-foreground">{model.manufacturer}</span> : null}
										</TableCell>
										<TableCell>{model.capacity_label ?? "—"}</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{model.roles.map((link) => (
													<Badge key={link.id} variant={link.is_primary ? "default" : "secondary"}>
														{link.role?.name ?? roleById.get(link.role_id)?.name ?? link.role_id}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell>{model.simultaneous_slots}</TableCell>
										<TableCell className="text-right">
											<Button variant="ghost" size="icon" onClick={() => openEdit(model)} aria-label={`Editar ${model.name}`}>
												<Pencil className="size-4" />
											</Button>
											<Button variant="ghost" size="icon" onClick={() => deleteModel.mutate(model.id)} aria-label={`Remover ${model.name}`}>
												<Trash2 className="size-4" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<UtensilRoleBridge />

			<Dialog open={modelOpen} onOpenChange={setModelOpen}>
				<DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{editing ? "Editar modelo" : "Novo modelo"}</DialogTitle>
						<DialogDescription>As funções marcadas são o que este modelo consegue fazer; as zonas limitam quantas ao mesmo tempo.</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="model-manufacturer">Fabricante</FieldLabel>
								<FieldContent>
									<Input
										id="model-manufacturer"
										placeholder="Rational"
										value={form.manufacturer}
										onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
									/>
									<FieldDescription>Vazio = modelo genérico.</FieldDescription>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="model-name">Modelo</FieldLabel>
								<FieldContent>
									<Input id="model-name" placeholder="iVario Pro 2-S" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
								</FieldContent>
							</Field>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
							<Field>
								<FieldLabel htmlFor="model-capacity-label">Capacidade (rótulo)</FieldLabel>
								<FieldContent>
									<Input
										id="model-capacity-label"
										placeholder="2 × 25 L"
										value={form.capacityLabel}
										onChange={(e) => setForm((f) => ({ ...f, capacityLabel: e.target.value }))}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="model-capacity-liters">Litros por zona</FieldLabel>
								<FieldContent>
									<Input
										id="model-capacity-liters"
										type="number"
										min={1}
										value={form.slotCapacityLiters}
										onChange={(e) => setForm((f) => ({ ...f, slotCapacityLiters: e.target.value }))}
									/>
									<FieldDescription>De UMA cuba, não a soma: o iVario Pro 2-S é 25, não 50.</FieldDescription>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="model-capacity-gn">GN por zona</FieldLabel>
								<FieldContent>
									<Input
										id="model-capacity-gn"
										type="number"
										min={1}
										value={form.slotCapacityGn}
										onChange={(e) => setForm((f) => ({ ...f, slotCapacityGn: e.target.value }))}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="model-slots">Zonas</FieldLabel>
								<FieldContent>
									<Input id="model-slots" type="number" min={1} value={form.slots} onChange={(e) => setForm((f) => ({ ...f, slots: e.target.value }))} />
								</FieldContent>
							</Field>
						</div>

						<div>
							<p className="text-subheading">Funções</p>
							<p className="text-caption text-muted-foreground">Marque tudo que o modelo consegue fazer. A primeira marcada vira a função principal.</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{roles.map((role) => (
									<Toggle key={role.id} pressed={form.roleIds.has(role.id)} onPressedChange={() => toggleRole(role.id)}>
										{role.name}
									</Toggle>
								))}
							</div>
						</div>

						{form.roleIds.size > 0 ? (
							<Field>
								<FieldLabel htmlFor="model-primary">Função principal</FieldLabel>
								<FieldContent>
									<Select value={form.primaryRoleId} onValueChange={(value) => setForm((f) => ({ ...f, primaryRoleId: value as string }))}>
										<SelectTrigger id="model-primary" className="w-full">
											<SelectValue>{form.primaryRoleId ? (roleById.get(form.primaryRoleId)?.name ?? "Função") : "Selecione"}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{[...form.roleIds].map((roleId) => (
												<SelectItem key={roleId} value={roleId}>
													{roleById.get(roleId)?.name ?? roleId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</FieldContent>
							</Field>
						) : null}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setModelOpen(false)}>
							Cancelar
						</Button>
						<Button onClick={handleSubmitModel} disabled={form.name.trim() === "" || form.roleIds.size === 0 || createModel.isPending || updateModel.isPending}>
							{editing ? "Salvar alterações" : "Criar modelo"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={roleOpen} onOpenChange={setRoleOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Novo tipo de equipamento</DialogTitle>
						<DialogDescription>O código é a chave estável usada por seed e importação — não pode ser reaproveitado depois.</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="role-code">Código</FieldLabel>
							<FieldContent>
								<Input
									id="role-code"
									placeholder="combi_oven"
									value={roleForm.code}
									onChange={(e) => setRoleForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="role-name">Nome</FieldLabel>
							<FieldContent>
								<Input
									id="role-name"
									placeholder="Forno combinado"
									value={roleForm.name}
									onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="role-category">Categoria</FieldLabel>
							<FieldContent>
								<Select value={roleForm.category} onValueChange={(value) => setRoleForm((f) => ({ ...f, category: value as string }))}>
									<SelectTrigger id="role-category" className="w-full">
										<SelectValue>{CATEGORY_LABEL[roleForm.category]}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="coccao">Cocção</SelectItem>
										<SelectItem value="preparo">Preparo</SelectItem>
										<SelectItem value="conservacao">Conservação</SelectItem>
										<SelectItem value="apoio">Apoio</SelectItem>
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="role-description">Descrição</FieldLabel>
							<FieldContent>
								<Input id="role-description" value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} />
							</FieldContent>
						</Field>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setRoleOpen(false)}>
							Cancelar
						</Button>
						<Button onClick={handleSubmitRole} disabled={roleForm.code.trim() === "" || roleForm.name.trim() === "" || createRole.isPending}>
							Criar tipo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

/** Sentinela do "não é equipamento" — o Select não representa `null` como valor de item. */
const NO_ROLE_VALUE = "__none__"

/**
 * Ponte utensílio → papel de equipamento.
 *
 * `kitchen.utensil` nasceu de texto livre, e "forno combinado" é o exemplo da própria migration
 * do fluxo: já existe linha de utensílio que é equipamento. Mapear aqui não move nem apaga nada —
 * os vínculos de etapa continuam válidos —, só permite que a ficha técnica SUGIRA a exigência a
 * partir do fluxo em vez de o usuário redigitar.
 */
function UtensilRoleBridge() {
	const { data: utensils = [], isLoading } = useUtensils(null)
	const { data: roles = [] } = useEquipmentRoles()
	const setRole = useSetUtensilRole()

	const mapped = utensils.filter((u) => u.role_id != null).length

	return (
		<Card>
			<CardHeader>
				<CardTitle>Utensílios que são equipamento</CardTitle>
				<CardDescription>
					Utensílio de mão (colher, tábua) fica sem papel. Marcar o papel dos que são equipamento faz a ficha técnica sugerir a exigência a partir do fluxo de
					produção. {mapped} de {utensils.length} mapeados.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-40 w-full" />
				) : utensils.length === 0 ? (
					<p className="text-caption text-muted-foreground">Nenhum utensílio no catálogo global.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Utensílio</TableHead>
								<TableHead className="w-72">Papel de equipamento</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{utensils.map((utensil) => (
								<TableRow key={utensil.id}>
									<TableCell>{utensil.name}</TableCell>
									<TableCell>
										<Select
											value={utensil.role_id ?? NO_ROLE_VALUE}
											onValueChange={(value) => setRole.mutate({ utensilId: utensil.id, roleId: value === NO_ROLE_VALUE ? null : (value as string) })}
										>
											<SelectTrigger className="w-full">
												<SelectValue>{utensil.role_id ? (roles.find((r) => r.id === utensil.role_id)?.name ?? "Papel") : "Utensílio de mão"}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={NO_ROLE_VALUE}>Utensílio de mão</SelectItem>
												{roles.map((role) => (
													<SelectItem key={role.id} value={role.id}>
														{role.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}
