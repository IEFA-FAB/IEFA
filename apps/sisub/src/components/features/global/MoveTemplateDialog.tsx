import { Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useSetTemplateFolder } from "@/hooks/data/useTemplateFolders"
import { type CatalogFolder, catalogFolderOptions } from "@/lib/template-catalog-tree"

interface MoveTemplateDialogProps {
	template: { id: string; name: string | null; folder_id: string | null } | null
	folders: readonly CatalogFolder[] | undefined
	onClose: () => void
}

/**
 * "Mover para…": escolhe a pasta do modelo. Combobox com busca porque os caminhos começam igual
 * ("Padrão B › Café da Manhã", "Padrão B › Coquetel") e o typeahead do Select casa pelo começo.
 */
export function MoveTemplateDialog({ template, folders, onClose }: MoveTemplateDialogProps) {
	return (
		<Dialog open={template != null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				{template && <MoveTemplateForm key={template.id} template={template} folders={folders} onClose={onClose} />}
			</DialogContent>
		</Dialog>
	)
}

function MoveTemplateForm({
	template,
	folders,
	onClose,
}: {
	template: NonNullable<MoveTemplateDialogProps["template"]>
	folders: MoveTemplateDialogProps["folders"]
	onClose: () => void
}) {
	const [folderId, setFolderId] = useState<string | null>(template.folder_id)
	const { mutate: move, isPending } = useSetTemplateFolder()
	const options = catalogFolderOptions(folders)

	return (
		<>
			<DialogHeader>
				<DialogTitle>Mover "{template.name}"</DialogTitle>
				<DialogDescription>Duas opções na mesma pasta precisam de nomes diferentes.</DialogDescription>
			</DialogHeader>
			<Field>
				<FieldLabel htmlFor="move-template-folder">Pasta</FieldLabel>
				<SearchableSelect
					id="move-template-folder"
					value={folderId}
					onValueChange={setFolderId}
					options={options}
					clearLabel="Sem pasta"
					searchPlaceholder="Buscar pasta…"
				/>
				<FieldDescription>Modelos sem pasta ficam no fim do catálogo, em "Sem pasta".</FieldDescription>
			</Field>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					Cancelar
				</Button>
				<Button
					type="button"
					disabled={isPending || folderId === template.folder_id}
					onClick={() => move({ templateId: template.id, folderId, expectedFolderId: template.folder_id }, { onSuccess: () => onClose() })}
				>
					{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
					Mover
				</Button>
			</DialogFooter>
		</>
	)
}
