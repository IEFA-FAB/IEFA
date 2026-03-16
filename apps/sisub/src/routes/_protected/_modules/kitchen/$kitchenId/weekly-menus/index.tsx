import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { CalendarDays, Edit, GitFork, Plus, Trash2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Cardápios Semanais
 * Lista os cardápios semanais locais da cozinha do escopo atual.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/weekly-menus/")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: WeeklyMenusPage,
	head: () => ({
		meta: [{ title: "Cardápios Semanais - SISUB" }, { name: "description", content: "Gerencie os cardápios semanais da sua cozinha" }],
	}),
})

function WeeklyMenusPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const { data: templates, isLoading } = useMenuTemplates(kitchenId)
	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()

	const globalTemplates = templates?.filter((t) => t.kitchen_id === null) || []
	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []

	const handleDelete = (id: string, name: string) => {
		if (window.confirm(`Tem certeza que deseja remover o cardápio semanal "${name}"?\n\nEle poderá ser recuperado na lixeira do Planejamento.`)) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Cardápios Semanais">
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link to="/kitchen/$kitchenId/weekly-menus/new" params={{ kitchenId: kitchenIdStr as string }}>
								<Plus className="h-4 w-4 mr-2" />
								Novo Cardápio Semanal
							</Link>
						}
					/>
				</div>
			</PageHeader>

			<div className="space-y-8">
				{/* Planos Globais da SDAB (somente leitura) */}
				{globalTemplates.length > 0 && (
					<div>
						<div className="flex items-center gap-2 mb-3">
							<CalendarDays className="w-4 h-4 text-muted-foreground" />
							<h2 className="text-sm font-semibold">Planos Globais da SDAB</h2>
							<Badge variant="outline" className="text-xs">
								Somente leitura · disponíveis para fork
							</Badge>
						</div>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Nome</TableHead>
										<TableHead>Descrição</TableHead>
										<TableHead className="w-28 text-center">Preparações</TableHead>
										<TableHead className="w-32 text-right">Ação</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{globalTemplates.map((template) => (
										<TableRow key={template.id}>
											<TableCell className="font-medium">{template.name}</TableCell>
											<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
											<TableCell className="text-center">
												<Badge variant="secondary" className="font-mono text-xs">
													{template.recipe_count || 0}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<Button
													size="sm"
													variant="outline"
													nativeButton={false}
													render={
														<Link to="/kitchen/$kitchenId/weekly-menus/new" params={{ kitchenId: kitchenIdStr as string }} search={{ forkFrom: template.id }}>
															<GitFork className="w-3.5 h-3.5 mr-1.5" />
															Forkar
														</Link>
													}
												/>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>
				)}

				{/* Cardápios Semanais Locais */}
				<div>
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2">
							<h2 className="text-sm font-semibold">Cardápios Semanais Locais</h2>
							<Badge variant="default" className="text-xs">
								Esta Cozinha
							</Badge>
						</div>
					</div>

					{isLoading ? (
						<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Carregando cardápios semanais...</div>
					) : localTemplates.length === 0 ? (
						<div className="rounded-md border border-dashed p-10 text-center space-y-3">
							<CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
							<p className="text-sm font-medium text-muted-foreground">Nenhum cardápio semanal criado ainda.</p>
							<p className="text-xs text-muted-foreground">Crie do zero ou forke um plano global da SDAB.</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-2"
								render={
									<Link to="/kitchen/$kitchenId/weekly-menus/new" params={{ kitchenId: kitchenIdStr as string }}>
										<Plus className="w-4 h-4 mr-2" />
										Criar primeiro cardápio semanal
									</Link>
								}
							/>
						</div>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Nome</TableHead>
										<TableHead>Origem</TableHead>
										<TableHead className="w-28 text-center">Preparações</TableHead>
										<TableHead className="w-32 text-right">Ações</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{localTemplates.map((template) => (
										<TableRow key={template.id}>
											<TableCell className="font-medium">{template.name}</TableCell>
											<TableCell>
												{template.base_template_id ? (
													<Badge variant="secondary" className="text-xs gap-1 font-normal">
														<GitFork className="w-3 h-3" />
														Fork de plano global
													</Badge>
												) : (
													<span className="text-xs text-muted-foreground">Local</span>
												)}
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
																	render={
																		<Link
																			to="/kitchen/$kitchenId/weekly-menus/$weeklyMenuId"
																			params={{
																				kitchenId: kitchenIdStr as string,
																				weeklyMenuId: template.id,
																			}}
																		>
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
		</div>
	)
}
