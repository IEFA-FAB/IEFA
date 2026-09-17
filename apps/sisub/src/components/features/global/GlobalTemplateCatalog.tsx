import { useQuery } from "@tanstack/react-query"
import { Link, type LinkOptions } from "@tanstack/react-router"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, Loader2, type LucideIcon, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { usePBAC } from "@/auth/pbac"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeletedTemplates, useDeleteTemplate, useRestoreTemplate } from "@/hooks/data/useTemplates"
import type { OccasionMenuType } from "@/lib/occasion-menu"
import { queryKeys } from "@/lib/query-keys"
import { fetchMenuTemplatesFn } from "@/server/templates.fn"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

interface GlobalTemplateCatalogProps {
	templateType: "weekly" | OccasionMenuType
	title: string
	description?: string
	icon: LucideIcon
	/** Singular no meio da frase, com artigo: "o plano", "o evento", "a exceção". */
	nounWithArticle: string
	newLabel: string
	emptyMessage: string
	/** Frase do estado vazio para quem pode escrever. */
	emptyHint: string
	newLink: LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Listagem de um tipo de modelo do catálogo global (`kitchen_id = null`) — planos semanais,
 * eventos ou exceções —, com a lixeira do próprio catálogo.
 * Acesso: leitura com `global:1`; criar, editar, remover e restaurar exigem `global:2`.
 */
export function GlobalTemplateCatalog({
	templateType,
	title,
	description,
	icon: Icon,
	nounWithArticle,
	newLabel,
	emptyMessage,
	emptyHint,
	newLink,
	editorLink,
}: GlobalTemplateCatalogProps) {
	const isException = templateType === "exception"

	const {
		data: allTemplates,
		isLoading,
		isError,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: queryKeys.templates.list(null),
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId: null } }) as Promise<TemplateWithItemCounts[]>,
		staleTime: 5 * 60 * 1000,
	})
	// A listagem global traz os três tipos juntos. Sem o filtro, um evento global aparecia como
	// "plano semanal" e abria no editor de grade de 7 dias.
	const templates = allTemplates?.filter((t) => t.template_type === templateType)

	// Escrita no catálogo global é nível 2. Mostrar Novo/Editar/Remover a quem só lê levava a um
	// clique que termina em erro de permissão.
	const { can } = usePBAC()
	const canWrite = can("global", 2)

	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()
	const { mutate: restoreTemplate, isPending: isRestoring } = useRestoreTemplate()
	// Lixeira do catálogo global. A tela prometia recuperação "na lixeira", mas a única lixeira do
	// app vivia no Planejamento de uma cozinha e nunca listava plano global: excluir aqui era, na
	// prática, definitivo.
	const { data: allDeleted, isError: deletedError, refetch: refetchDeleted, isRefetching: deletedRefetching } = useDeletedTemplates(null, { enabled: canWrite })
	const deleted = allDeleted?.filter((t) => t.template_type === templateType)

	const handleDelete = (id: string, name: string) => {
		if (
			window.confirm(
				`Tem certeza que deseja remover ${nounWithArticle} "${name}"?\n\nO item vai para a lixeira no fim desta página e pode ser restaurado de lá.`
			)
		) {
			deleteTemplate(id)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title={title} description={description}>
				{canWrite && (
					<Button
						nativeButton={false}
						size="sm"
						render={
							<Link {...newLink}>
								<Plus className="size-4 mr-2" />
								{newLabel}
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
					<QueryErrorState message="Não foi possível carregar o catálogo." onRetry={() => refetch()} isRetrying={isRefetching} />
				) : !templates || templates.length === 0 ? (
					<div className="rounded-md border border-dashed p-10 text-center space-y-3">
						<Icon className="size-10 mx-auto text-muted-foreground" />
						<p className="text-subheading text-muted-foreground">{emptyMessage}</p>
						<p className="text-xs text-muted-foreground">{canWrite ? emptyHint : "Você tem acesso de leitura ao catálogo global."}</p>
						{canWrite && (
							<Button
								nativeButton={false}
								variant="outline"
								size="sm"
								className="mt-2"
								render={
									<Link {...newLink}>
										<Plus className="size-4 mr-2" />
										{newLabel}
									</Link>
								}
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
									{isException && <TableHead className="w-32 text-center">Ocorrências/mês</TableHead>}
									<TableHead className="w-28 text-center">Preparações</TableHead>
									{canWrite && <TableHead className="w-32 text-right">Ações</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{templates.map((template) => (
									<TableRow key={template.id}>
										<TableCell className="text-subheading">{template.name}</TableCell>
										<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
										{isException && (
											<TableCell className="text-center">
												<Badge variant="outline" className="font-mono text-xs">
													{template.expected_monthly_occurrences ?? "—"}
												</Badge>
											</TableCell>
										)}
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
																		<Link {...editorLink(template.id)}>
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

			{canWrite && (deletedError || (deleted && deleted.length > 0)) && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Trash2 className="size-4 text-muted-foreground" />
						<h2 className="text-subheading">Lixeira</h2>
						{deleted && deleted.length > 0 && (
							<Badge variant="secondary" className="text-xs">
								{deleted.length}
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
									{deleted?.map((item) => (
										<TableRow key={item.id}>
											<TableCell className="text-muted-foreground">{item.name}</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{item.deleted_at ? format(new Date(item.deleted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
											</TableCell>
											<TableCell className="text-right">
												<Button size="sm" variant="outline" onClick={() => restoreTemplate(item.id)} disabled={isRestoring}>
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
