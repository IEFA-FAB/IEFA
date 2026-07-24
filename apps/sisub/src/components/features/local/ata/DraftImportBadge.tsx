import { Download, Send } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { DraftWithSelections, KitchenSelectionState, TemplateSelection } from "@/types/domain/ata"

interface DraftImportBadgeProps {
	draft: DraftWithSelections
	kitchenState: KitchenSelectionState
	onImport: (kitchenId: number, templateSelections: TemplateSelection[], eventSelections: TemplateSelection[]) => void
}

export function DraftImportBadge({ draft, kitchenState, onImport }: DraftImportBadgeProps) {
	const handleImport = () => {
		const templateSelections: TemplateSelection[] = []
		const eventSelections: TemplateSelection[] = []

		for (const sel of draft.selections) {
			const item: TemplateSelection = {
				templateId: sel.template.id,
				templateName: sel.template.name || "",
				repetitions: sel.repetitions,
			}
			// Eventos e exceções vão para o balde "Eventos / Refeições Especiais".
			if (sel.template.template_type === "event" || sel.template.template_type === "exception") {
				eventSelections.push(item)
			} else {
				templateSelections.push(item)
			}
		}

		onImport(kitchenState.kitchenId, templateSelections, eventSelections)
	}

	return (
		<Alert className="border-info/30 bg-info/10">
			<Send className="size-4 text-info" aria-hidden="true" />
			<AlertTitle className="text-info text-subheading">Rascunho enviado pela cozinha</AlertTitle>
			<AlertDescription className="flex items-center justify-between gap-2 mt-1">
				<span className="text-sm text-info">
					<strong>{kitchenState.kitchenName}</strong> enviou o rascunho <strong>"{draft.title}"</strong> com {draft.selections.length}{" "}
					{draft.selections.length === 1 ? "seleção" : "seleções"}.
				</span>
				<Button size="sm" variant="outline" onClick={handleImport} className="shrink-0 border-info/30 text-info hover:bg-info/10">
					<Download className="size-3.5 mr-1.5" aria-hidden="true" />
					Importar Rascunho
				</Button>
			</AlertDescription>
		</Alert>
	)
}
