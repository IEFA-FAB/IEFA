import type { FrozenPreparation } from "@iefa/database/sisub"
import type { FrozenPreparationCategory, FrozenPreparationWrite } from "@iefa/sisub-domain"
import { createFileRoute } from "@tanstack/react-router"
import { Pencil, Plus, Snowflake, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useCreateFrozenPreparation, useDeleteFrozenPreparation, useFrozenPreparations, useUpdateFrozenPreparation } from "@/services/FrozenPreparationsService"

const searchSchema = z.object({ search: z.string().optional() })

export const Route = createFileRoute("/_protected/_modules/global/frozen-preparations/")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: FrozenPreparationsPage,
	head: () => ({
		meta: [{ title: "Preparações Congeladas - SISUB" }, { name: "description", content: "Catálogo de semiacabados congelados (produção + regeneração)" }],
	}),
})

const CATEGORIES: { value: FrozenPreparationCategory; label: string }[] = [
	{ value: "preparacao", label: "Preparações" },
	{ value: "prato_pronto", label: "Pratos Prontos" },
	{ value: "lanche_pronto", label: "Lanches Prontos" },
]
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c

function FrozenPreparationsPage() {
	// Busca é fonte-da-verdade na URL (?search=) — habilita compartilhar link e voltar navegando.
	const { search = "" } = Route.useSearch()
	const navigate = Route.useNavigate()
	const setSearch = (value: string) => navigate({ search: (prev) => ({ ...prev, search: value || undefined }), replace: true })
	const [category, setCategory] = useState<FrozenPreparationCategory | undefined>(undefined)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<FrozenPreparation | null>(null)

	const { frozenPreparations, isLoading } = useFrozenPreparations({ search: search || undefined, category })
	const deleteMutation = useDeleteFrozenPreparation()

	const rows = useMemo(() => frozenPreparations ?? [], [frozenPreparations])

	function openCreate() {
		setEditing(null)
		setDialogOpen(true)
	}
	function openEdit(fp: FrozenPreparation) {
		setEditing(fp)
		setDialogOpen(true)
	}
	async function handleDelete(fp: FrozenPreparation) {
		if (!confirm(`Excluir "${fp.description}"?`)) return
		try {
			await deleteMutation.mutateAsync(fp.id)
			toast.success("Preparação congelada excluída")
		} catch {
			toast.error("Falha ao excluir")
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Preparações Congeladas">
				<Button size="sm" onClick={openCreate} className="gap-2">
					<Plus className="size-4" />
					Nova preparação congelada
				</Button>
			</PageHeader>

			<div className="flex flex-wrap items-center gap-2">
				<Input placeholder="Buscar por nome…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
				<div className="flex gap-1">
					<Button variant={category === undefined ? "default" : "outline"} size="sm" onClick={() => setCategory(undefined)}>
						Todas
					</Button>
					{CATEGORIES.map((c) => (
						<Button key={c.value} variant={category === c.value ? "default" : "outline"} size="sm" onClick={() => setCategory(c.value)}>
							{c.label}
						</Button>
					))}
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Nome</TableHead>
						<TableHead>Categoria</TableHead>
						<TableHead>Unidade</TableHead>
						<TableHead>Validade (dias)</TableHead>
						<TableHead>Temp. (°C)</TableHead>
						<TableHead className="w-24 text-right">Ações</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						<TableRow>
							<TableCell colSpan={6} className="text-center text-muted-foreground">
								Carregando…
							</TableCell>
						</TableRow>
					) : rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={6} className="text-center text-muted-foreground">
								<Snowflake className="mx-auto mb-2 size-6 opacity-50" />
								Nenhuma preparação congelada.
							</TableCell>
						</TableRow>
					) : (
						rows.map((fp) => (
							<TableRow key={fp.id}>
								<TableCell className="font-medium">{fp.description}</TableCell>
								<TableCell>{categoryLabel(fp.category)}</TableCell>
								<TableCell>{fp.measure_unit ?? "—"}</TableCell>
								<TableCell>{fp.shelf_life_days ?? "—"}</TableCell>
								<TableCell>{fp.storage_temperature_c ?? "—"}</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-1">
										<Button variant="ghost" size="icon" onClick={() => openEdit(fp)} aria-label="Editar">
											<Pencil className="size-4" />
										</Button>
										<Button variant="ghost" size="icon" onClick={() => handleDelete(fp)} aria-label="Excluir">
											<Trash2 className="size-4" />
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			<FrozenPreparationDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
		</div>
	)
}

type FormState = {
	description: string
	category: FrozenPreparationCategory
	measure_unit: string
	yield_quantity: string
	shelf_life_days: string
	storage_temperature_c: string
	storage_instructions: string
}

const emptyForm: FormState = {
	description: "",
	category: "preparacao",
	measure_unit: "",
	yield_quantity: "",
	shelf_life_days: "",
	storage_temperature_c: "",
	storage_instructions: "",
}

function toForm(fp: FrozenPreparation): FormState {
	return {
		description: fp.description,
		category: (fp.category as FrozenPreparationCategory) ?? "preparacao",
		measure_unit: fp.measure_unit ?? "",
		yield_quantity: fp.yield_quantity != null ? String(fp.yield_quantity) : "",
		shelf_life_days: fp.shelf_life_days != null ? String(fp.shelf_life_days) : "",
		storage_temperature_c: fp.storage_temperature_c != null ? String(fp.storage_temperature_c) : "",
		storage_instructions: fp.storage_instructions ?? "",
	}
}

// "" → null (limpa o campo); número parseado caso contrário.
const num = (s: string): number | null => {
	const t = s.trim()
	if (!t) return null
	const n = Number(t)
	return Number.isFinite(n) ? n : null
}

function FrozenPreparationDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: FrozenPreparation | null }) {
	const [form, setForm] = useState<FormState>(emptyForm)
	const [initialized, setInitialized] = useState(false)
	const createMutation = useCreateFrozenPreparation()
	const updateMutation = useUpdateFrozenPreparation()

	// Reinicializa o form quando o dialog abre (novo vs edição).
	if (open && !initialized) {
		setForm(editing ? toForm(editing) : emptyForm)
		setInitialized(true)
	}
	if (!open && initialized) setInitialized(false)

	const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!form.description.trim()) {
			toast.error("Nome obrigatório")
			return
		}
		const payload: FrozenPreparationWrite = {
			description: form.description.trim(),
			category: form.category,
			measure_unit: form.measure_unit.trim() || null,
			yield_quantity: num(form.yield_quantity),
			shelf_life_days: num(form.shelf_life_days),
			storage_temperature_c: num(form.storage_temperature_c),
			storage_instructions: form.storage_instructions.trim() || null,
		}
		try {
			if (editing) await updateMutation.mutateAsync({ id: editing.id, payload })
			else await createMutation.mutateAsync(payload)
			toast.success(editing ? "Preparação congelada atualizada" : "Preparação congelada criada")
			onOpenChange(false)
		} catch {
			toast.error("Falha ao salvar")
		}
	}

	const saving = createMutation.isPending || updateMutation.isPending

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{editing ? "Editar preparação congelada" : "Nova preparação congelada"}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="fp-desc">Nome</Label>
						<Input id="fp-desc" value={form.description} onChange={(e) => set("description", e.target.value)} required />
					</div>

					<div className="space-y-1.5">
						<Label>Categoria</Label>
						<div className="flex gap-1">
							{CATEGORIES.map((c) => (
								<Button
									key={c.value}
									type="button"
									variant={form.category === c.value ? "default" : "outline"}
									size="sm"
									onClick={() => set("category", c.value)}
								>
									{c.label}
								</Button>
							))}
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="fp-unit">Unidade de medida</Label>
							<Input id="fp-unit" value={form.measure_unit} onChange={(e) => set("measure_unit", e.target.value)} placeholder="KG, LT…" />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="fp-yield">Rendimento do lote</Label>
							<Input id="fp-yield" type="number" step="any" value={form.yield_quantity} onChange={(e) => set("yield_quantity", e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="fp-shelf">Validade (dias)</Label>
							<Input id="fp-shelf" type="number" value={form.shelf_life_days} onChange={(e) => set("shelf_life_days", e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="fp-temp">Temperatura (°C)</Label>
							<Input id="fp-temp" type="number" step="any" value={form.storage_temperature_c} onChange={(e) => set("storage_temperature_c", e.target.value)} />
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="fp-storage">Instruções de armazenamento</Label>
						<Textarea id="fp-storage" value={form.storage_instructions} onChange={(e) => set("storage_instructions", e.target.value)} rows={3} />
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "Salvando…" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
