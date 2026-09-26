import { Link, type LinkOptions } from "@tanstack/react-router"
import { CalendarRange, Edit, GitFork, Plus, Sandwich, Trash2 } from "lucide-react"
import { usePBAC } from "@/auth/pbac"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"
import { OCCASION_MENU_COPY, type OccasionMenuType } from "@/lib/occasion-menu"
import { SnackStandardBadges } from "./SnackStandardBadges"

interface KitchenOccasionMenuListProps {
	templateType: OccasionMenuType
	kitchenId: number
	description: string
	newLink: LinkOptions
	/** Criação a partir de um modelo global (`?forkFrom=`). */
	forkLink: (sourceTemplateId: string) => LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Eventos ou exceções de uma cozinha, com os modelos globais da SDAB disponíveis para adaptar —
 * o mesmo arranjo dos cardápios semanais.
 */
export function KitchenOccasionMenuList({ templateType, kitchenId, description, newLink, forkLink, editorLink }: KitchenOccasionMenuListProps) {
	const copy = OCCASION_MENU_COPY[templateType]
	const isException = templateType === "exception"
	const Icon = isException ? Sandwich : CalendarRange
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
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>Descrição</TableHead>
											{isException && <TableHead className="w-32 text-center">Ocorrências/mês</TableHead>}
											<TableHead className="w-28 text-center">Preparações</TableHead>
											{canWrite && <TableHead className="w-32 text-right">Ação</TableHead>}
										</TableRow>
									</TableHeader>
									<TableBody>
										{globalTemplates.map((template) => (
											<TableRow key={template.id}>
												<TableCell>
													<p className="text-subheading">{template.name}</p>
													{isException && <SnackStandardBadges template={template} />}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">{template.description || "—"}</TableCell>
												{isException && occurrencesCell(template.expected_monthly_occurrences)}
												<TableCell className="text-center">
													<Badge variant="secondary" className="font-mono text-xs">
														{template.recipe_count || 0}
													</Badge>
												</TableCell>
												{canWrite && (
													<TableCell className="text-right">
														<Button
															size="sm"
															variant="outline"
															nativeButton={false}
															render={
																<Link {...forkLink(template.id)}>
																	<GitFork className="size-3.5 mr-1.5" />
																	Adaptar
																</Link>
															}
														/>
													</TableCell>
												)}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
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
											{isException && <TableHead className="w-32 text-center">Ocorrências/mês</TableHead>}
											<TableHead className="w-28 text-center">Preparações</TableHead>
											{canWrite && <TableHead className="w-32 text-right">Ações</TableHead>}
										</TableRow>
									</TableHeader>
									<TableBody>
										{localTemplates.map((template) => (
											<TableRow key={template.id}>
												<TableCell>
													<p className="text-subheading">{template.name}</p>
													{template.description && <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>}
													{isException && <SnackStandardBadges template={template} />}
												</TableCell>
												<TableCell>
													{template.base_template_id ? (
														<Badge variant="secondary" className="text-xs gap-1 font-normal">
															<GitFork className="size-3" />
															Adaptado da SDAB
														</Badge>
													) : (
														<span className="text-xs text-muted-foreground">Local</span>
													)}
												</TableCell>
												{isException && occurrencesCell(template.expected_monthly_occurrences)}
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
				</div>
			)}
		</div>
	)
}
