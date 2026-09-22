import type { MenuGroupSetRow } from "@iefa/sisub-domain"
import { ArrowDown, ArrowUp, Copy, Loader2, Lock, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCreateMenuGroupSet, useDeleteMenuGroupSet, useMenuGroupSets, useUpdateMenuGroupSet } from "@/hooks/data/useMenuGroups"

/**
 * Conjuntos de grupos do cardápio — os "templates de grupos" que cada refeição
 * usa para montar as colunas do editor.
 *
 * Conjunto GLOBAL é da SDAB e só quem tem `global:2` edita; a cozinha cria os
 * dela (normalmente duplicando um global) sem tocar no de ninguém. A duplicação
 * existe porque começar do zero é o caminho para um conjunto com uma coluna só.
 */

/** Chave técnica derivada do rótulo — é ela que fica gravada em `item_group`. */
function slugify(label: string): string {
	const base = label
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
	// O banco exige começar por letra e ter ao menos 2 caracteres.
	const safe = /^[a-z]/.test(base) ? base : `g_${base}`
	return safe.length >= 2 ? safe.slice(0, 40) : `${safe}_1`
}

type DraftGroup = { key: string; label: string }

function GroupSetEditor({
	kitchenId,
	initial,
	onDone,
	onCancel,
}: {
	kitchenId: number | null
	/** Conjunto sendo editado, ou o conjunto-fonte de uma duplicação. */
	initial: { set: MenuGroupSetRow; mode: "edit" | "duplicate" } | null
	onDone: () => void
	onCancel: () => void
}) {
	const { mutate: createSet, isPending: isCreating } = useCreateMenuGroupSet()
	const { mutate: updateSet, isPending: isUpdating } = useUpdateMenuGroupSet()
	const isEditing = initial?.mode === "edit"

	const [name, setName] = useState(initial ? (isEditing ? initial.set.name : `${initial.set.name} (cópia)`) : "")
	const [description, setDescription] = useState(initial?.set.description ?? "")
	const [groups, setGroups] = useState<DraftGroup[]>(initial ? initial.set.groups.map((g) => ({ key: g.key, label: g.label })) : [{ key: "", label: "" }])

	const isPending = isCreating || isUpdating

	const move = (index: number, delta: number) => {
		const target = index + delta
		if (target < 0 || target >= groups.length) return
		const next = [...groups]
		;[next[index], next[target]] = [next[target], next[index]]
		setGroups(next)
	}

	const filled = groups.filter((g) => g.label.trim() !== "")
	// A chave é derivada do rótulo só quando o grupo é NOVO. Regerar a chave de um
	// grupo existente ao renomear o rótulo desclassificaria o cardápio inteiro
	// daquela coluna — o item ficaria apontando para uma chave que sumiu.
	const payloadGroups = filled.map((g) => ({ key: g.key || slugify(g.label), label: g.label.trim() }))
	const duplicateKey = payloadGroups.find((g, i) => payloadGroups.findIndex((o) => o.key === g.key) !== i)
	const canSave = name.trim().length > 0 && payloadGroups.length > 0 && !duplicateKey

	const submit = () => {
		if (!canSave) return
		if (isEditing && initial) {
			updateSet({ groupSetId: initial.set.id, name: name.trim(), description: description.trim() || null, groups: payloadGroups }, { onSuccess: onDone })
		} else {
			createSet({ name: name.trim(), description: description.trim() || null, kitchenId, groups: payloadGroups }, { onSuccess: onDone })
		}
	}

	return (
		<div className="space-y-4 rounded-md border p-4">
			<div className="space-y-2">
				<Label htmlFor="group-set-name">Nome do conjunto</Label>
				<Input id="group-set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Café da manhã, Ceia e lanches" />
			</div>

			<div className="space-y-2">
				<Label htmlFor="group-set-description">Descrição (opcional)</Label>
				<Input id="group-set-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para que serve este conjunto" />
			</div>

			<div className="space-y-2">
				<Label>Grupos, na ordem de leitura do cardápio</Label>
				<div className="space-y-1.5">
					{groups.map((group, index) => (
						<div key={`${group.key}-${index}`} className="flex items-center gap-1.5">
							<span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
							<Input
								value={group.label}
								onChange={(e) => setGroups(groups.map((g, i) => (i === index ? { ...g, label: e.target.value } : g)))}
								placeholder="Ex: Salada, Pães, Lanche"
								className="h-8"
							/>
							<Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => move(index, -1)} aria-label="Subir grupo">
								<ArrowUp className="size-3.5" />
							</Button>
							<Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => move(index, 1)} aria-label="Descer grupo">
								<ArrowDown className="size-3.5" />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8 text-muted-foreground hover:text-destructive"
								onClick={() => setGroups(groups.filter((_, i) => i !== index))}
								aria-label="Remover grupo"
							>
								<X className="size-3.5" />
							</Button>
						</div>
					))}
				</div>
				<Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setGroups([...groups, { key: "", label: "" }])}>
					<Plus className="size-3.5" />
					Adicionar grupo
				</Button>
				{duplicateKey && <p className="text-sm text-destructive">Dois grupos com o mesmo nome técnico ({duplicateKey.key}). Mude um dos rótulos.</p>}
				{isEditing && (
					<p className="text-xs text-muted-foreground">
						Remover um grupo não apaga preparação nenhuma: as que estavam nele passam a aparecer numa coluna própria, fora do conjunto, para serem recolocadas.
					</p>
				)}
			</div>

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancelar
				</Button>
				<Button type="button" onClick={submit} disabled={!canSave || isPending}>
					{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
					{isEditing ? "Salvar conjunto" : "Criar conjunto"}
				</Button>
			</div>
		</div>
	)
}

