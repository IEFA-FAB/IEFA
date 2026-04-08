import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { CalendarRange, Edit, Plus, Trash2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Eventos
 * Lista os cardápios de eventos especiais da cozinha do escopo atual.
 * Esses templates (template_type='event') alimentam o Step 2 da Ata de Registro de Preços.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: EventsPage,
	head: () => ({
		meta: [{ title: "Eventos - SISUB" }, { name: "description", content: "Gerencie cardápios de eventos especiais da sua cozinha" }],
	}),
})

function EventsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const { data: templates, isLoading } = useMenuTemplates(kitchenId)
	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()

	const eventTemplates = templates?.filter((t) => t.kitchen_id !== null && t.template_type === "event") ?? []

	const handleDelete = (id: string, name: string) => {
		if (window.confirm(`Tem certeza que deseja remover o evento "${name}"?\n\nEle poderá ser recuperado na lixeira do Planejamento.`)) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Eventos" description="Cardápios de refeições especiais que compõem o Step 2 da Ata de Registro de Preços.">
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link to="/kitchen/$kitchenId/events/new" params={{ kitchenId: kitchenIdStr as string }}>
								<Plus className="h-4 w-4 mr-2" />
								Novo Evento
							</Link>
						}
					/>
				</div>
			</PageHeader>

			<div>
				<div className="flex items-center gap-2 mb-3">
					<CalendarRange className="w-4 h-4 text-muted-foreground" />
					<h2 className="text-sm font-semibold">Cardápios de Eventos</h2>
					<Badge variant="outline" className="text-xs">
						Selecionáveis na licitação
					</Badge>
				</div>

				{isLoading ? (
					<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Carregando eventos...</div>
				) : eventTemplates.length === 0 ? (
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<CalendarRange className="h-10 w-10 mx-auto text-muted-foreground" />
						<p className="text-sm font-medium text-muted-foreground">Nenhum evento criado ainda.</p>
						<p className="text-xs text-muted-foreground max-w-sm mx-auto">
							Crie cardápios para datas comemorativas, formaturas, visitas e outras refeições especiais. Eles serão selecionáveis na composição das Atas de
							Registro de Preços.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-2"
							nativeButton={false}
							render={
								<Link to="/kitchen/$kitchenId/events/new" params={{ kitchenId: kitchenIdStr as string }}>
									<Plus className="w-4 h-4 mr-2" />
									Criar primeiro evento
								</Link>
							}
						/>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Nome do Evento</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-28 text-center">Preparações</TableHead>
									<TableHead className="w-32 text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{eventTemplates.map((template) => (
									<TableRow key={template.id}>
										<TableCell className="font-medium">{template.name}</TableCell>
										<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
										<TableCell className="text-center">
											<Badge variant="secondary" className="font-mono text-xs">
												{template.recipe_count || 0}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-1">
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																size="icon"
																variant="ghost"
																nativeButton={false}
																render={
																	<Link to="/kitchen/$kitchenId/events/$eventId" params={{ kitchenId: kitchenIdStr as string, eventId: template.id }}>
																		<Edit className="w-4 h-4" />
																	</Link>
																}
															/>
														}
													></TooltipTrigger>
													<TooltipContent>Editar</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger
														render={
															<Button size="icon" variant="ghost" onClick={() => handleDelete(template.id, template.name ?? "")} disabled={isDeleting}>
																<Trash2 className="w-4 h-4 text-destructive" />
															</Button>
														}
													></TooltipTrigger>
													<TooltipContent>Remover</TooltipContent>
												</Tooltip>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</div>
	)
}
