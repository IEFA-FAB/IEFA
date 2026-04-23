import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarDays, Edit, Loader2, Plus, Trash2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplate } from "@/hooks/data/useTemplates"
import { fetchMenuTemplatesFn } from "@/server/templates.fn"

/**
 * GLOBAL-03 — Planos Semanais Modelo (SDAB)
 * URL: /global/weekly-plans
 * Acesso: módulo "global" nível 1+
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	component: WeeklyPlansPage,
	head: () => ({
		meta: [{ title: "Planos Semanais Modelo - SISUB" }, { name: "description", content: "Templates de cardápio semanal para todas as unidades" }],
	}),
})

function WeeklyPlansPage() {
	// Busca apenas templates globais (kitchen_id = null)
	const { data: templates, isLoading } = useQuery({
		queryKey: ["menu_templates", null],
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId: null } }),
		staleTime: 5 * 60 * 1000,
	})

	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()

	const handleDelete = (id: string, name: string) => {
		if (window.confirm(`Tem certeza que deseja remover o plano "${name}"?\n\nEle poderá ser recuperado na lixeira.`)) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Planos Semanais Modelo">
				<Button
					nativeButton={false}
					size="sm"
					render={
						<Link to="/global/weekly-plans/new">
							<Plus className="h-4 w-4 mr-2" />
							Novo Plano
						</Link>
					}
				/>
			</PageHeader>

			<div>
				{isLoading ? (
					<div className="flex justify-center p-12">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				) : !templates || templates.length === 0 ? (
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
						<p className="text-sm font-medium text-muted-foreground">Nenhum plano semanal modelo cadastrado.</p>
						<p className="text-xs text-muted-foreground">Crie um plano para que as unidades possam importá-lo para o calendário local.</p>
						<Button
							nativeButton={false}
							variant="outline"
							size="sm"
							className="mt-2"
							render={<Link to="/global/weekly-plans/new">Criar primeiro plano</Link>}
						/>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Nome</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-28 text-center">Preparações</TableHead>
									<TableHead className="w-32 text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{templates.map((template) => (
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
																	<Link to="/global/weekly-plans/$planId" params={{ planId: template.id }}>
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
