import { Link, type LinkOptions, useNavigate } from "@tanstack/react-router"
import { CalendarRange, Edit, GitFork, Layers, Plus, Printer, Sandwich, Trash2 } from "lucide-react"
import { useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { TemplateCatalogTree } from "@/components/features/shared/TemplateCatalogTree"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTemplateFolders } from "@/hooks/data/useTemplateFolders"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"
import { OCCASION_MENU_COPY, type OccasionMenuType } from "@/lib/occasion-menu"
import { catalogFolderPath } from "@/lib/template-catalog-tree"
import { SnackStandardBadges } from "./SnackStandardBadges"

interface KitchenOccasionMenuListProps {
	templateType: OccasionMenuType
	kitchenId: number
	description: string
	newLink: LinkOptions
	/** Criação a partir de um modelo global (`?forkFrom=`). */
	forkLink: (sourceTemplateId: string) => LinkOptions
	/** Evento montado a partir de modelos (`?compose=`). Só evento. */
	composeLink?: (templateIds: readonly string[]) => LinkOptions
	editorLink: (templateId: string) => LinkOptions
	/** Folha impressa do modelo (desta cozinha ou global) — aberta também a quem só lê. */
	printLink: (templateId: string) => LinkOptions
}

/**
 * Eventos ou apoios de uma cozinha, com os modelos da SDAB na árvore de pastas dela. No evento, a
 * cozinha marca os modelos e MONTA o evento (café do Padrão A + almoço do Padrão B); no apoio,
 * adapta um kit. O modelo global não tem ocorrências por mês (é quantidade da cozinha), então a
 * coluna só aparece na lista da cozinha.
 */
