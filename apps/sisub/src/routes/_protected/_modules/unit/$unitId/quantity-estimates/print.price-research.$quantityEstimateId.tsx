import { createFileRoute, useParams } from "@tanstack/react-router"
import { Download, FilePlus2 } from "lucide-react"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { PriceResearchReportDocument } from "@/components/features/local/procurement/PriceResearchReportDocument"
import { PrintSheet } from "@/components/features/local/procurement/PrintSheet"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEmitPriceResearchReport, usePriceResearchReport } from "@/hooks/data/useProcurementDocuments"

/**
 * GESTÃO UNIDADE — Relatório de pesquisa de preços do anexo (impressão / PDF)
 * URL: /unit/:unitId/quantity-estimates/print/price-research/:quantityEstimateId
 *
 * Cada relatório é uma emissão registrada. Gerar nova emissão grava as pesquisas e os preços de
 * agora; abrir uma emissão antiga reproduz o documento dela, com a integridade conferida.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/print/price-research/$quantityEstimateId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: PriceResearchReportPage,
	head: () => ({ meta: [{ name: "description", content: "Relatório de pesquisa de preços do anexo quantitativo" }] }),
})

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

/** Baixa exatamente os bytes cujo SHA-256 está impresso (o CSV já traz o BOM). */
function downloadExact(filename: string, text: string) {
	const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	// Revogar no mesmo tick aborta o download no Firefox e no Safari (mesmo cuidado de downloadCsv).
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

function PriceResearchReportPage() {
	const { unitId, quantityEstimateId } = useParams({ strict: false }) as { unitId: string; quantityEstimateId: string }
	const { can } = usePBAC()
	const [emissionId, setEmissionId] = useState<string | null>(null)
	const { data: report, isLoading, isError } = usePriceResearchReport(quantityEstimateId, emissionId)
	const emit = useEmitPriceResearchReport(quantityEstimateId)
	const canEmit = can("unit", 2, { type: "unit", id: Number(unitId) })
	useCrumbLabel(report ? `Pesquisa de preços — ${report.list.title}` : "Pesquisa de preços")

	const emitButton = canEmit && (
		<Button size="sm" variant="outline" disabled={emit.isPending} onClick={() => emit.mutate(undefined, { onSuccess: () => setEmissionId(null) })}>
			<FilePlus2 data-icon="inline-start" aria-hidden="true" />
			{emit.isPending ? "Gerando…" : "Gerar nova emissão"}
		</Button>
	)

	if (isLoading) return <div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
	if (isError) return <p className="text-sm text-destructive">Não foi possível montar o relatório.</p>
	if (!report) {
		return (
			<Card>
				<CardContent className="space-y-3 py-8 text-center">
					<p className="text-sm text-muted-foreground">
						Este anexo ainda não tem relatório de pesquisa de preços. Gerar a primeira emissão grava as pesquisas e os preços de agora; o documento dela pode
						ser reaberto e conferido depois, mesmo que os preços mudem.
					</p>
					{emitButton}
				</CardContent>
			</Card>
		)
	}

	return (
		<PrintSheet
			back={{ unitId, quantityEstimateId }}
			toolbar={
				<>
					<Select value={report.emission.id} onValueChange={(next) => next && setEmissionId(next)}>
						<SelectTrigger className="w-64" aria-label="Emissão">
							<SelectValue>{`Emissão nº ${report.emission.sequence} · ${fmt(report.emission.emittedAt)}`}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{report.emissions.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									Emissão nº {e.sequence} · {fmt(e.emittedAt)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{emitButton}
					<Button size="sm" variant="outline" onClick={() => downloadExact(`serie-precos-emissao-${report.emission.sequence}.csv`, report.csv)}>
						<Download data-icon="inline-start" aria-hidden="true" />
						Série de preços (CSV)
					</Button>
				</>
			}
		>
			<PriceResearchReportDocument report={report} />
		</PrintSheet>
	)
}
