import { useQuery } from "@tanstack/react-query"
import { Link, type LinkOptions, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
	ArrowDown,
	ArrowUp,
	Copy,
	Edit,
	FolderInput,
	FolderPlus,
	Loader2,
	type LucideIcon,
	MoreHorizontal,
	Pencil,
	Plus,
	RefreshCcw,
	Trash2,
} from "lucide-react"
import { useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { MoveTemplateDialog } from "@/components/features/global/MoveTemplateDialog"
import { TemplateFolderDialog, type TemplateFolderDialogState } from "@/components/features/global/TemplateFolderDialog"
import { SnackStandardBadges } from "@/components/features/local/planning/SnackStandardBadges"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { type CatalogFolderRow, TemplateCatalogTree } from "@/components/features/shared/TemplateCatalogTree"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplateFolder, useDuplicateTemplateAsVariant, useMoveTemplateFolder, useTemplateFolders } from "@/hooks/data/useTemplateFolders"
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
	/** Singular no meio da frase, com artigo: "o plano", "o evento", "o apoio". */
	nounWithArticle: string
	newLabel: string
	emptyMessage: string
	/** Frase do estado vazio para quem pode escrever. */
	emptyHint: string
	newLink: LinkOptions
	/** Novo modelo já dentro de uma pasta (evento e apoio). */
	newInFolderLink?: (folderId: string) => LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Listagem de um tipo de modelo do catálogo global (`kitchen_id = null`) — planos semanais,
 * eventos ou apoios —, com a lixeira do próprio catálogo.
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
	newInFolderLink,
	editorLink,
}: GlobalTemplateCatalogProps) {
	const navigate = useNavigate()
	// Ocorrências por mês não têm coluna: são quantidade da cozinha, e o modelo global não as tem.
	const isSupportMenu = templateType === "apoio"
	// Evento e apoio ficam em pastas da SDAB; o semanal segue em lista.
	const occasionType = templateType === "weekly" ? null : templateType
	const { data: folders, isError: foldersError } = useTemplateFolders(occasionType)
	const [folderDialog, setFolderDialog] = useState<TemplateFolderDialogState | null>(null)
	const [moving, setMoving] = useState<{ id: string; name: string | null; folder_id: string | null } | null>(null)
	const { mutate: moveFolder } = useMoveTemplateFolder()
	const { mutate: deleteFolder } = useDeleteTemplateFolder()
	const { mutate: duplicateVariant, isPending: isDuplicating } = useDuplicateTemplateAsVariant()

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

	const templateActions = (template: TemplateWithItemCounts) => (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							aria-label="Editar"
							size="icon-xs"
							variant="ghost"
							nativeButton={false}
							render={
								<Link {...editorLink(template.id)} onClick={(e) => e.stopPropagation()}>
									<Edit className="size-4" />
								</Link>
							}
						/>
					}
				></TooltipTrigger>
				<TooltipContent>Editar</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button aria-label={`Mais ações de ${template.name ?? "modelo"}`} size="icon-xs" variant="ghost" onClick={(e) => e.stopPropagation()} />}
				>
					<MoreHorizontal className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						disabled={isDuplicating}
						onClick={() => duplicateVariant(template.id, { onSuccess: (created) => navigate(editorLink(created.id)) })}
					>
						<Copy />
						Duplicar como variante
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setMoving({ id: template.id, name: template.name, folder_id: template.folder_id })}>
						<FolderInput />
						Mover para…
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" disabled={isDeleting} onClick={() => handleDelete(template.id, template.name ?? "")}>
						<Trash2 />
						Remover
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	)

	const folderActions = (row: CatalogFolderRow) => {
		const folder = row.folder
		if (!folder || !occasionType) return null
		const isEmpty = row.templateCount === 0 && !(folders ?? []).some((f) => f.parent_id === folder.id)
		return (
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button aria-label={`Ações da pasta ${folder.name}`} size="icon-xs" variant="ghost" onClick={(e) => e.stopPropagation()} />}
				>
					<MoreHorizontal className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{newInFolderLink && (
						<DropdownMenuItem onClick={() => navigate(newInFolderLink(folder.id))}>
							<Plus />
							Novo modelo aqui
						</DropdownMenuItem>
					)}
					{row.level === 0 && (
						<DropdownMenuItem onClick={() => setFolderDialog({ mode: "create", templateType: occasionType, parent: folder })}>
							<FolderPlus />
							Nova subpasta
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={() => setFolderDialog({ mode: "edit", templateType: occasionType, folder })}>
						<Pencil />
						Editar pasta
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem disabled={row.isFirst} onClick={() => moveFolder({ folderId: folder.id, delta: -1 })}>
						<ArrowUp />
						Subir
					</DropdownMenuItem>
					<DropdownMenuItem disabled={row.isLast} onClick={() => moveFolder({ folderId: folder.id, delta: 1 })}>
						<ArrowDown />
						Descer
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={!isEmpty}
						onClick={() => {
							if (window.confirm(`Remover a pasta "${folder.name}"?`)) deleteFolder(folder.id)
						}}
					>
						<Trash2 />
						{isEmpty ? "Remover pasta" : "Remover pasta (esvazie antes)"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title={title} description={description}>
				{canWrite && occasionType && (
					<Button size="sm" variant="outline" onClick={() => setFolderDialog({ mode: "create", templateType: occasionType, parent: null })}>
						<FolderPlus className="size-4 mr-2" />
						Nova pasta
					</Button>
				)}
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
				) : occasionType && (templates?.length || folders?.length) ? (
					<>
						{foldersError && <p className="text-sm text-destructive mb-2">Não foi possível carregar as pastas; os modelos aparecem em "Sem pasta".</p>}
						<TemplateCatalogTree
							templateType={occasionType}
							folders={folders}
							templates={templates ?? []}
							onOpenTemplate={canWrite ? (t) => navigate(editorLink(t.id)) : undefined}
							templateActions={canWrite ? templateActions : undefined}
							folderActions={canWrite ? folderActions : undefined}
						/>
					</>
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
									<TableHead className="w-28 text-center">Preparações</TableHead>
									{canWrite && <TableHead className="w-32 text-right">Ações</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{templates.map((template) => (
									<TableRow key={template.id}>
										<TableCell>
											<p className="text-subheading">{template.name}</p>
											{isSupportMenu && <SnackStandardBadges template={template} />}
										</TableCell>
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
																	aria-label="Editar"
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
																<Button
																	aria-label="Remover"
																	size="icon"
																	variant="ghost"
																	onClick={() => handleDelete(template.id, template.name ?? "")}
																	disabled={isDeleting}
																>
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

			<TemplateFolderDialog state={folderDialog} onClose={() => setFolderDialog(null)} />
			<MoveTemplateDialog template={moving} folders={folders} onClose={() => setMoving(null)} />

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
