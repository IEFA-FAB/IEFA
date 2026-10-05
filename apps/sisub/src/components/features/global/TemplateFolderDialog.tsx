import { Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateTemplateFolder, useUpdateTemplateFolder } from "@/hooks/data/useTemplateFolders"
import type { CatalogFolder } from "@/lib/template-catalog-tree"

/** Criar pasta (raiz ou subpasta) ou editar nome e descrição de uma existente. */
export type TemplateFolderDialogState =
	| { mode: "create"; templateType: "event" | "apoio"; parent: CatalogFolder | null }
	| { mode: "edit"; templateType: "event" | "apoio"; folder: CatalogFolder }

interface TemplateFolderDialogProps {
	state: TemplateFolderDialogState | null
	onClose: () => void
}

/**
 * Pasta do catálogo global. A pasta só organiza: o nome e a descrição são da SDAB ("Padrão B —
 * Institucional/Intermediário", "Opções de maior elaboração.") e o sistema não tira regra deles.
 */
export function TemplateFolderDialog({ state, onClose }: TemplateFolderDialogProps) {
	return (
		<Dialog open={state != null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">{state && <TemplateFolderForm key={formKey(state)} state={state} onClose={onClose} />}</DialogContent>
		</Dialog>
	)
}

function formKey(state: TemplateFolderDialogState): string {
	return state.mode === "edit" ? `edit:${state.folder.id}` : `create:${state.parent?.id ?? "root"}`
}

function TemplateFolderForm({ state, onClose }: { state: TemplateFolderDialogState; onClose: () => void }) {
	const initial = state.mode === "edit" ? state.folder : null
	const [name, setName] = useState(initial?.name ?? "")
	const [description, setDescription] = useState(initial?.description ?? "")
	const { mutate: create, isPending: isCreating } = useCreateTemplateFolder()
	const { mutate: update, isPending: isUpdating } = useUpdateTemplateFolder()
	const isPending = isCreating || isUpdating

	const parentName = state.mode === "create" ? state.parent?.name : null
	const title = state.mode === "edit" ? "Editar pasta" : parentName ? `Nova subpasta em "${parentName}"` : "Nova pasta"

	const submit = () => {
		const trimmed = name.trim()
		if (!trimmed) return
		const done = { onSuccess: () => onClose() }
		if (state.mode === "edit")
			update(
				{
					folderId: state.folder.id,
					name: trimmed,
					description: description.trim() || null,
					// O que a tela viu: se outra pessoa mudou a pasta antes, o servidor recusa.
					expected: { name: state.folder.name, description: state.folder.description },
				},
				done
			)
		else create({ templateType: state.templateType, parentId: state.parent?.id, name: trimmed, description: description.trim() || undefined }, done)
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				submit()
			}}
			className="space-y-4"
		>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>
					{state.mode === "create" && !state.parent
						? state.templateType === "event"
							? "Ex.: o padrão (Padrão A — Especial/Solene). Dentro dele, uma subpasta por formato de serviço."
							: "Ex.: a família (Lanche de Bordo). Dentro dela, uma subpasta por classe."
						: "A pasta só organiza o catálogo; ela não muda nenhuma regra dos modelos."}
				</DialogDescription>
			</DialogHeader>
			<Field>
				<FieldLabel htmlFor="template-folder-name">Nome</FieldLabel>
				<Input id="template-folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
			</Field>
			<Field>
				<FieldLabel htmlFor="template-folder-description">Descrição (opcional)</FieldLabel>
				<Textarea id="template-folder-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
				<FieldDescription>Aparece ao lado do nome na árvore.</FieldDescription>
			</Field>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					Cancelar
				</Button>
				<Button type="submit" disabled={isPending || !name.trim()}>
					{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
					{state.mode === "edit" ? "Salvar" : "Criar pasta"}
				</Button>
			</DialogFooter>
		</form>
	)
}
