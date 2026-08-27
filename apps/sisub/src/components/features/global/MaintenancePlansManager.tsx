/**
 * Rotinas de manutenção do catálogo global.
 *
 * A rotina é ancorada num PAPEL ("toda coifa, de qualquer marca, limpa a cada 30 dias") ou num
 * MODELO ("a guarnição da porta daquele forno"), nunca nos dois — mesma forma da exigência da
 * preparação. Ancorar no papel é o default porque é o que faz a rotina valer para equipamento
 * que a OM comprar depois, sem ninguém ter de lembrar de cadastrar de novo.
 *
 * Nenhuma rotina `legal` é semeada pelo sistema: a periodicidade de obrigação regulada varia
 * por norma e por capacidade, e um número errado ali vira "em dia" falso num relatório de
 * conformidade. Quem cadastra a legal é a OM, com a norma na mão.
 */

import type { MaintenanceKind } from "@iefa/sisub-domain"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { MAINTENANCE_KIND_LABEL } from "@/components/features/shared/equipment/equipment-labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useCreateMaintenancePlan, useDeleteMaintenancePlan, useEquipmentRoles, useMaintenancePlans, useUpdateMaintenancePlan } from "@/hooks/data/useEquipment"

const KINDS = ["preventive", "inspection", "cleaning", "calibration", "legal"] as const

/** Atalhos de periodicidade — ninguém pensa em "a cada 90 dias", pensa em "trimestral". */
const INTERVAL_SHORTCUTS: { label: string; days: number }[] = [
	{ label: "Semanal", days: 7 },
	{ label: "Quinzenal", days: 15 },
	{ label: "Mensal", days: 30 },
	{ label: "Trimestral", days: 90 },
	{ label: "Semestral", days: 180 },
	{ label: "Anual", days: 365 },
]

type PlanForm = {
	title: string
	roleId: string | null
	kind: MaintenanceKind
	intervalDays: string
	toleranceDays: string
	instructions: string
}

const emptyForm = (): PlanForm => ({ title: "", roleId: null, kind: "preventive", intervalDays: "30", toleranceDays: "0", instructions: "" })

