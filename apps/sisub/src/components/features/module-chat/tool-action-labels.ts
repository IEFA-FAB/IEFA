/**
 * Rótulos no IMPERATIVO das tools de escrita do chat, para o cartão de aprovação ("Remover item
 * do cardápio") e para a ação recusada. O `ToolCallDisplay` usa gerúndio ("Removendo item…"),
 * que descreve algo em andamento — e na aprovação nada está em andamento ainda.
 *
 * Roda no navegador, então não importa o registro das tools (código de servidor). O teste
 * confere este mapa contra `APPROVAL_TOOL_NAMES` do registro.
 */

const ACTION_LABELS: Record<string, string> = {
	create_recipe: "Criar receita",
	update_recipe: "Alterar receita",
	create_daily_menu: "Criar cardápio do dia",
	add_menu_item: "Adicionar receita ao cardápio",
	remove_menu_item: "Remover item do cardápio",
	update_menu_headcount: "Alterar comensais previstos",
	apply_template: "Aplicar template ao planejamento",
	update_quantity_estimate_status: "Alterar status do anexo quantitativo",
}

/** A transição de status muda o verbo: concluir não é "alterar", é irreversível. */
const QUANTITY_ESTIMATE_STATUS_ACTIONS: Record<string, string> = {
	completed: "Concluir anexo quantitativo",
	archived: "Arquivar anexo quantitativo",
	draft: "Voltar anexo quantitativo para rascunho",
}

export function getActionLabel(toolName: string, args: Record<string, unknown> | null): string {
	if (toolName === "update_quantity_estimate_status" && typeof args?.status === "string") {
		const label = QUANTITY_ESTIMATE_STATUS_ACTIONS[args.status]
		if (label) return label
	}
	return ACTION_LABELS[toolName] ?? `Executar ${toolName}`
}

/** Aviso extra quando a ação não tem volta pela tela. */
export function getActionWarning(toolName: string, args: Record<string, unknown> | null): string | null {
	if (toolName === "update_quantity_estimate_status" && args?.status === "completed") {
		return "Concluir congela a memória de cálculo e não volta para rascunho."
	}
	return null
}

export function parseToolArguments(raw: string | undefined): Record<string, unknown> | null {
	if (!raw) return null
	try {
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
	} catch {
		return null
	}
}
