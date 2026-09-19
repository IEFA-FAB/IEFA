/**
 * Anotações MCP de cada tool (`readOnlyHint` / `destructiveHint`).
 *
 * São DICAS para o cliente — pela especificação, nenhum cliente pode basear decisão de
 * segurança nelas, e a autorização continua inteira no domínio. O que elas fazem é deixar o
 * cliente pedir confirmação humana antes de uma escrita (Claude Desktop, por exemplo, só
 * dispensa a confirmação de tool marcada como somente-leitura). Sem anotação, a
 * especificação manda o cliente presumir o pior: tudo é escrita destrutiva.
 *
 * Um mapa explícito por nome, e não inferência por prefixo: `create_daily_menu` é upsert e
 * `apply_template` apaga planejamento no modo "replace" — o nome não diz. `annotations.test.ts`
 * falha quando uma tool nova entra sem classificação.
 */

/** Subconjunto de `ToolAnnotations` do SDK que este servidor declara. */
export type ToolHints = { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: false }

type Kind = "read" | "additive" | "destructive"

const TOOL_KINDS: Record<string, Kind> = {
	// ── Leitura ────────────────────────────────────────────────────────────
	check_menu_equipment: "read",
	check_recipe_equipment: "read",
	get_day_details: "read",
	get_meal_types: "read",
	get_planning_calendar: "read",
	get_recipe: "read",
	get_recipe_equipment: "read",
	get_template: "read",
	get_template_items: "read",
	get_trash_items: "read",
	list_deleted_templates: "read",
	list_equipment_catalog: "read",
	list_kitchen_equipment: "read",
	list_kitchens: "read",
	list_menu_templates: "read",
	list_recipe_versions: "read",
	list_recipes: "read",
	list_unit_kitchens: "read",

	// ── Escrita aditiva: cria ou restaura, não sobrescreve nada ──────────────
	add_menu_item: "additive",
	create_blank_template: "additive",
	create_meal_type: "additive",
	create_recipe: "additive",
	create_template: "additive",
	fork_template: "additive",
	restore_meal_type: "additive",
	restore_menu_item: "additive",
	restore_template: "additive",

	// ── Escrita destrutiva: apaga, substitui ou sobrescreve ──────────────────
	apply_template: "destructive", // conflictMode "replace" manda o planejamento das datas para a lixeira
	create_daily_menu: "destructive", // upsert: pode sobrescrever o cardápio existente
	delete_meal_type: "destructive",
	delete_template: "destructive",
	remove_menu_item: "destructive",
	save_recipe_edit: "destructive",
	update_meal_type: "destructive",
	update_menu_headcount: "destructive",
	update_menu_item: "destructive",
	update_substitutions: "destructive",
	update_template: "destructive", // `items` é substituição destrutiva (delete-all + reinsert)
}

/** Tools que existem mas ainda não foram classificadas — o teste exige lista vazia. */
export function unclassifiedTools(names: readonly string[]): string[] {
	return names.filter((name) => !Object.hasOwn(TOOL_KINDS, name))
}

/**
 * Anotações da tool. Sem classificação, cai no pior caso (escrita destrutiva) — o mesmo
 * default que a especificação manda o cliente presumir.
 */
export function toolAnnotations(name: string): ToolHints {
	const kind = Object.hasOwn(TOOL_KINDS, name) ? TOOL_KINDS[name] : "destructive"
	if (kind === "read") return { readOnlyHint: true, openWorldHint: false }
	return { readOnlyHint: false, destructiveHint: kind === "destructive", openWorldHint: false }
}
