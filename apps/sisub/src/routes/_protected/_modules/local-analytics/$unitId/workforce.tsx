import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { WorkforceMatrixTable } from "@/components/features/workforce/WorkforceMatrixTable"
import { WorkforceSummary } from "@/components/features/workforce/WorkforceSummary"
import { WorkforceSurveyControls } from "@/components/features/workforce/WorkforceSurveyControls"
import { PageHeader } from "@/components/layout/PageHeader"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWorkforceMatrixFn } from "@/server/workforce.fn"

export const Route = createFileRoute("/_protected/_modules/local-analytics/$unitId/workforce")({
	beforeLoad: (opts) => requirePermission(opts, "local-analytics", 1),
	component: WorkforcePage,
	head: () => ({
		meta: [{ title: "Efetivo dos Ranchos" }, { name: "description", content: "Matriz de efetivo por quadro e especialidade dos ranchos da unidade" }],
	}),
})

function WorkforcePage() {
	const { unitId } = Route.useParams()
	const { can } = usePBAC()
	const id = Number(unitId)

	// null = competência mais recente; o servidor resolve.
	const [surveyId, setSurveyId] = useState<string | null>(null)
	const queryKey = ["sisub", "workforce", "matrix", id, surveyId] as const
	const { data: matrix, isLoading } = useQuery({
		queryKey,
		queryFn: () => fetchWorkforceMatrixFn({ data: { unitId: id, surveyId } }),
	})

	const canEdit = can("local-analytics", 2, { type: "unit", id }) || can("unit", 2, { type: "unit", id })

	return (
		<div className="space-y-6">
			<PageHeader title="Efetivo dos Ranchos" description="Quantitativo de militares por quadro e especialidade, por rancho">
				<WorkforceSurveyControls current={matrix?.survey ?? null} onSelect={setSurveyId} canManage={false} invalidate={[queryKey]} />
			</PageHeader>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton className="h-28 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
			)}

			{!isLoading && matrix && !matrix.survey && (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma competência aberta</EmptyTitle>
						<EmptyDescription>A administração do sistema ainda não abriu uma coleta de efetivo.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			{!isLoading && matrix?.survey && (
				<>
					<WorkforceSummary summary={matrix.summary} scopeLabel="nesta unidade" />
					<WorkforceMatrixTable matrix={matrix} canEdit={canEdit} queryKey={queryKey} />
				</>
			)}
		</div>
	)
}
