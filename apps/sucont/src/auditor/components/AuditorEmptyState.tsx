// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): estado vazio da série.

import { FileSpreadsheet } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty"

interface AuditorEmptyStateProps {
	canEdit: boolean
	loadingAccess: boolean
	isPending: boolean
	onUpload: () => void
}

export function AuditorEmptyState({ canEdit, loadingAccess, isPending, onUpload }: AuditorEmptyStateProps) {
	return (
		<Empty className="mt-8">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<FileSpreadsheet />
				</EmptyMedia>
				<EmptyTitle>Nenhuma competência na base</EmptyTitle>
				<EmptyDescription>
					{canEdit
						? "Importe uma planilha. A série fica gravada e reabre sozinha nos próximos acessos."
						: !loadingAccess &&
							"Ainda não há competência gravada, e seu acesso é somente leitura. Importar a planilha exige nível 2 no módulo sucont — peça a um gestor da SUCONT-4."}
				</EmptyDescription>
			</EmptyHeader>
			{canEdit && (
				<EmptyContent>
					<Button onClick={onUpload}>{isPending ? "Gravando…" : "Carregar relatório"}</Button>
				</EmptyContent>
			)}
		</Empty>
	)
}
