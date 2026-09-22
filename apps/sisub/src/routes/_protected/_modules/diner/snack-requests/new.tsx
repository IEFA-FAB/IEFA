import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, ChefHat } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { SnackRequestForm } from "@/components/features/diner/snack-requests/SnackRequestForm"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { snackOrderingContextQueryOptions } from "@/hooks/data/useSnackRequests"

export const Route = createFileRoute("/_protected/_modules/diner/snack-requests/new")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: NewSnackRequestPage,
	head: () => ({
		meta: [{ title: "Novo Pedido de Lanche - SISUB" }, { name: "description", content: "Requisição de Lanche de Bordo ou de Apoio (Anexo E)" }],
	}),
})

function NewSnackRequestPage() {
	const { data: context, isLoading, error } = useQuery(snackOrderingContextQueryOptions())

	return (
		<div className="space-y-6">
			<PageHeader title="Novo pedido de lanche" description="Descreva a missão, confira a sugestão da calculadora e escolha os padrões da cozinha apoiadora.">
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
			</PageHeader>

			{isLoading ? (
				<div className="space-y-4" aria-hidden>
					<Skeleton className="h-96 w-full" />
					<Skeleton className="h-48 w-full" />
				</div>
			) : error || !context ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível abrir o formulário</AlertTitle>
					<AlertDescription>{error instanceof Error ? error.message : "Tente novamente em instantes."}</AlertDescription>
				</Alert>
			) : context.kitchens.length === 0 ? (
				<Card>
					<CardContent>
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ChefHat aria-hidden />
								</EmptyMedia>
								<EmptyTitle>Nenhuma cozinha publicou padrões de lanche ainda</EmptyTitle>
								<EmptyDescription>
									O pedido é feito sobre os padrões de Lanche de Bordo ou de Apoio que a cozinha apoiadora cadastrou. Enquanto nenhuma cozinha publicar, fale
									direto com a Seção de Subsistência da sua OM.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<SnackRequestForm context={context} />
			)}
		</div>
	)
}
