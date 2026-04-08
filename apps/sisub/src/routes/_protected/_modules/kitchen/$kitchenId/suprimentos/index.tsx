import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { FileText, Plus, Send, ShoppingCart } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useDeleteKitchenDraft, useKitchenDrafts, useSendKitchenDraft } from "@/hooks/data/useKitchenDraft"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/suprimentos/")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: KitchenSuprimentosPage,
	head: () => ({
		meta: [{ title: "Suprimentos - SISUB" }, { name: "description", content: "Gerencie rascunhos de suprimentos para a ata" }],
	}),
})

const STATUS_LABELS: Record<string, string> = {
	pending: "Rascunho",
	sent: "Enviado",
	reviewed: "Revisado",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	pending: "secondary",
	sent: "default",
	reviewed: "outline",
}

function KitchenSuprimentosPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const { data: drafts, isLoading } = useKitchenDrafts(kitchenId)
	const { mutate: sendDraft, isPending: isSending } = useSendKitchenDraft()
	const { mutate: deleteDraft, isPending: isDeleting } = useDeleteKitchenDraft()

	const handleSend = (draftId: string, title: string) => {
		if (window.confirm(`Enviar o rascunho "${title}" para a gestão da unidade?`)) {
			sendDraft(draftId)
		}
	}

	const handleDelete = (draftId: string, title: string) => {
		if (window.confirm(`Remover o rascunho "${title}"?`)) {
			deleteDraft(draftId)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Suprimentos" description="Crie e envie rascunhos de necessidades para a gestão da unidade.">
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/suprimentos/new" params={{ kitchenId: kitchenIdStr as string }}>
							<Plus className="h-4 w-4 mr-2" />
							Novo Rascunho
						</Link>
					}
				/>
			</PageHeader>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2].map((i) => (
						<div key={i} className="h-24 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
					))}
				</div>
			) : !drafts || drafts.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-14 text-center">
						<ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
						<p className="font-medium text-muted-foreground">Nenhum rascunho criado ainda.</p>
						<p className="text-sm text-muted-foreground mt-1">Crie um rascunho com os templates que você quer sugerir para a próxima ata.</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-4"
							nativeButton={false}
							render={
								<Link to="/kitchen/$kitchenId/suprimentos/new" params={{ kitchenId: kitchenIdStr as string }}>
									<Plus className="h-4 w-4 mr-2" />
									Criar primeiro rascunho
								</Link>
							}
						/>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{drafts.map((draft) => (
						<Card key={draft.id}>
							<CardHeader className="pb-2">
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<CardTitle className="text-base flex items-center gap-2">
											<FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
											{draft.title}
										</CardTitle>
										{draft.notes && <CardDescription className="mt-1 line-clamp-2">{draft.notes}</CardDescription>}
									</div>
									<Badge variant={STATUS_VARIANTS[draft.status] || "secondary"}>{STATUS_LABELS[draft.status] || draft.status}</Badge>
								</div>
							</CardHeader>
							<CardContent className="pb-3">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										{draft.selections.length} {draft.selections.length === 1 ? "seleção" : "seleções"}
										{draft.updated_at
											? ` · Atualizado ${new Date(draft.updated_at).toLocaleDateString("pt-BR")}`
											: ` · Criado ${new Date(draft.created_at).toLocaleDateString("pt-BR")}`}
									</p>
									<div className="flex items-center gap-2">
										{draft.status === "pending" && (
											<>
												<Button
													size="sm"
													variant="outline"
													nativeButton={false}
													render={
														<Link to="/kitchen/$kitchenId/suprimentos/$draftId" params={{ kitchenId: kitchenIdStr as string, draftId: draft.id }}>
															Editar
														</Link>
													}
												/>
												<Button
													size="sm"
													onClick={() => handleSend(draft.id, draft.title)}
													disabled={isSending || draft.selections.length === 0}
													className="gap-1.5"
												>
													<Send className="h-3.5 w-3.5" aria-hidden="true" />
													Enviar
												</Button>
											</>
										)}
										<Button
											size="sm"
											variant="ghost"
											className="text-destructive hover:text-destructive"
											onClick={() => handleDelete(draft.id, draft.title)}
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
