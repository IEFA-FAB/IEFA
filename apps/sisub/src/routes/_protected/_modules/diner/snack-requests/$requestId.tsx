import type { SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { requesterCanCancel } from "@iefa/sisub-domain/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { CancelSnackRequestDialog } from "@/components/features/diner/snack-requests/CancelSnackRequestDialog"
import { SnackRequestDetailView } from "@/components/features/diner/snack-requests/SnackRequestDetailView"
import { SnackRequestPrintButton } from "@/components/features/diner/snack-requests/SnackRequestPrint"
import { SnackStatusBadge } from "@/components/features/diner/snack-requests/SnackStatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mySnackRequestQueryOptions } from "@/hooks/data/useSnackRequests"

export const Route = createFileRoute("/_protected/_modules/diner/snack-requests/$requestId")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: MySnackRequestPage,
	head: () => ({
		meta: [{ title: "Pedido de Lanche - SISUB" }, { name: "description", content: "Detalhe do pedido de lanche" }],
	}),
})

function MySnackRequestPage() {
	const { requestId } = Route.useParams()
	const { data: request, isLoading, error } = useQuery(mySnackRequestQueryOptions(requestId))

	const backButton = (
		<Button
			variant="outline"
			size="sm"
			nativeButton={false}
			render={
				<Link to="/diner/snack-requests">
					<ArrowLeft className="size-4" aria-hidden />
					Meus pedidos
				</Link>
			}
		/>
	)

	if (isLoading) {
		return (
			<div className="space-y-6" aria-hidden>
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-96 w-full" />
			</div>
		)
	}

	if (error || !request) {
		return (
			<div className="space-y-6">
				<PageHeader title="Pedido de lanche">{backButton}</PageHeader>
				<Alert variant="destructive">
					<AlertTitle>Não foi possível abrir o pedido</AlertTitle>
					<AlertDescription>{error instanceof Error ? error.message : "Pedido não encontrado."}</AlertDescription>
				</Alert>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title={request.mission_description}
				badge={
					<span className="flex items-center gap-1.5">
						<SnackStatusBadge status={request.status} />
						{request.is_late && <Badge variant="warning">Fora do prazo</Badge>}
					</span>
				}
			>
				{backButton}
				<SnackRequestPrintButton request={request} />
				{requesterCanCancel(request.status as SnackRequestStatus) && (
					<CancelSnackRequestDialog requestId={request.id} missionDescription={request.mission_description} />
				)}
			</PageHeader>
			<SnackRequestDetailView request={request} />
		</div>
	)
}
