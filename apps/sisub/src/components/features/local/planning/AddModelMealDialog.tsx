import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { toast } from "@/components/ui/toast"
import { useTemplateFolders } from "@/hooks/data/useTemplateFolders"
import { templateQueryOptions, useMenuTemplates } from "@/hooks/data/useTemplates"
import { catalogFolderPath } from "@/lib/template-catalog-tree"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * "Refeição de um modelo": acrescenta ao evento da cozinha as refeições de um modelo (global ou
 * desta cozinha). É a mesma composição do "Montar evento", para um evento que já existe.
 */
export function AddModelMealDialog({
	open,
	onOpenChange,
	kitchenId,
	currentTemplateId,
	onPick,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	kitchenId: number
	/** O próprio evento sai da lista. */
	currentTemplateId: string
	onPick: (model: MenuTemplateWithItems) => void
}) {
	const queryClient = useQueryClient()
	const { data: templates } = useMenuTemplates(open ? kitchenId : null)
	const { data: folders } = useTemplateFolders(open ? "event" : null)
	const [templateId, setTemplateId] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	const options = (templates ?? [])
		.filter((t) => t.template_type === "event" && t.id !== currentTemplateId)
		.map((t) => {
			const path = t.kitchen_id == null ? catalogFolderPath(folders, t.folder_id) : null
			return {
				value: t.id,
				label: t.name ?? "Modelo",
				hint: t.kitchen_id == null ? (path ?? "Modelo da SDAB") : "Evento desta cozinha",
				keywords: path ?? undefined,
			}
		})
		.toSorted((a, b) => (a.hint ?? "").localeCompare(b.hint ?? "", "pt-BR") || a.label.localeCompare(b.label, "pt-BR"))

	const close = (next: boolean) => {
		if (!next) setTemplateId(null)
		onOpenChange(next)
	}

	const confirm = async () => {
		if (!templateId) return
		setIsLoading(true)
		try {
			const model = await queryClient.fetchQuery(templateQueryOptions(templateId))
			if (!model) throw new Error("modelo não encontrado")
			onPick(model)
			close(false)
		} catch (error) {
			toast.error(`Não foi possível carregar o modelo: ${error instanceof Error ? error.message : "erro"}`)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Refeição de um modelo</DialogTitle>
					<DialogDescription>
						As refeições do modelo entram neste evento, copiadas, com grupos, preparações e proporções. Mudar o modelo depois não mexe neste evento.
					</DialogDescription>
				</DialogHeader>
				<Field>
					<FieldLabel htmlFor="add-model-meal">Modelo</FieldLabel>
					<SearchableSelect
						id="add-model-meal"
						value={templateId}
						onValueChange={setTemplateId}
						options={options}
						searchPlaceholder="Buscar por nome ou pasta…"
					/>
					<FieldDescription>Do modelo da SDAB não vem efetivo nem pax: informe o desta cozinha na refeição.</FieldDescription>
				</Field>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => close(false)}>
						Cancelar
					</Button>
					<Button type="button" disabled={!templateId || isLoading} onClick={confirm}>
						{isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
						Acrescentar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
