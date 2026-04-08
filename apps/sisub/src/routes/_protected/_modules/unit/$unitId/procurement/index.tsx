import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { FileText, Plus, ShoppingCart } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAtaList, useDeleteAta } from "@/hooks/data/useAta"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: ProcurementIndexPage,
	head: () => ({
		meta: [{ title: "Atas de Registro de Preços" }, { name: "description", content: "Gerencie as atas de aquisição da unidade" }],
	}),
})

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	published: "Publicada",
	archived: "Arquivada",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
	draft: "secondary",
	published: "default",
	archived: "outline",
}

function ProcurementIndexPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)

	const { data: atas, isLoading } = useAtaList(unitId)
	const { mutate: deleteAta, isPending: isDeleting } = useDeleteAta()

	const handleDelete = (ataId: string, title: string) => {
		if (window.confirm(`Remover a ata "${title}"? Esta ação não pode ser desfeita.`)) {
			deleteAta(ataId)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Atas de Registro de Preços" description="Gerencie as atas de aquisição de suprimentos da unidade.">
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/unit/$unitId/procurement/new" params={{ unitId: unitIdStr as string }}>
							<Plus className="h-4 w-4 mr-2" />
							Nova ata
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
			) : !atas || atas.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-14 text-center">
						<ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
						<p className="font-medium text-muted-foreground">Nenhuma ata criada ainda.</p>
						<p className="text-sm text-muted-foreground mt-1">Crie uma nova ata para calcular e registrar os quantitativos de aquisição.</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-4"
							nativeButton={false}
							render={
								<Link to="/unit/$unitId/procurement/new" params={{ unitId: unitIdStr as string }}>
									<Plus className="h-4 w-4 mr-2" />
									Criar primeira ata
								</Link>
							}
						/>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{atas.map((ata) => (
						<Card key={ata.id} className="hover:border-primary/30 transition-colors">
							<CardHeader className="pb-2">
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<CardTitle className="text-base flex items-center gap-2">
											<FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
											{ata.title}
										</CardTitle>
										{ata.notes && <CardDescription className="mt-1 line-clamp-2">{ata.notes}</CardDescription>}
									</div>
									<Badge variant={STATUS_VARIANTS[ata.status] || "secondary"}>{STATUS_LABELS[ata.status] || ata.status}</Badge>
								</div>
							</CardHeader>
							<CardContent className="pb-3">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										Criada em {new Date(ata.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
									</p>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											nativeButton={false}
											render={
												<Link to="/unit/$unitId/procurement/$ataId" params={{ unitId: unitIdStr as string, ataId: ata.id }}>
													Ver ata
												</Link>
											}
										/>
										<Button
											size="sm"
											variant="ghost"
											className="text-destructive hover:text-destructive"
											onClick={() => handleDelete(ata.id, ata.title)}
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
