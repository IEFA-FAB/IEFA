import { Link } from "@tanstack/react-router"
import { ClipboardCopy, Download, FileSpreadsheet, FileText, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { useUpdateQuantityEstimateDocumentSettings } from "@/hooks/data/useProcurementDocuments"
import { buildAnnexTable, chunkTable, copyTableToClipboard } from "@/lib/annex-table"
import type { QuantityEstimateAnnexRow } from "@/lib/quantity-estimate-annex"

/**
 * Documentos do anexo para o processo: a tabela para colar no Anexo do TR, o CSV, a memória de
 * cálculo das quantidades (ETP, item 7 — Lei 14.133/2021, art. 18, § 1º, IV) e o relatório de
 * pesquisa de preços (IN SEGES/ME 65/2021, art. 3º). Todos saem do mesmo anexo.
 */
export function AnnexDocumentsCard({
	unitId,
	quantityEstimateId,
	rows,
	isBudgetConfidential,
	canEdit,
	onDownloadCsv,
}: {
	unitId: string
	quantityEstimateId: string
	rows: QuantityEstimateAnnexRow[]
	isBudgetConfidential: boolean
	canEdit: boolean
	onDownloadCsv: () => void
}) {
	const settings = useUpdateQuantityEstimateDocumentSettings(quantityEstimateId)
	const parts = chunkTable(buildAnnexTable(rows, { confidential: isBudgetConfidential }))

	const copy = async (index: number) => {
		try {
			const kind = await copyTableToClipboard(parts[index])
			toast.success(
				kind === "html"
					? `Tabela${parts.length > 1 ? ` (parte ${index + 1} de ${parts.length})` : ""} copiada: cole no Anexo do TR.`
					: "Copiada como texto tabulado: este navegador não copia tabela formatada."
			)
		} catch {
			toast.error("O navegador não deixou copiar. Use o CSV.")
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<span className="flex items-center gap-2">
						<ScrollText className="size-5" aria-hidden="true" />
						Documentos do processo
					</span>
				</CardTitle>
				<CardDescription>Tudo sai deste anexo e se confere entre si: a tabela vai para o TR, a memória e a pesquisa vão aos autos.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<Field orientation="horizontal">
					<Switch
						id="quantity-estimate-confidential"
						checked={isBudgetConfidential}
						disabled={!canEdit || settings.isPending}
						onCheckedChange={(checked) => settings.mutate(checked)}
					/>
					<div>
						<FieldLabel htmlFor="quantity-estimate-confidential">Orçamento sigiloso</FieldLabel>
						<FieldDescription>
							A tabela do TR sai sem preço e valor (Lei 14.133/2021, art. 24). O relatório de pesquisa continua completo, para os autos.
						</FieldDescription>
					</div>
				</Field>

				<div className="space-y-2">
					<p className="text-subheading">Anexo do Termo de Referência</p>
					<div className="flex flex-wrap gap-2">
						{parts.map((part, index) => (
							<Button key={part.body[0]?.[0] ?? index} size="sm" onClick={() => copy(index)}>
								<ClipboardCopy data-icon="inline-start" aria-hidden="true" />
								{parts.length === 1 ? "Copiar tabela para o TR" : `Copiar linhas ${part.body[0]?.[0]}–${part.body.at(-1)?.[0]}`}
							</Button>
						))}
						<Button size="sm" variant="outline" onClick={onDownloadCsv}>
							<Download data-icon="inline-start" aria-hidden="true" />
							Baixar CSV
						</Button>
					</div>
					{parts.length > 1 && (
						<p className="text-xs text-muted-foreground">Com muitas linhas o editor do TR trava ao colar; a tabela sai em partes com o cabeçalho.</p>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/quantity-estimates/print/calculation-memory/$quantityEstimateId" params={{ unitId, quantityEstimateId }}>
								<FileText data-icon="inline-start" aria-hidden="true" />
								Memória de cálculo das quantidades
							</Link>
						}
					/>
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/quantity-estimates/print/price-research/$quantityEstimateId" params={{ unitId, quantityEstimateId }}>
								<FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
								Relatório de pesquisa de preços
							</Link>
						}
					/>
				</div>
			</CardContent>
		</Card>
	)
}
