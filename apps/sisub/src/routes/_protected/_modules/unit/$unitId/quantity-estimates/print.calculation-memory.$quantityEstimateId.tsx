import { createFileRoute, useParams } from "@tanstack/react-router"
import { useMemo } from "react"
import { requirePermission } from "@/auth/pbac"
import { PrintSheet } from "@/components/features/local/procurement/PrintSheet"
import { QuantityMemoryDocument } from "@/components/features/local/procurement/QuantityMemoryDocument"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useQuantityMemory } from "@/hooks/data/useProcurementDocuments"
import { useQuantityEstimateDetails } from "@/hooks/data/useQuantityEstimate"
import { buildDraftAnnexRows, buildSnapshotAnnexRows } from "@/lib/quantity-estimate-annex"
import { quantityEstimateItemToNeed } from "@/lib/quantity-estimate-utils"

/**
 * GESTÃO UNIDADE — Memória de cálculo das quantidades do anexo (impressão / PDF)
 * URL: /unit/:unitId/quantity-estimates/print/calculation-memory/:quantityEstimateId
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/print/calculation-memory/$quantityEstimateId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: QuantityMemoryPrintPage,
	head: () => ({ meta: [{ name: "description", content: "Memória de cálculo das quantidades do anexo quantitativo" }] }),
})

function QuantityMemoryPrintPage() {
	const { unitId, quantityEstimateId } = useParams({ strict: false }) as { unitId: string; quantityEstimateId: string }
	const { data: quantityEstimate, isLoading } = useQuantityEstimateDetails(quantityEstimateId)
	const { data: memory, isLoading: isLoadingMemory, isError } = useQuantityMemory(quantityEstimateId)
	useCrumbLabel(quantityEstimate ? `Memória de cálculo — ${quantityEstimate.title}` : undefined)

	const settings = useMemo(
		() =>
			quantityEstimate
				? {
						validityMonths: quantityEstimate.validity_months,
						maxIncreasePercent: quantityEstimate.max_increase_percent,
						maxQuantityJustification: quantityEstimate.max_quantity_justification,
						minQuotePercent: Number(quantityEstimate.min_quote_percent ?? 100),
					}
				: null,
		[quantityEstimate]
	)
	const rows = useMemo(() => {
		if (!quantityEstimate || !settings) return []
		if (quantityEstimate.status === "draft") return buildDraftAnnexRows(quantityEstimate.items.map(quantityEstimateItemToNeed), settings)
		return quantityEstimate.meta.snapshot ? buildSnapshotAnnexRows(quantityEstimate.meta.snapshot.components, quantityEstimate.items) : []
	}, [quantityEstimate, settings])

	if (isLoading || isLoadingMemory) return <div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
	if (!quantityEstimate || !settings || isError || !memory) return <p className="text-sm text-destructive">Não foi possível montar a memória de cálculo.</p>

	return (
		<PrintSheet back={{ unitId, quantityEstimateId }}>
			<QuantityMemoryDocument
				title={quantityEstimate.title}
				unitName={null}
				segmentName={null}
				status={quantityEstimate.status}
				validityMonths={quantityEstimate.validity_months}
				maxIncreasePercent={settings.maxIncreasePercent}
				minQuotePercent={settings.minQuotePercent}
				rows={rows}
				memory={memory}
			/>
		</PrintSheet>
	)
}
