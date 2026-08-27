import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { formatReferenceDate } from "@/components/features/workforce/labels"
import { WorkforceMatrixTable } from "@/components/features/workforce/WorkforceMatrixTable"
import { WorkforceSummary } from "@/components/features/workforce/WorkforceSummary"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
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

	const queryKey = ["sisub", "workforce", "matrix", id] as const
	const { data: matrix, isLoading } = useQuery({
		queryKey,
		queryFn: () => fetchWorkforceMatrixFn({ data: { unitId: id, surveyId: null } }),
	})

	const canEdit = can("local-analytics", 2, { type: "unit", id }) || can("unit", 2, { type: "unit", id })

	return (
		<div className="space-y-6">
			<PageHeader title="Efetivo dos Ranchos" description="Quantitativo de militares por quadro e especialidade, por rancho">
				{matrix?.survey && (
					<div className="flex items-center gap-2">
						<Badge variant="outline">{formatReferenceDate(matrix.survey.reference_date)}</Badge>
						{matrix.survey.status === "closed" && <Badge variant="secondary">Encerrada</Badge>}
					</div>
				)}
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
