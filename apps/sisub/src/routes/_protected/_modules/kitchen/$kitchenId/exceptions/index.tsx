import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { Edit, Plus, Sandwich, Trash2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Exceções
 * Lista os cardápios de exceções previsíveis da cozinha (lanches de bordo, cafés de reunião).
 * Esses templates (template_type='exception') alimentam o Step 2 da Ata de Registro de Preços,
 * multiplicados pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: ExceptionsPage,
	head: () => ({
		meta: [{ title: "Exceções - SISUB" }, { name: "description", content: "Gerencie cardápios de exceções previsíveis (lanches de bordo, cafés de reunião)" }],
	}),
})

function ExceptionsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const { data: templates, isLoading } = useMenuTemplates(kitchenId)
	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()

	const exceptionTemplates = templates?.filter((t) => t.kitchen_id !== null && t.template_type === "exception") ?? []

	const handleDelete = (id: string, name: string) => {
		if (window.confirm(`Tem certeza que deseja remover a exceção "${name}"?\n\nEla poderá ser recuperada na lixeira do Planejamento.`)) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Exceções"
				description="Refeições previsíveis fora da rotina semanal — lanches de bordo, cafés de reunião. Compõem a Ata de Registro de Preços pela recorrência mensal."
			>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link to="/kitchen/$kitchenId/exceptions/new" params={{ kitchenId: kitchenIdStr as string }}>
								<Plus className="size-4 mr-2" />
								Nova Exceção
							</Link>
						}
					/>
				</div>
			</PageHeader>

			<div>
				<div className="flex items-center gap-2 mb-3">
					<Sandwich className="size-4 text-muted-foreground" />
					<h2 className="text-subheading">Cardápios de Exceção</h2>
					<Badge variant="outline" className="text-xs">
						Selecionáveis na licitação
					</Badge>
				</div>

				{isLoading ? (
					<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Carregando exceções...</div>
				) : exceptionTemplates.length === 0 ? (
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<Sandwich className="size-10 mx-auto text-muted-foreground" />
						<p className="text-subheading text-muted-foreground">Nenhuma exceção criada ainda.</p>
						<p className="text-xs text-muted-foreground max-w-sm mx-auto">
							Crie um molde por tipo de exceção previsível (ex.: "Lanche de Bordo", "Café de Reunião") e informe quantas vezes por mês ele ocorre. O custeio da
							Ata multiplica automaticamente.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-2"
							nativeButton={false}
							render={
								<Link to="/kitchen/$kitchenId/exceptions/new" params={{ kitchenId: kitchenIdStr as string }}>
									<Plus className="size-4 mr-2" />
									Criar primeira exceção
								</Link>
							}
						/>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Nome da Exceção</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-32 text-center">Ocorrências/mês</TableHead>
									<TableHead className="w-28 text-center">Preparações</TableHead>
									<TableHead className="w-32 text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{exceptionTemplates.map((template) => (
									<TableRow key={template.id}>
										<TableCell className="text-subheading">{template.name}</TableCell>
										<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
										<TableCell className="text-center">
											<Badge variant="outline" className="font-mono text-xs">
												{template.expected_monthly_occurrences ?? "—"}
											</Badge>
										</TableCell>
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
																	<Link
																		to="/kitchen/$kitchenId/exceptions/$exceptionId"
																		params={{ kitchenId: kitchenIdStr as string, exceptionId: template.id }}
																	>
																		<Edit className="size-4" />
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
																<Trash2 className="size-4 text-destructive" />
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
