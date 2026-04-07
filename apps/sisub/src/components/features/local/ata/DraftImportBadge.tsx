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
				defaultHeadcount: sel.template.default_headcount,
				repetitions: sel.repetitions,
			}
			if (sel.template.template_type === "event") {
				eventSelections.push(item)
			} else {
				templateSelections.push(item)
			}
		}

		onImport(kitchenState.kitchenId, templateSelections, eventSelections)
	}

	return (
		<Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
			<Send className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
			<AlertTitle className="text-blue-800 dark:text-blue-300 text-sm font-semibold">Rascunho enviado pela cozinha</AlertTitle>
			<AlertDescription className="flex items-center justify-between gap-2 mt-1">
				<span className="text-sm text-blue-700 dark:text-blue-400">
					<strong>{kitchenState.kitchenName}</strong> enviou o rascunho <strong>"{draft.title}"</strong> com {draft.selections.length}{" "}
					{draft.selections.length === 1 ? "seleção" : "seleções"}.
				</span>
				<Button
					size="sm"
					variant="outline"
					onClick={handleImport}
					className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
				>
					<Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
					Importar Rascunho
				</Button>
			</AlertDescription>
		</Alert>
	)
}
