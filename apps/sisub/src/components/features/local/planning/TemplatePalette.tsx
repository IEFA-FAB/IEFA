import { Calendar, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

interface TemplatePaletteProps {
	templates: TemplateWithItemCounts[]
	selectedTemplateId: string | null
	onSelectTemplate: (id: string | null) => void
	onCreateNew: () => void
	isLoading?: boolean
}

export function TemplatePalette({
	templates,
	selectedTemplateId,
	onSelectTemplate,
	onCreateNew,
	isLoading,
}: TemplatePaletteProps) {
	if (isLoading) {
		return (
			<div className="bg-card border p-4">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Calendar className="w-4 h-4 animate-pulse" />
					<span>Carregando templates...</span>
				</div>
			</div>
		)
	}

	if (!templates || templates.length === 0) {
		return (
			<div className="bg-card border p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Calendar className="w-4 h-4" />
						<span>Nenhum template disponível</span>
					</div>
					<Button size="sm" variant="outline" onClick={onCreateNew}>
						<Plus className="w-4 h-4 mr-2" />
						Criar Template
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="bg-card border p-4">
			<div className="flex items-center gap-3 mb-3">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Calendar className="w-4 h-4" />
					<span>Selecione um Template:</span>
				</div>
				{selectedTemplateId && (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => onSelectTemplate(null)}
						className="h-7 text-xs"
					>
						Limpar Seleção
					</Button>
				)}
			</div>

			<div className="flex items-center gap-3 overflow-x-auto p-4 -mx-4 px-4 scrollbar-hide">
				{templates.map((template) => {
					const isSelected = selectedTemplateId === template.id

					return (
						<Button
							key={template.id}
							type="button"
							size="sm"
							variant="outline"
							onClick={() => onSelectTemplate(isSelected ? null : template.id)}
							className={cn(
								"flex flex-col items-start gap-2 p-3 min-w-[140px] h-[76px] transition-colors",
								isSelected
									? "border-primary ring-2 ring-offset-2 ring-primary bg-accent"
									: "border-border bg-background hover:border-primary/50"
							)}
						>
							<div className="flex items-center gap-2 w-full">
								<div className="w-3 h-3 rounded-full bg-primary" />
								<span className="font-medium text-sm truncate flex-1 text-left">
									{template.name}
								</span>
							</div>

							<div className="flex items-center gap-2 w-full text-xs text-muted-foreground">
								<span>
									{template.recipe_count || 0} Preparação
									{template.recipe_count !== 1 ? "s" : ""}
								</span>
								{template.kitchen_id === null && (
									<Badge variant="outline" className="text-[10px] h-4">
										Global
									</Badge>
								)}
							</div>

							{isSelected && <Badge className="text-[10px] h-5">Ativo</Badge>}
						</Button>
					)
				})}

				<Button
					size="sm"
					variant="outline"
					onClick={onCreateNew}
					className="min-w-[140px] h-[76px] border-dashed"
				>
					<Plus className="w-4 h-4 mr-2" />
					Novo Template
				</Button>
			</div>

			{selectedTemplateId && (
				<p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
					<span className="font-medium">Dica:</span>
					Clique em qualquer dia da semana para aplicar este template.
				</p>
			)}
		</div>
	)
}
