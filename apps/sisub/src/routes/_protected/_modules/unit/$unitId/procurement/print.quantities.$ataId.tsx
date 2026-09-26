import { createFileRoute, useParams } from "@tanstack/react-router"
import { useMemo } from "react"
import { requirePermission } from "@/auth/pbac"
import { PrintSheet } from "@/components/features/local/procurement/PrintSheet"
import { QuantityMemoryDocument } from "@/components/features/local/procurement/QuantityMemoryDocument"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useAtaDetails } from "@/hooks/data/useAta"
import { useQuantityMemory } from "@/hooks/data/useProcurementDocuments"
import { buildDraftAnnexRows, buildSnapshotAnnexRows } from "@/lib/ata-annex"
import { ataItemToNeed } from "@/lib/ata-utils"

/**
 * GESTÃO UNIDADE — Memória de cálculo das quantidades do anexo (impressão / PDF)
 * URL: /unit/:unitId/procurement/print/quantities/:ataId
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/print/quantities/$ataId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: QuantityMemoryPrintPage,
	head: () => ({ meta: [{ name: "description", content: "Memória de cálculo das quantidades do anexo quantitativo" }] }),
})

function QuantityMemoryPrintPage() {
	const { unitId, ataId } = useParams({ strict: false }) as { unitId: string; ataId: string }
	const { data: ata, isLoading } = useAtaDetails(ataId)
	const { data: memory, isLoading: isLoadingMemory, isError } = useQuantityMemory(ataId)
	useCrumbLabel(ata ? `Memória de cálculo — ${ata.title}` : undefined)

	const settings = useMemo(
		() =>
			ata
				? {
						validityMonths: ata.validity_months,
						maxMarginPercent: ata.max_margin_percent,
						marginJustification: ata.margin_justification,
						minQuotePercent: Number(ata.min_quote_percent ?? 100),
					}
				: null,
		[ata]
	)
	const rows = useMemo(() => {
		if (!ata || !settings) return []
		if (ata.status === "draft") return buildDraftAnnexRows(ata.items.map(ataItemToNeed), settings)
		return ata.meta.snapshot ? buildSnapshotAnnexRows(ata.meta.snapshot.components, ata.items) : []
	}, [ata, settings])

	if (isLoading || isLoadingMemory) return <div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
	if (!ata || !settings || isError || !memory) return <p className="text-sm text-destructive">Não foi possível montar a memória de cálculo.</p>

	return (
		<PrintSheet back={{ unitId, ataId }}>
			<QuantityMemoryDocument
				title={ata.title}
				unitName={null}
				segmentName={null}
				status={ata.status}
				validityMonths={ata.validity_months}
				maxMarginPercent={settings.maxMarginPercent}
				minQuotePercent={settings.minQuotePercent}
				rows={rows}
				memory={memory}
			/>
		</PrintSheet>
	)
}
