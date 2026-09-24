import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { MySnackRequestsEmpty, MySnackRequestsList } from "@/components/features/diner/snack-requests/MySnackRequestsList"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mySnackRequestsQueryOptions } from "@/hooks/data/useSnackRequests"

export const Route = createFileRoute("/_protected/_modules/diner/snack-requests/")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: MySnackRequestsPage,
	head: () => ({
		meta: [{ name: "description", content: "Pedidos de Lanche de Bordo e de Apoio" }],
	}),
})

function MySnackRequestsPage() {
	const { data: requests, isLoading, isError, error } = useQuery(mySnackRequestsQueryOptions())

	return (
		<div className="space-y-6">
			<PageHeader title="Pedidos de Lanche" description="Lanche de Bordo (missão aérea) e Lanche de Apoio (missão terrestre) pedidos por você.">
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/diner/snack-requests/new">
							<Plus className="size-4" aria-hidden />
							Novo pedido
						</Link>
					}
				/>
			</PageHeader>

			{isLoading ? (
				<div className="space-y-3" aria-hidden>
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
				</div>
			) : isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível carregar seus pedidos</AlertTitle>
					<AlertDescription>{error instanceof Error ? error.message : "Tente novamente em instantes."}</AlertDescription>
				</Alert>
			) : !requests || requests.length === 0 ? (
				<MySnackRequestsEmpty />
			) : (
				<MySnackRequestsList requests={requests} />
			)}
		</div>
	)
}
