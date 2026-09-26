import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { SegmentationEditor } from "@/components/features/local/procurement/SegmentationEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { useSegmentationOverview } from "@/hooks/data/useProcurementSegments"

/**
 * GESTÃO UNIDADE — Segmentação das contratações
 * URL: /unit/:unitId/segments
 *
 * A OM diz quais processos de compra conduz separados (Carnes em março, Estocáveis em junho) e o
 * que entra em cada um. O anexo quantitativo passa a ser de uma contratação: planejar todas as
 * produções e comprar só um segmento delas.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/segments")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: SegmentsPage,
	head: () => ({ meta: [{ name: "description", content: "Contratações da unidade: o que entra em cada processo de compra e quando" }] }),
})

function SegmentsPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { can } = usePBAC()
	const { data: overview, isLoading, isError } = useSegmentationOverview(unitId)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Segmentação das contratações"
				description="Cada contratação é um processo de compra separado, no calendário de contratação da OM. Diga quais pastas do catálogo entram em cada uma; o anexo quantitativo de uma contratação leva só os itens dela."
			/>
			{isLoading ? (
				<div className="h-48 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
			) : isError || !overview ? (
				<p className="text-sm text-destructive">Não foi possível carregar a segmentação.</p>
			) : (
				<SegmentationEditor unitId={unitId} overview={overview} canEdit={can("unit", 2, { type: "unit", id: unitId })} />
			)}
		</div>
	)
}
