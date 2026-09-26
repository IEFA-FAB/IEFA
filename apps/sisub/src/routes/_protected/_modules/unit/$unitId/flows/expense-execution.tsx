import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FlowView } from "@/components/features/flows/FlowView"
import { PageHeader } from "@/components/layout/PageHeader"
import { useExpenseExecutionStatus } from "@/hooks/data/useExpenseExecution"
import { buildExpenseExecutionSteps } from "@/lib/flows/expense-execution"

/**
 * GESTÃO UNIDADE — Fluxo "Executar despesa"
 * URL: /unit/:unitId/flows/expense-execution
 *
 * Da contratação de origem ao SIAFI. O rancho registra o fato quando ele acontece (a entrega sem
 * nota, a OF de emergência); aqui aparece o que ficou para trás, com a tela que resolve.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/flows/expense-execution")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: ExpenseExecutionFlowPage,
	head: () => ({ meta: [{ name: "description", content: "Fluxo guiado da execução da despesa do rancho" }] }),
})

function ExpenseExecutionFlowPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { data, isLoading, isError } = useExpenseExecutionStatus(unitId)
	const href = `/unit/${unitId}/flows/expense-execution`

	return (
		<div className="space-y-6">
			<PageHeader
				title="Executar despesa"
				description="Da contratação que sustenta cada NE até a NS e a OB. Nada aqui trava a cozinha: cada etapa mostra o que ficou para trás e leva à tela que resolve."
			/>
			{isLoading ? (
				<div className="h-64 animate-pulse rounded-xl border bg-muted" aria-hidden="true" />
			) : isError || !data ? (
				<p className="text-body text-destructive">Não foi possível ler o estado da execução.</p>
			) : (
				<FlowView steps={buildExpenseExecutionSteps(data)} origin={{ href, label: "Executar despesa" }} />
			)}
		</div>
	)
}
