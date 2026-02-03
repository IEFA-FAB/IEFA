import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui"
import { CalendarDays, Edit, Plus, Trash2 } from "lucide-react"
import React from "react"
import { useDeleteTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"
import { TemplateEditor } from "./TemplateEditor"

interface TemplateManagerProps {
	open: boolean
	onClose: () => void
	kitchenId: number | null
}

/**
 * Template Manager
 *
 * Lista templates disponíveis e permite criar/editar/deletar
 *
 * @example
 * ```tsx
 * <TemplateManager
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   kitchenId={1}
 * />
 * ```
 */
export function TemplateManager({ open, onClose, kitchenId }: TemplateManagerProps) {
	const { data: templates, isLoading } = useMenuTemplates(kitchenId)
	const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate()

	const [editorOpen, setEditorOpen] = React.useState(false)
	const [editingTemplateId, setEditingTemplateId] = React.useState<string | null>(null)

	const handleCreate = () => {
		setEditingTemplateId(null)
		setEditorOpen(true)
	}

	const handleEdit = (templateId: string) => {
		setEditingTemplateId(templateId)
		setEditorOpen(true)
	}

	const handleDelete = (templateId: string, templateName: string) => {
		if (
			window.confirm(
				`Tem certeza que deseja remover o template "${templateName}"?\n\nEle poderá ser recuperado na lixeira.`
			)
		) {
			deleteTemplate(templateId)
		}
	}

	const handleEditorClose = () => {
		setEditorOpen(false)
		setEditingTemplateId(null)
	}

	// Separate global vs local templates
	const globalTemplates = templates?.filter((t) => t.kitchen_id === null) || []
	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []

	return (
		<>
			<Dialog open={open} onOpenChange={onClose}>
				<DialogContent className="sm:max-w-7xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Gerenciar Templates</DialogTitle>
						<DialogDescription>
							Templates permitem criar planejamentos semanais reutilizáveis.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-4">
						{/* Global Templates */}
						{globalTemplates.length > 0 && (
							<div>
								<div className="flex items-center gap-2 mb-3">
									<CalendarDays className="w-4 h-4 text-muted-foreground" />
									<h3 className="text-sm font-medium">Templates Globais</h3>
									<Badge variant="outline" className="text-xs">
										Disponível para todas as cozinhas
									</Badge>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>Descrição</TableHead>
											<TableHead className="w-24 text-center">Receitas</TableHead>
											<TableHead className="w-24 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{globalTemplates.map((template) => (
											<TableRow key={template.id}>
												<TableCell className="font-medium">{template.name}</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{template.description || "—"}
												</TableCell>
												<TableCell className="text-center">
													<Badge variant="secondary" className="font-mono text-xs">
														{template.recipe_count || 0}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<Badge variant="outline" className="text-xs">
														Somente Leitura
													</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}

						{/* Local Templates */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<h3 className="text-sm font-medium">Templates Locais</h3>
									<Badge variant="default" className="text-xs">
										Esta Cozinha
									</Badge>
								</div>
								<Button size="sm" onClick={handleCreate}>
									<Plus className="w-4 h-4 mr-2" />
									Novo Template
								</Button>
							</div>

							{isLoading ? (
								<div className="py-8 text-center text-sm text-muted-foreground">
									Carregando templates...
								</div>
							) : localTemplates.length > 0 ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>Descrição</TableHead>
											<TableHead className="w-24 text-center">Receitas</TableHead>
											<TableHead className="w-32 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{localTemplates.map((template) => (
											<TableRow key={template.id}>
												<TableCell className="font-medium">{template.name}</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{template.description || "—"}
												</TableCell>
												<TableCell className="text-center">
													<Badge variant="secondary" className="font-mono text-xs">
														{template.recipe_count || 0}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-1">
														<Button
															size="icon"
															variant="ghost"
															onClick={() => handleEdit(template.id)}
															title="Editar"
														>
															<Edit className="w-4 h-4" />
														</Button>
														<Button
															size="icon"
															variant="ghost"
															onClick={() => handleDelete(template.id, template.name ?? "")}
															disabled={isDeleting}
															title="Remover"
														>
															<Trash2 className="w-4 h-4 text-destructive" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<div className="py-8 text-center border-2 border-dashed rounded-lg">
									<p className="text-sm text-muted-foreground mb-2">
										Nenhum template local criado ainda.
									</p>
									<Button size="sm" variant="outline" onClick={handleCreate}>
										<Plus className="w-4 h-4 mr-2" />
										Criar Primeiro Template
									</Button>
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Template Editor */}
			<TemplateEditor
				open={editorOpen}
				onClose={handleEditorClose}
				kitchenId={kitchenId}
				templateId={editingTemplateId}
			/>
		</>
	)
}
