import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FlowHubCard } from "@/components/features/flows/FlowHubCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { useExpenseExecutionStatus } from "@/hooks/data/useExpenseExecution"
import { useProcurementPlanningStatus } from "@/hooks/data/useProcurementFlows"
import { buildExpenseExecutionSteps } from "@/lib/flows/expense-execution"
import { buildProcurementPlanningSteps } from "@/lib/flows/procurement-planning"

/**
 * GESTÃO UNIDADE — Fluxos
 * URL: /unit/:unitId/flows
 *
 * Roteiros que levam de um objetivo ("planejar a contratação") até o fim, passando pelas telas
 * que já existem e mostrando o que falta em cada etapa.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/flows/")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: UnitFlowsPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxos guiados da Gestão Unidade" }] }),
})

function UnitFlowsPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { data } = useProcurementPlanningStatus(unitId)
	const { data: execution } = useExpenseExecutionStatus(unitId)
	return (
		<div className="space-y-6">
			<PageHeader title="Fluxos" description="Escolha o que você quer fazer; o fluxo mostra o que falta e leva a cada tela na ordem certa." />
			<FlowHubCard
				title="Planejar contratação"
				description="Dos cardápios das cozinhas aos documentos do processo: previsão de demanda, segmentação, anexo quantitativo e pesquisa de preços."
				href={`/unit/${unitId}/flows/procurement-planning`}
				steps={data ? buildProcurementPlanningSteps(data) : null}
			/>
			<FlowHubCard
				title="Executar despesa"
				description="Da contratação de origem ao SIAFI: NE sem contratação, designação, OF sem empenho, entregas sem nota, liquidação e o que o SIAFI trouxe antes da hora."
				href={`/unit/${unitId}/flows/expense-execution`}
				steps={execution ? buildExpenseExecutionSteps(execution) : null}
			/>
		</div>
	)
}
