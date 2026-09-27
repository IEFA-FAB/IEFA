import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { FileText, Plus, ShoppingCart } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useDeleteQuantityEstimate, useQuantityEstimateList } from "@/hooks/data/useQuantityEstimate"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: ProcurementIndexPage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie os anexos quantitativos do Termo de Referência da unidade" }],
	}),
})

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	completed: "Concluído",
	archived: "Arquivado",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
	draft: "secondary",
	completed: "default",
	archived: "outline",
}

function isWizardInProgress(quantityEstimate: { wizard_step: number | null }) {
	return quantityEstimate.wizard_step !== null
}

function ProcurementIndexPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)

	const { data: quantityEstimates, isLoading } = useQuantityEstimateList(unitId)
	const { mutate: deleteQuantityEstimate, isPending: isDeleting } = useDeleteQuantityEstimate()

	const handleDelete = (quantityEstimateId: string, title: string) => {
		if (window.confirm(`Remover o anexo "${title}"? Esta ação não pode ser desfeita.`)) {
			deleteQuantityEstimate(quantityEstimateId)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Anexos Quantitativos do TR"
				description="Quantitativos de aquisição de suprimentos que a unidade leva ao Termo de Referência. A ata de registro de preços só existe depois da licitação homologada."
			>
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/unit/$unitId/quantity-estimates/new" params={{ unitId: unitIdStr as string }}>
							<Plus className="size-4 mr-2" />
							Novo anexo
						</Link>
					}
				/>
			</PageHeader>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-24 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
					))}
				</div>
			) : !quantityEstimates || quantityEstimates.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-14 text-center">
						<ShoppingCart className="size-12 text-muted-foreground mb-4" aria-hidden="true" />
						<p className="text-subheading text-muted-foreground">Nenhum anexo quantitativo criado ainda.</p>
						<p className="text-sm text-muted-foreground mt-1">Crie um anexo para calcular os quantitativos de aquisição do Termo de Referência.</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-4"
							nativeButton={false}
							render={
								<Link to="/unit/$unitId/quantity-estimates/new" params={{ unitId: unitIdStr as string }}>
									<Plus className="size-4 mr-2" />
									Criar primeiro anexo
								</Link>
							}
						/>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{quantityEstimates.map((quantityEstimate) => (
						<Card key={quantityEstimate.id} className="hover:border-primary/30 transition-colors">
							<CardHeader className="pb-2">
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<CardTitle className="text-base flex items-center gap-2">
											<FileText className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
											{quantityEstimate.title}
										</CardTitle>
										{quantityEstimate.notes && <CardDescription className="mt-1 line-clamp-2">{quantityEstimate.notes}</CardDescription>}
									</div>
									{isWizardInProgress(quantityEstimate) ? (
										<Badge variant="secondary" className="bg-info/15 text-info">
											Preenchendo (passo {quantityEstimate.wizard_step}/5)
										</Badge>
									) : (
										<Badge variant={STATUS_VARIANTS[quantityEstimate.status] || "secondary"}>
											{STATUS_LABELS[quantityEstimate.status] || quantityEstimate.status}
										</Badge>
									)}
								</div>
							</CardHeader>
							<CardContent className="pb-3">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										Criado em {new Date(quantityEstimate.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
									</p>
									<div className="flex items-center gap-2">
										{isWizardInProgress(quantityEstimate) ? (
											<Button
												size="sm"
												nativeButton={false}
												render={
													<Link
														to="/unit/$unitId/quantity-estimates/new"
														params={{ unitId: unitIdStr as string }}
														search={{ step: quantityEstimate.wizard_step ?? 1, draft: quantityEstimate.id }}
													>
														Continuar
													</Link>
												}
											/>
										) : (
											<Button
												size="sm"
												variant="outline"
												nativeButton={false}
												render={
													<Link
														to="/unit/$unitId/quantity-estimates/$quantityEstimateId"
														params={{ unitId: unitIdStr as string, quantityEstimateId: quantityEstimate.id }}
													>
														Ver anexo
													</Link>
												}
											/>
										)}
										<Button
											size="sm"
											variant="ghost"
											className="text-destructive hover:text-destructive"
											onClick={() => handleDelete(quantityEstimate.id, quantityEstimate.title)}
											disabled={isDeleting}
										>
											Remover
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
