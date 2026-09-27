import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FlowHubCard } from "@/components/features/flows/FlowHubCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { useDemandForecastStatus, useExecutionReviewStatus } from "@/hooks/data/useProcurementFlows"
import { buildDemandForecastSteps } from "@/lib/flows/demand-forecast"
import { buildExecutionReviewSteps } from "@/lib/flows/execution-review"

/**
 * GESTÃO COZINHA — Fluxos
 * URL: /kitchen/:kitchenId/flows
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/flows/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenFlowsPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxos guiados da Gestão Cozinha" }] }),
})

function KitchenFlowsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const { data } = useDemandForecastStatus(kitchenId)
	const { data: execution } = useExecutionReviewStatus(kitchenId)
	return (
		<div className="space-y-6">
			<PageHeader title="Fluxos" description="Escolha o que você quer fazer; o fluxo mostra o que falta e leva a cada tela na ordem certa." />
			<FlowHubCard
				title="Prever demanda para compra"
				description="Cardápios, eventos e apoios em ordem para a unidade calcular o que comprar, e o envio da previsão."
				href={`/kitchen/${kitchenId}/flows/demand-forecast`}
				steps={data ? buildDemandForecastSteps(data) : null}
			/>
			<FlowHubCard
				title="Revisar a execução"
				description="O que o turno resolveu no dia sem esperar o planejamento: preparações incluídas, fichas provisórias e incompletas."
				href={`/kitchen/${kitchenId}/flows/execution-review`}
				steps={execution ? buildExecutionReviewSteps(execution) : null}
			/>
		</div>
	)
}
