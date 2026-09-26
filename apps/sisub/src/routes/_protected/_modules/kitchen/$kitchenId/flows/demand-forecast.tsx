import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FlowView } from "@/components/features/flows/FlowView"
import { PageHeader } from "@/components/layout/PageHeader"
import { useDemandForecastStatus } from "@/hooks/data/useProcurementFlows"
import { demandForecastSteps } from "@/lib/flows/demand-forecast"

/**
 * GESTÃO COZINHA — Fluxo "Prever demanda para compra"
 * URL: /kitchen/:kitchenId/flows/demand-forecast
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/flows/demand-forecast")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: DemandForecastFlowPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxo guiado da previsão de demanda para compra" }] }),
})

function DemandForecastFlowPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const { data, isLoading, isError } = useDemandForecastStatus(kitchenId)
	const href = `/kitchen/${kitchenId}/flows/demand-forecast`

	return (
		<div className="space-y-6">
			<PageHeader
				title="Prever demanda para compra"
				description="Deixe a unidade em condição de calcular o que comprar: cardápios completos, eventos e apoios previstos, e a previsão enviada."
			/>
			{isLoading ? (
				<div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
			) : isError || !data ? (
				<p className="text-sm text-destructive">Não foi possível ler o estado da previsão.</p>
			) : (
				<FlowView steps={demandForecastSteps(data)} origin={{ href, label: "Prever demanda para compra" }} />
			)}
		</div>
	)
}
