import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/cn"
import type { ToolCall } from "@/types/domain/module-chat"

// ── Tool name labels ────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
	list_kitchens: "Listando cozinhas",
	get_meal_types: "Consultando tipos de refeição",
	get_planning_calendar: "Consultando calendário",
	get_day_details: "Consultando detalhes do dia",
	list_recipes: "Listando receitas",
	get_recipe: "Consultando receita",
	create_daily_menu: "Criando menu diário",
	add_menu_item: "Adicionando item ao menu",
	remove_menu_item: "Removendo item do menu",
	update_menu_headcount: "Atualizando comensais",
	list_menu_templates: "Listando templates",
	get_template_items: "Consultando template",
	apply_template: "Aplicando template",
	list_ingredients: "Listando insumos",
	get_ingredient: "Consultando insumo",
	create_recipe: "Criando receita",
	update_recipe: "Atualizando receita",
	list_atas: "Listando ATAs",
	get_ata_details: "Consultando ATA",
	update_ata_status: "Atualizando status da ATA",
	get_unit_dashboard: "Consultando dashboard",
	get_unit_settings: "Consultando configurações",
	search_arp: "Buscando ARPs",
	list_empenhos: "Listando empenhos",
	list_kitchen_drafts: "Listando rascunhos",
	create_kitchen_draft: "Criando rascunho",
	get_kitchen_settings: "Consultando configurações",
}

function getToolLabel(name: string, status: ToolCall["status"]): string {
	const base = TOOL_LABELS[name] ?? name
	if (status === "calling") return `${base}…`
	if (status === "error") return `Erro: ${base}`
	return base
}

// ── Component ───────────────────────────────────────────────────────────────

interface ToolCallDisplayProps {
	toolCall: ToolCall
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
	const [expanded, setExpanded] = useState(false)

	const statusIcon =
		toolCall.status === "calling" ? (
			<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
		) : toolCall.status === "error" ? (
			<AlertCircle className="h-3.5 w-3.5 text-destructive" />
		) : (
			<Check className="h-3.5 w-3.5 text-emerald-600" />
		)

	let parsedArgs: Record<string, unknown> | null = null
	try {
		if (toolCall.arguments) parsedArgs = JSON.parse(toolCall.arguments)
	} catch {
		// ignore
	}

	return (
		<div className={cn("rounded-lg border text-xs", toolCall.status === "error" ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-muted/30")}>
			{/* Header */}
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors rounded-lg"
			>
				{statusIcon}
				<span className="flex-1 font-medium text-foreground">{getToolLabel(toolCall.name, toolCall.status)}</span>
				{expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
			</button>

			{/* Expandable details */}
			{expanded && (
				<div className="border-t border-border/40 px-3 py-2 space-y-2">
					{parsedArgs && Object.keys(parsedArgs).length > 0 && (
						<div>
							<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Parâmetros</p>
							<pre className="overflow-auto rounded bg-background/60 p-2 text-[11px] text-muted-foreground font-mono leading-relaxed">
								{JSON.stringify(parsedArgs, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.result !== undefined && (
						<div>
							<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Resultado</p>
							<pre className="overflow-auto rounded bg-background/60 p-2 text-[11px] text-muted-foreground font-mono leading-relaxed max-h-[200px]">
								{typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
