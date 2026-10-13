// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): ações do cabeçalho do hub.

import { FileText, Presentation, UploadCloud } from "lucide-react"
import { Button } from "#/components/ui/button"

interface AuditorHeaderActionsProps {
	hasData: boolean
	selectedMonth: string
	canEdit: boolean
	onPresent: () => void
	onOpenNote: () => void
	onImport: () => void
}

export function AuditorHeaderActions({ hasData, selectedMonth, canEdit, onPresent, onOpenNote, onImport }: AuditorHeaderActionsProps) {
	// `aria-label` fixo nos três: abaixo de `sm` o rótulo some e o botão fica
	// só com o ícone, sem nome acessível nenhum.
	return (
		<>
			{/* A nota é leitura da série: nível 1 basta, como o resto do painel. */}
			{hasData && selectedMonth && (
				<>
					<Button variant="outline" size="sm" aria-label="Apresentar" onClick={onPresent}>
						<Presentation className="w-4 h-4" />
						<span className="hidden sm:inline">Apresentar</span>
					</Button>
					<Button variant="outline" size="sm" aria-label="Nota analítica" onClick={onOpenNote}>
						<FileText className="w-4 h-4" />
						<span className="hidden sm:inline">Nota analítica</span>
					</Button>
				</>
			)}
			{canEdit && (
				<Button size="sm" aria-label="Importar Excel" onClick={onImport}>
					<UploadCloud className="w-4 h-4" />
					<span className="hidden sm:inline">Importar Excel</span>
				</Button>
			)}
		</>
	)
}