export function MenuGroupSetManager({ open, onClose, kitchenId }: { open: boolean; onClose: () => void; kitchenId: number | null }) {
	const { can } = usePBAC()
	const { data: sets, isLoading } = useMenuGroupSets(kitchenId)
	const { mutate: deleteSet } = useDeleteMenuGroupSet()
	const [editing, setEditing] = useState<{ set: MenuGroupSetRow; mode: "edit" | "duplicate" } | null>(null)
	const [creating, setCreating] = useState(false)

	const canEditGlobal = can("global", 2)
	const canEditLocal = kitchenId != null && can("kitchen", 2, { type: "kitchen", id: kitchenId })
	const canEdit = (set: MenuGroupSetRow) => (set.kitchen_id == null ? canEditGlobal : canEditLocal)
	// Criar e duplicar gravam no escopo DESTA tela (a cozinha, ou o global quando não
	// há cozinha). É essa a permissão que o servidor vai cobrar — oferecer o botão
	// por "tem alguma das duas" faz o usuário preencher o editor inteiro para tomar
	// um erro de permissão no fim.
	const canCreate = kitchenId != null ? canEditLocal : canEditGlobal

	const closeEditor = () => {
		setEditing(null)
		setCreating(false)
	}

	return (
		<Dialog
			open={open}
			onOpenChange={() => {
				closeEditor()
				onClose()
			}}
		>
			<DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Conjuntos de grupos</DialogTitle>
					<DialogDescription>
						Cada refeição usa um conjunto para montar as colunas do editor de cardápio. O almoço tem salada; o café, pães e frios; a ceia, lanche.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{creating || editing ? (
						<GroupSetEditor
							kitchenId={editing?.mode === "edit" ? editing.set.kitchen_id : kitchenId}
							initial={editing}
							onDone={closeEditor}
							onCancel={closeEditor}
						/>
					) : (
						<>
							{isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
							{sets?.map((set) => (
								<div key={set.id} className="rounded-md border p-3 space-y-2">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="text-subheading">{set.name}</p>
												{set.kitchen_id == null ? (
													<Badge variant="outline" className="text-xs gap-1">
														<Lock className="size-3" />
														Global
													</Badge>
												) : (
													<Badge variant="outline" className="text-xs">
														Desta cozinha
													</Badge>
												)}
											</div>
											{set.description && <p className="text-xs text-muted-foreground">{set.description}</p>}
										</div>
										<div className="flex items-center gap-1 shrink-0">
											{canCreate && (
												<Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing({ set, mode: "duplicate" })}>
													<Copy className="size-3.5" />
													Duplicar
												</Button>
											)}
											{canEdit(set) && (
												<Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ set, mode: "edit" })}>
													Editar
												</Button>
											)}
											{canEdit(set) && (
												<Button
													type="button"
													size="icon"
													variant="ghost"
													className="size-8 text-muted-foreground hover:text-destructive"
													aria-label={`Remover ${set.name}`}
													onClick={() => {
														// O domínio recusa conjunto em uso; o aviso aqui evita a ida e volta.
														if (window.confirm(`Remover o conjunto "${set.name}"? Refeições que o usam precisam ser apontadas para outro antes.`)) {
															deleteSet({ groupSetId: set.id })
														}
													}}
												>
													<Trash2 className="size-3.5" />
												</Button>
											)}
										</div>
									</div>
									<div className="flex flex-wrap gap-1.5">
										{set.groups.map((g) => (
											<Badge key={g.id} variant="secondary" className="text-xs font-normal">
												{g.label}
											</Badge>
										))}
									</div>
								</div>
							))}
							{sets?.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">Nenhum conjunto disponível.</p>}
						</>
					)}
				</div>

				{!creating && !editing && (
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Fechar
						</Button>
						{canCreate && (
							<Button type="button" className="gap-1.5" onClick={() => setCreating(true)}>
								<Plus className="size-4" />
								Novo conjunto
							</Button>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	)
}