export function MaintenancePlansManager() {
	const { data: plans = [], isLoading } = useMaintenancePlans(null)
	const { data: roles = [] } = useEquipmentRoles()
	const createPlan = useCreateMaintenancePlan()
	const updatePlan = useUpdateMaintenancePlan()
	const deletePlan = useDeleteMaintenancePlan()

	const [open, setOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [form, setForm] = useState<PlanForm>(emptyForm)

	const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])

	const openCreate = () => {
		setEditingId(null)
		setForm(emptyForm())
		setOpen(true)
	}

	const openEdit = (planId: string) => {
		const plan = plans.find((p) => p.id === planId)
		if (!plan) return
		setEditingId(planId)
		setForm({
			title: plan.title,
			roleId: plan.role_id,
			kind: plan.kind,
			intervalDays: String(plan.interval_days),
			toleranceDays: String(plan.tolerance_days ?? 0),
			instructions: plan.instructions ?? "",
		})
		setOpen(true)
	}

	const interval = Math.max(1, Number(form.intervalDays) || 1)
	const tolerance = Math.max(0, Number(form.toleranceDays) || 0)
	const toleranceInvalid = tolerance >= interval

	const handleSubmit = () => {
		if (form.title.trim() === "" || toleranceInvalid) return
		const onSuccess = () => setOpen(false)
		const common = {
			title: form.title.trim(),
			kind: form.kind,
			intervalDays: interval,
			toleranceDays: tolerance,
			instructions: form.instructions.trim() === "" ? null : form.instructions.trim(),
		}
		if (editingId) {
			updatePlan.mutate({ planId: editingId, ...common, estimatedMinutes: null, isRequired: null, sortOrder: null }, { onSuccess })
			return
		}
		if (form.roleId == null) return
		createPlan.mutate(
			{ ...common, roleId: form.roleId, modelId: null, kitchenId: null, estimatedMinutes: null, isRequired: true, sortOrder: 100 },
			{ onSuccess }
		)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Rotinas de manutenção</CardTitle>
				<CardDescription>
					Ancoradas na FUNÇÃO do equipamento: a rotina passa a valer sozinha para tudo que assume aquela função, inclusive o que for comprado depois. Obrigação
					legal não é semeada pelo sistema — a periodicidade varia por norma e um número errado vira conformidade falsa.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex justify-end">
					<Button size="sm" onClick={openCreate}>
						<Plus className="size-4 mr-2" />
						Nova rotina
					</Button>
				</div>

				{isLoading ? (
					<Skeleton className="h-48 w-full" />
				) : plans.length === 0 ? (
					<p className="text-caption text-muted-foreground">Nenhuma rotina cadastrada.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Rotina</TableHead>
								<TableHead className="w-40">Função</TableHead>
								<TableHead className="w-32">Tipo</TableHead>
								<TableHead className="w-32">Periodicidade</TableHead>
								<TableHead className="w-24 text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{plans.map((plan) => (
								<TableRow key={plan.id}>
									<TableCell>
										<span className="font-medium">{plan.title}</span>
										{plan.instructions ? <span className="block text-caption text-muted-foreground">{plan.instructions}</span> : null}
									</TableCell>
									<TableCell>{plan.role_id ? (roleById.get(plan.role_id)?.name ?? "Função") : "Modelo específico"}</TableCell>
									<TableCell>
										<Badge variant="secondary">{MAINTENANCE_KIND_LABEL[plan.kind] ?? plan.kind}</Badge>
									</TableCell>
									<TableCell>
										{plan.interval_days} dias
										{plan.tolerance_days ? <span className="block text-caption text-muted-foreground">folga de {plan.tolerance_days} d</span> : null}
									</TableCell>
									<TableCell className="text-right">
										<Button variant="ghost" size="icon" aria-label={`Editar ${plan.title}`} onClick={() => openEdit(plan.id)}>
											<Pencil className="size-4" />
										</Button>
										<Button variant="ghost" size="icon" aria-label={`Remover ${plan.title}`} onClick={() => deletePlan.mutate(plan.id)}>
											<Trash2 className="size-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{editingId ? "Editar rotina" : "Nova rotina"}</DialogTitle>
						<DialogDescription>A rotina vale para toda unidade que assume a função escolhida.</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="plan-title">Rotina</FieldLabel>
							<FieldContent>
								<Input
									id="plan-title"
									placeholder="Limpeza de filtro da coifa"
									value={form.title}
									onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
								/>
							</FieldContent>
						</Field>

						{editingId == null ? (
							<Field>
								<FieldLabel htmlFor="plan-role">Função do equipamento</FieldLabel>
								<FieldContent>
									<Select value={form.roleId} onValueChange={(value) => setForm((f) => ({ ...f, roleId: value as string }))}>
										<SelectTrigger id="plan-role" className="w-full">
											<SelectValue>{form.roleId ? (roleById.get(form.roleId)?.name ?? "Função") : "Selecione a função"}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{roles.map((role) => (
												<SelectItem key={role.id} value={role.id}>
													{role.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldDescription>A âncora não muda depois: mudar a função mudaria o parque inteiro que a rotina cobre.</FieldDescription>
								</FieldContent>
							</Field>
						) : null}

						<Field>
							<FieldLabel htmlFor="plan-kind">Tipo</FieldLabel>
							<FieldContent>
								<Select value={form.kind} onValueChange={(value) => setForm((f) => ({ ...f, kind: value as MaintenanceKind }))}>
									<SelectTrigger id="plan-kind" className="w-full">
										<SelectValue>{MAINTENANCE_KIND_LABEL[form.kind]}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{KINDS.map((option) => (
											<SelectItem key={option} value={option}>
												{MAINTENANCE_KIND_LABEL[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>

						<div>
							<span className="text-caption text-muted-foreground">Periodicidade</span>
							<div className="mt-1 flex flex-wrap gap-2">
								{INTERVAL_SHORTCUTS.map((shortcut) => (
									<Button
										key={shortcut.days}
										type="button"
										size="sm"
										variant={interval === shortcut.days ? "default" : "outline"}
										onClick={() => setForm((f) => ({ ...f, intervalDays: String(shortcut.days) }))}
									>
										{shortcut.label}
									</Button>
								))}
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="plan-interval">A cada (dias)</FieldLabel>
								<FieldContent>
									<Input
										id="plan-interval"
										type="number"
										min={1}
										value={form.intervalDays}
										onChange={(e) => setForm((f) => ({ ...f, intervalDays: e.target.value }))}
									/>
								</FieldContent>
							</Field>
							<Field data-invalid={toleranceInvalid || undefined}>
								<FieldLabel htmlFor="plan-tolerance">Folga (dias)</FieldLabel>
								<FieldContent>
									<Input
										id="plan-tolerance"
										type="number"
										min={0}
										aria-invalid={toleranceInvalid}
										value={form.toleranceDays}
										onChange={(e) => setForm((f) => ({ ...f, toleranceDays: e.target.value }))}
									/>
									<FieldDescription>
										{toleranceInvalid ? "A folga precisa ser menor que o período — senão a rotina nunca vence." : "Atraso tolerado antes de virar vencida."}
									</FieldDescription>
								</FieldContent>
							</Field>
						</div>

						<Field>
							<FieldLabel htmlFor="plan-instructions">Instruções</FieldLabel>
							<FieldContent>
								<Textarea
									id="plan-instructions"
									rows={2}
									value={form.instructions}
									onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
								/>
							</FieldContent>
						</Field>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button
							onClick={handleSubmit}
							disabled={
								form.title.trim() === "" || toleranceInvalid || (editingId == null && form.roleId == null) || createPlan.isPending || updatePlan.isPending
							}
						>
							{editingId ? "Salvar" : "Criar rotina"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	)
}