export function KitchenOccasionMenuList({
	templateType,
	kitchenId,
	description,
	newLink,
	forkLink,
	composeLink,
	editorLink,
	printLink,
}: KitchenOccasionMenuListProps) {
	const navigate = useNavigate()
	const { data: folders, isLoading: foldersLoading } = useTemplateFolders(templateType)
	const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
	const copy = OCCASION_MENU_COPY[templateType]
	const isSupportMenu = templateType === "apoio"
	const Icon = isSupportMenu ? Sandwich : CalendarRange
	const noun = copy.noun

	const { data: templates, isLoading, isError, refetch, isRefetching } = useMenuTemplates(kitchenId)
	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()
	// Criar, adaptar, editar e remover exigem nível 2 NESTA cozinha. Mostrar os botões a quem só
	// lê levava a um clique que termina em erro de permissão.
	const { can } = usePBAC()
	const canWrite = can("kitchen", 2, { type: "kitchen", id: kitchenId })

	// Allowlist explícita pelo tipo nas duas seções: a listagem traz semanais, eventos e exceções,
	// globais e locais, misturados.
	const globalTemplates = templates?.filter((t) => t.kitchen_id === null && t.template_type === templateType) ?? []
	const localTemplates = templates?.filter((t) => t.kitchen_id !== null && t.template_type === templateType) ?? []
	// Pasta do modelo de origem da cópia local ("Lanche de Bordo › Classe A"): a cópia não tem pasta.
	const sourcePath = (baseTemplateId: string | null) => {
		if (!baseTemplateId) return null
		const base = templates?.find((t) => t.id === baseTemplateId)
		return catalogFolderPath(folders, base?.folder_id ?? null)
	}
	// Montar evento: a cozinha marca os modelos e junta numa tela só. Ordem = a da marcação.
	const canCompose = !isSupportMenu && canWrite && !!composeLink
	const toggleChosen = (id: string, checked: boolean) =>
		setChosen((prev) => {
			const next = new Set(prev)
			if (checked) next.add(id)
			else next.delete(id)
			return next
		})

	const handleDelete = (id: string, name: string) => {
		const pronoun = copy.article === "o" ? "Ele" : "Ela"
		const recovered = copy.article === "o" ? "recuperado" : "recuperada"
		if (
			window.confirm(
				`Tem certeza que deseja remover ${copy.article} ${noun} "${name}"?\n\n${pronoun} poderá ser ${recovered} na lixeira do Agendamento da Produção.`
			)
		) {
			deleteTemplate(id)
		}
	}

	const printButton = (templateId: string, size: "icon" | "icon-xs") => (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label="Imprimir"
						size={size}
						variant="ghost"
						nativeButton={false}
						render={
							<Link {...printLink(templateId)} onClick={(e) => e.stopPropagation()}>
								<Printer className="size-4" />
							</Link>
						}
					/>
				}
			></TooltipTrigger>
			<TooltipContent>Imprimir / baixar PDF</TooltipContent>
		</Tooltip>
	)

	const occurrencesCell = (value: number | null) => (
		<TableCell className="text-center">
			<Badge variant="outline" className="font-mono text-xs">
				{value ?? "—"}
			</Badge>
		</TableCell>
	)

	return (
		<div className="space-y-6">
			<PageHeader title={copy.plural} description={description}>
				{canWrite && (
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link {...newLink}>
								<Plus className="size-4 mr-2" />
								{copy.newLabel}
							</Link>
						}
					/>
				)}
			</PageHeader>

			{isError ? (
				<QueryErrorState
					message={`Não foi possível carregar ${copy.article}s ${copy.plural.toLowerCase()}.`}
					onRetry={() => refetch()}
					isRetrying={isRefetching}
				/>
			) : (
				<div className="space-y-8">
					{/* Modelos globais da SDAB (somente leitura) */}
					{globalTemplates.length > 0 && (
						<div>
							<div className="flex items-center gap-2 mb-3">
								<Icon className="size-4 text-muted-foreground" />
								<h2 className="text-subheading">Modelos Globais da SDAB</h2>
								<Badge variant="outline" className="text-xs">
									Somente leitura · disponíveis para adaptar
								</Badge>
							</div>
							{canCompose && (
								<div className="flex flex-wrap items-center gap-2 mb-3">
									<p className="text-sm text-muted-foreground flex-1 min-w-60">
										Marque os modelos que o evento vai servir — um por refeição, de qualquer padrão — e monte o evento.
									</p>
									{chosen.size > 0 && (
										<Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
											Limpar
										</Button>
									)}
									<Button size="sm" disabled={chosen.size === 0} onClick={() => composeLink && navigate(composeLink([...chosen]))}>
										<Layers className="size-4 mr-2" />
										Montar evento{chosen.size > 0 ? ` (${chosen.size})` : ""}
									</Button>
								</div>
							)}
							<TemplateCatalogTree
								templateType={templateType}
								folders={folders}
								foldersLoading={foldersLoading}
								templates={globalTemplates}
								selection={canCompose ? { selectedIds: chosen, onChange: toggleChosen } : undefined}
								templateActions={(template) => (
									<>
										{printButton(template.id, "icon-xs")}
										{canWrite && isSupportMenu && (
											<Button
												size="xs"
												variant="outline"
												nativeButton={false}
												render={
													<Link {...forkLink(template.id)} onClick={(e) => e.stopPropagation()}>
														<GitFork className="size-3.5 mr-1.5" />
														Adaptar
													</Link>
												}
											/>
										)}
									</>
								)}
							/>
						</div>
					)}

					{/* Itens desta cozinha */}
					<div>
						<div className="flex items-center gap-2 mb-3">
							{globalTemplates.length === 0 && <Icon className="size-4 text-muted-foreground" />}
							<h2 className="text-subheading">{copy.sectionTitle}</h2>
							<Badge variant="default" className="text-xs">
								Esta Cozinha
							</Badge>
							<Badge variant="outline" className="text-xs">
								Selecionáveis na licitação
							</Badge>
						</div>

						{isLoading ? (
							<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Carregando {copy.plural.toLowerCase()}...</div>
						) : localTemplates.length === 0 ? (
							<div className="rounded-md border border-dashed p-10 text-center space-y-3">
								<Icon className="size-10 mx-auto text-muted-foreground" />
								<p className="text-subheading text-muted-foreground">
									{copy.article === "o" ? "Nenhum" : "Nenhuma"} {noun} {copy.article === "o" ? "criado" : "criada"} ainda.
								</p>
								<p className="text-xs text-muted-foreground max-w-sm mx-auto">
									{canWrite
										? globalTemplates.length > 0
											? "Crie do zero ou adapte um modelo global da SDAB."
											: copy.explainer
										: "Você tem acesso de leitura a esta cozinha."}
								</p>
								{canWrite && (
									<Button
										variant="outline"
										size="sm"
										className="mt-2"
										nativeButton={false}
										render={
											<Link {...newLink}>
												<Plus className="size-4 mr-2" />
												Criar {copy.article === "o" ? "primeiro" : "primeira"} {noun}
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
											<TableHead>Origem</TableHead>
											{isSupportMenu && <TableHead className="w-32 text-center">Ocorrências/mês</TableHead>}
											<TableHead className="w-28 text-center">Preparações</TableHead>
											<TableHead className="w-32 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{localTemplates.map((template) => (
											<TableRow key={template.id}>
												<TableCell>
													<p className="text-subheading">{template.name}</p>
													{template.description && <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>}
													{isSupportMenu && <SnackStandardBadges template={template} />}
												</TableCell>
												<TableCell>
													{template.base_template_id ? (
														<Badge variant="secondary" className="text-xs gap-1 font-normal">
															<GitFork className="size-3" />
															{sourcePath(template.base_template_id) ?? "Adaptado da SDAB"}
														</Badge>
													) : (
														<span className="text-xs text-muted-foreground">Local</span>
													)}
												</TableCell>
												{isSupportMenu && occurrencesCell(template.expected_monthly_occurrences)}
												<TableCell className="text-center">
													<Badge variant="secondary" className="font-mono text-xs">
														{template.recipe_count || 0}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-1">
														{printButton(template.id, "icon")}
														{canWrite && (
															<>
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
															</>
														)}
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
			)}
		</div>
	)
}
