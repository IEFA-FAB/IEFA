import { Badge, Button } from "@iefa/ui";
import { Calendar, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TemplateWithItemCounts } from "@/types/domain/planning";

interface TemplatePaletteProps {
	templates: TemplateWithItemCounts[];
	selectedTemplateId: string | null;
	onSelectTemplate: (id: string | null) => void;
	onCreateNew: () => void;
	isLoading?: boolean;
}

// Template color mapping - cycles through colors for visual distinction
const TEMPLATE_COLORS = [
	{ bg: "bg-blue-500", border: "border-blue-500", ring: "ring-blue-500" },
	{ bg: "bg-green-500", border: "border-green-500", ring: "ring-green-500" },
	{ bg: "bg-yellow-500", border: "border-yellow-500", ring: "ring-yellow-500" },
	{
		bg: "bg-purple-500",
		border: "border-purple-500",
		ring: "ring-purple-500",
	},
	{ bg: "bg-pink-500", border: "border-pink-500", ring: "ring-pink-500" },
	{ bg: "bg-orange-500", border: "border-orange-500", ring: "ring-orange-500" },
];

export function getTemplateColor(index: number) {
	return TEMPLATE_COLORS[index % TEMPLATE_COLORS.length];
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
			<div className="bg-card border rounded-lg p-4">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Calendar className="w-4 h-4 animate-pulse" />
					<span>Carregando templates...</span>
				</div>
			</div>
		);
	}

	if (!templates || templates.length === 0) {
		return (
			<div className="bg-card border rounded-lg p-4">
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
		);
	}

	return (
		<div className="bg-card border rounded-lg p-4">
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
				{templates.map((template, index) => {
					const colors = getTemplateColor(index);
					const isSelected = selectedTemplateId === template.id;

					return (
						<button
							key={template.id}
							type="button"
							onClick={() => onSelectTemplate(isSelected ? null : template.id)}
							className={cn(
								"flex flex-col items-start gap-2 p-3 rounded-lg border-2 transition-all min-w-[160px]",
								"hover:shadow-md hover:scale-105",
								isSelected
									? `${colors.border} ${colors.ring} ring-2 ring-offset-2 bg-accent`
									: "border-border bg-background hover:border-primary/50",
							)}
						>
							{/* Color indicator & name */}
							<div className="flex items-center gap-2 w-full">
								<div className={cn("w-3 h-3 rounded-full", colors.bg)} />
								<span className="font-medium text-sm truncate flex-1 text-left">
									{template.name}
								</span>
							</div>

							{/* Recipe count */}
							<div className="flex items-center gap-2 w-full text-xs text-muted-foreground">
								<span>
									{template.recipe_count || 0} receita
									{template.recipe_count !== 1 ? "s" : ""}
								</span>
								{template.kitchen_id === null && (
									<Badge variant="outline" className="text-[10px] h-4">
										Global
									</Badge>
								)}
							</div>

							{/* Selection indicator */}
							{isSelected && (
								<Badge className={cn(colors.bg, "text-white text-[10px] h-5")}>
									Ativo
								</Badge>
							)}
						</button>
					);
				})}

				{/* Add new template button */}
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

			{/* Helper text */}
			{selectedTemplateId && (
				<p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
					<span className="font-medium">Dica:</span>
					Clique em qualquer dia da semana para aplicar este template.
				</p>
			)}
		</div>
	);
}
