import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, Edit, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeletedTemplates, useDeleteTemplate, useRestoreTemplate } from "@/hooks/data/useTemplates"
import { fetchMenuTemplatesFn } from "@/server/templates.fn"

/**
 * GLOBAL-03 — Planos Semanais Modelo (SDAB)
 * URL: /global/weekly-plans
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: WeeklyPlansPage,
	head: () => ({
		meta: [{ title: "Planos Semanais Modelo - SISUB" }, { name: "description", content: "Templates de cardápio semanal para todas as unidades" }],
	}),
})

function WeeklyPlansPage() {
	// Busca apenas templates globais (kitchen_id = null)
	const {
		data: templates,
		isLoading,
		isError,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: ["menu_templates", null],
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId: null } }),
		staleTime: 5 * 60 * 1000,
	})

	// Escrita no catálogo global é nível 2. Mostrar Novo/Editar/Remover a quem só lê levava a um
	// clique que termina em erro de permissão.
	const { can } = usePBAC()
	const canWrite = can("global", 2)

	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()
	const { mutate: restoreTemplate, isPending: isRestoring } = useRestoreTemplate()
	// Lixeira do catálogo global. A tela prometia recuperação "na lixeira", mas a única lixeira do
	// app vivia no Planejamento de uma cozinha e nunca listava plano global: excluir aqui era, na
	// prática, definitivo.
	const {
		data: deletedPlans,
		isError: deletedError,
		refetch: refetchDeleted,
		isRefetching: deletedRefetching,
	} = useDeletedTemplates(null, { enabled: canWrite })

	const handleDelete = (id: string, name: string) => {
		if (window.confirm(`Tem certeza que deseja remover o plano "${name}"?\n\nEle vai para a lixeira no fim desta página e pode ser restaurado de lá.`)) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Planos Semanais Modelo">
				{canWrite && (
					<Button
						nativeButton={false}
						size="sm"
						render={
							<Link to="/global/weekly-plans/new">
								<Plus className="size-4 mr-2" />
								Novo Plano
							</Link>
						}
					/>
				)}
			</PageHeader>

			<div>
				{isLoading ? (
					<div className="flex justify-center p-12">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : isError ? (
					<QueryErrorState message="Não foi possível carregar os planos semanais." onRetry={() => refetch()} isRetrying={isRefetching} />
				) : !templates || templates.length === 0 ? (
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<CalendarDays className="size-10 mx-auto text-muted-foreground" />
						<p className="text-subheading text-muted-foreground">Nenhum plano semanal modelo cadastrado.</p>
						<p className="text-xs text-muted-foreground">
							{canWrite ? "Crie um plano para que as unidades possam importá-lo para o calendário local." : "Você tem acesso de leitura ao catálogo global."}
						</p>
						{canWrite && (
							<Button
								nativeButton={false}
								variant="outline"
								size="sm"
								className="mt-2"
								render={<Link to="/global/weekly-plans/new">Criar primeiro plano</Link>}
							/>
						)}
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Nome</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-28 text-center">Preparações</TableHead>
									{canWrite && <TableHead className="w-32 text-right">Ações</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{templates.map((template) => (
									<TableRow key={template.id}>
										<TableCell className="text-subheading">{template.name}</TableCell>
										<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
										<TableCell className="text-center">
											<Badge variant="secondary" className="font-mono text-xs">
												{template.recipe_count || 0}
											</Badge>
										</TableCell>
										{canWrite && (
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
										)}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>

			{canWrite && (deletedError || (deletedPlans && deletedPlans.length > 0)) && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Trash2 className="size-4 text-muted-foreground" />
						<h2 className="text-subheading">Lixeira</h2>
						{deletedPlans && deletedPlans.length > 0 && (
							<Badge variant="secondary" className="text-xs">
								{deletedPlans.length}
							</Badge>
						)}
					</div>
					{deletedError ? (
						<QueryErrorState message="Não foi possível carregar a lixeira." onRetry={() => refetchDeleted()} isRetrying={deletedRefetching} />
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Nome</TableHead>
										<TableHead className="w-48">Removido em</TableHead>
										<TableHead className="w-32 text-right">Ação</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{deletedPlans?.map((plan) => (
										<TableRow key={plan.id}>
											<TableCell className="text-muted-foreground">{plan.name}</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{plan.deleted_at ? format(new Date(plan.deleted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
											</TableCell>
											<TableCell className="text-right">
												<Button size="sm" variant="outline" onClick={() => restoreTemplate(plan.id)} disabled={isRestoring}>
													<RefreshCcw className="size-3.5 mr-1.5" />
													Restaurar
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
