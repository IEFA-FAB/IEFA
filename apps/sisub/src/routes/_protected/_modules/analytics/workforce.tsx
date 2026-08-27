import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { formatReferenceDate } from "@/components/features/workforce/labels"
import { WorkforceMatrixTable } from "@/components/features/workforce/WorkforceMatrixTable"
import { WorkforceNetworkPanel } from "@/components/features/workforce/WorkforceNetworkPanel"
import { WorkforceSummary } from "@/components/features/workforce/WorkforceSummary"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWorkforceNetworkFn } from "@/server/workforce.fn"

export const Route = createFileRoute("/_protected/_modules/analytics/workforce")({
	beforeLoad: (opts) => requirePermission(opts, "analytics", 2),
	component: WorkforceNetworkPage,
	head: () => ({
		meta: [
			{ title: "Efetivo da Rede" },
			{ name: "description", content: "Matriz de efetivo dos ranchos consolidada por ELO, com as lacunas de cobertura técnica" },
		],
	}),
})

function WorkforceNetworkPage() {
	const queryKey = ["sisub", "workforce", "network"] as const
	const { data: network, isLoading } = useQuery({
		queryKey,
		queryFn: () => fetchWorkforceNetworkFn({ data: { surveyId: null } }),
	})

	return (
		<div className="space-y-6">
			<PageHeader title="Efetivo da Rede" description="Guarnição dos ranchos por ELO, quadro e especialidade">
				{network?.survey && (
					<div className="flex items-center gap-2">
						<Badge variant="outline">{formatReferenceDate(network.survey.reference_date)}</Badge>
						{network.survey.status === "closed" && <Badge variant="secondary">Encerrada</Badge>}
					</div>
				)}
			</PageHeader>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton className="h-28 w-full" />
					<Skeleton className="h-96 w-full" />
				</div>
			)}

			{!isLoading && network && !network.survey && (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma competência registrada</EmptyTitle>
						<EmptyDescription>Abra uma coleta de efetivo para começar a acompanhar a guarnição dos ranchos.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			{!isLoading && network?.survey && (
				<>
					<WorkforceSummary summary={network.summary} scopeLabel="da rede" />
					<WorkforceNetworkPanel network={network} />
					{/* A SDAB não preenche pelo painel da rede: a escrita é do gestor do ELO. */}
					<WorkforceMatrixTable matrix={network} canEdit={false} queryKey={queryKey} />
				</>
			)}
		</div>
	)
}
