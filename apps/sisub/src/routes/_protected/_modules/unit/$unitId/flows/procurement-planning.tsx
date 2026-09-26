import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FlowView } from "@/components/features/flows/FlowView"
import { PageHeader } from "@/components/layout/PageHeader"
import { useProcurementPlanningStatus } from "@/hooks/data/useProcurementFlows"
import { buildProcurementPlanningSteps } from "@/lib/flows/procurement-planning"

/**
 * GESTÃO UNIDADE — Fluxo "Planejar contratação"
 * URL: /unit/:unitId/flows/procurement-planning
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/flows/procurement-planning")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: ProcurementPlanningFlowPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxo guiado do planejamento da contratação de gêneros" }] }),
})

function ProcurementPlanningFlowPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { data, isLoading, isError } = useProcurementPlanningStatus(unitId)
	const href = `/unit/${unitId}/flows/procurement-planning`

	return (
		<div className="space-y-6">
			<PageHeader
				title="Planejar contratação"
				description="Do que as cozinhas vão produzir até os documentos que vão para o ETP e o TR. Cada etapa diz o que falta e leva à tela que resolve."
			/>
			{isLoading ? (
				<div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
			) : isError || !data ? (
				<p className="text-sm text-destructive">Não foi possível ler o estado do planejamento.</p>
			) : (
				<FlowView steps={buildProcurementPlanningSteps(data)} origin={{ href, label: "Planejar contratação" }} />
			)}
		</div>
	)
}
