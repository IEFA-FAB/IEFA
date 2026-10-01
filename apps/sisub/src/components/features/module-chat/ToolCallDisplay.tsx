import { AlertCircle, Ban, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/cn"
import type { ToolCall } from "@/types/domain/module-chat"
import { ToolApprovalCard, type ToolApprovalContext } from "./ToolApprovalCard"
import { getActionLabel, parseToolArguments } from "./tool-action-labels"

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
	list_legacy_preparations: "Listando preparações legadas (SISUBWEB)",
	get_ingredient: "Consultando insumo",
	create_recipe: "Criando receita",
	update_recipe: "Atualizando receita",
	list_quantity_estimates: "Listando anexos quantitativos",
	get_quantity_estimate: "Consultando anexo quantitativo",
	update_quantity_estimate_status: "Atualizando status do anexo",
	get_unit_overview: "Consultando unidade",
	get_low_balance_items: "Consultando saldos críticos",
	get_upcoming_menus: "Consultando cardápios futuros",
	get_unit_dashboard: "Consultando dashboard",
	get_unit_settings: "Consultando configurações",
	search_arp: "Buscando ARPs",
	list_empenhos: "Listando empenhos",
	list_kitchen_drafts: "Listando previsões de demanda",
	create_kitchen_draft: "Criando previsão de demanda",
	get_kitchen_settings: "Consultando configurações",
}

export function getToolLabel(toolCall: Pick<ToolCall, "name" | "status" | "arguments">): string {
	// Recusada não aconteceu: o rótulo é a ação proposta, no imperativo, não o gerúndio.
	if (toolCall.status === "denied") return `Recusada pelo usuário: ${getActionLabel(toolCall.name, parseToolArguments(toolCall.arguments))}`
	const base = TOOL_LABELS[toolCall.name] ?? toolCall.name
	if (toolCall.status === "calling") return `${base}…`
	if (toolCall.status === "error") return `Erro: ${base}`
	return base
}

// ── Component ───────────────────────────────────────────────────────────────

interface ToolCallDisplayProps {
	toolCall: ToolCall
	/** Contexto da decisão de aprovação; sem ele, a ação pendente aparece sem como decidir. */
	approval?: ToolApprovalContext
}

export function ToolCallDisplay({ toolCall, approval }: ToolCallDisplayProps) {
	if (toolCall.status === "awaiting-approval") return <ToolApprovalCard toolCall={toolCall} approval={approval} />
	return <ToolCallSummary toolCall={toolCall} />
}

function ToolCallSummary({ toolCall }: { toolCall: ToolCall }) {
	const [expanded, setExpanded] = useState(false)

	const statusIcon =
		toolCall.status === "calling" ? (
			<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
		) : toolCall.status === "error" ? (
			<AlertCircle className="size-3.5 text-destructive" />
		) : toolCall.status === "denied" ? (
			<Ban className="size-3.5 text-muted-foreground" />
		) : (
			<Check className="size-3.5 text-success" />
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
				<span className="flex-1 text-subheading text-foreground">{getToolLabel(toolCall)}</span>
				{expanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
			</button>

			{/* Expandable details */}
			{expanded && (
				<div className="border-t border-border/40 px-3 py-2 space-y-2">
					{parsedArgs && Object.keys(parsedArgs).length > 0 && (
						<div>
							<p className="text-label text-muted-foreground/60 mb-1">Parâmetros</p>
							<pre className="overflow-auto rounded bg-background/60 p-2 text-[11px] text-muted-foreground font-mono leading-relaxed">
								{JSON.stringify(parsedArgs, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.result !== undefined && (
						<div>
							<p className="text-label text-muted-foreground/60 mb-1">Resultado</p>
							<pre className="overflow-auto rounded bg-background/60 p-2 text-[11px] text-muted-foreground font-mono leading-relaxed max-h-[200px]">
								{typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.error && (
						<div>
							<p className="text-label text-destructive/80 mb-1">Erro</p>
							<pre className="overflow-auto rounded border border-destructive/20 bg-destructive/10 p-2 text-[11px] text-destructive font-mono leading-relaxed max-h-[200px] whitespace-pre-wrap">
								{toolCall.error}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
