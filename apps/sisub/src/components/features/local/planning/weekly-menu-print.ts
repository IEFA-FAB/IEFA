import { addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { PrintScope } from "@/components/features/local/planning/MenuPrintParts"
import { type CardapioPrintOptions, formatPrintedDemand, groupPrintColor, isCommandTableItem, isMainDish } from "@/lib/cardapio-print"
import { type MenuGroup, menuItemGroupLabel, menuItemGroupOrder } from "@/lib/menu-item-groups"
import { WEEKDAYS } from "@/lib/weekdays"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * Derivações do cardápio semanal impresso (`WeeklyMenuPrint`): grade refeição × dia, legenda de
 * cores, colunas datadas e rótulos. Fora do componente para serem testáveis.
 */

type TemplateItem = MenuTemplateWithItems["items"][number]

type GroupsFor = (mealTypeId: string | null | undefined) => readonly MenuGroup[]

/**
 * Uma preparação dentro de uma célula (refeição × dia) da grade. `demand` é o efetivo fixo do item
 * já formatado ("120 pax"); a porcentagem não sai na folha. `color` é a tinta do grupo, sem `#`.
 */
export type CellEntry = { name: string; group: string | null; main: boolean; sortOrder: number; demand: string | null; color: string | null }

/** Item da legenda de cores: um por grupo presente na grade, na ordem de leitura. */
export type GroupLegendEntry = { key: string; label: string; color: string }

/** Coluna da grade: dia da semana e, com a semana escolhida, a data ("15/09"). */
export type DayColumn = { num: number; label: string; dateLabel: string | null }

type CommandTableOptions = Pick<CardapioPrintOptions, "hideCommandTable" | "commandTableMaxProportion">

/** Extrai o nome exibível de um item do template (snapshot → origem → fallback). */
export function itemRecipeName(item: Pick<TemplateItem, "recipe_origin">): string {
	return item.recipe_origin?.name?.trim() || "Preparação sem nome"
}

/** Conta o que sumiria da grade: item sem dia ou refeição nunca apareceu nela. */
export function countHiddenGridItems(
	items: readonly Pick<TemplateItem, "day_of_week" | "meal_type_id" | "headcount_override" | "recommended_proportion">[] | undefined,
	options: CommandTableOptions
): number {
	return (items ?? []).filter((item) => item.day_of_week != null && item.meal_type_id && isCommandTableItem(item, options)).length
}

/** Ordena os tipos de refeição (linhas da grade) por sort_order → nome. */
export function sortMealTypes<T extends { sort_order?: number | null; name?: string | null }>(mealTypes: readonly T[] | undefined): T[] {
	return (mealTypes ?? []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name ?? "").localeCompare(b.name ?? ""))
}

/**
 * Índice (dia → refeição → preparações), ordenadas pela ordem de leitura do
 * CONJUNTO daquela refeição e depois pela posição dentro do grupo.
 */
export function buildCellIndex(
	items: readonly Pick<TemplateItem, "day_of_week" | "meal_type_id" | "item_group" | "sort_order" | "headcount_override" | "recipe_origin">[],
	groupsFor: GroupsFor
): Map<string, CellEntry[]> {
	const cellIndex = new Map<string, CellEntry[]>()
	for (const item of items) {
		if (item.day_of_week == null || !item.meal_type_id) continue
		const key = `${item.day_of_week}:${item.meal_type_id}`
		const list = cellIndex.get(key) ?? []
		list.push({
			name: itemRecipeName(item),
			group: item.item_group ?? null,
			main: isMainDish(item.item_group),
			sortOrder: item.sort_order ?? 0,
			demand: formatPrintedDemand(item),
			color: groupPrintColor(item.item_group),
		})
		cellIndex.set(key, list)
	}
	for (const [key, list] of cellIndex) {
		const groups = groupsFor(key.split(":")[1])
		list.sort((a, b) => menuItemGroupOrder(a.group, groups) - menuItemGroupOrder(b.group, groups) || a.sortOrder - b.sortOrder)
	}
	return cellIndex
}

/** Efetivo base por (dia + refeição): sai no topo da célula. */
export function buildBaseByCell(
	meals: readonly Pick<MenuTemplateWithItems["meals"][number], "day_of_week" | "meal_type_id" | "base_headcount">[] | null | undefined
) {
	return new Map((meals ?? []).map((m) => [`${m.day_of_week}:${m.meal_type_id}`, m.base_headcount]))
}

/**
 * Legenda das cores: grupos presentes na grade, na ordem das linhas e, dentro de cada
 * refeição, na ordem do conjunto dela. Sem legenda, a cor não diz nada a quem lê a folha.
 * Vazia quando a folha sai sem cores (`groupColors` desligado).
 */
export function buildGroupLegend(
	groupColors: boolean,
	orderedMealTypes: readonly { id: string }[],
	cellIndex: ReadonlyMap<string, CellEntry[]>,
	groupsFor: GroupsFor,
	allGroups: readonly MenuGroup[]
): GroupLegendEntry[] {
	const groupLegend: GroupLegendEntry[] = []
	if (!groupColors) return groupLegend
	const seen = new Set<string>()
	for (const mt of orderedMealTypes) {
		const groups = groupsFor(mt.id)
		// As células já vêm na ordem do conjunto; juntar as da semana e reordenar pelo
		// conjunto põe a legenda na mesma ordem de leitura da linha.
		const present = WEEKDAYS.flatMap((d) => cellIndex.get(`${d.num}:${mt.id}`) ?? [])
			.filter((e) => e.group != null && e.color != null)
			.sort((x, y) => menuItemGroupOrder(x.group, groups) - menuItemGroupOrder(y.group, groups))
		for (const entry of present) {
			if (entry.group == null || entry.color == null || seen.has(entry.group)) continue
			seen.add(entry.group)
			groupLegend.push({ key: entry.group, label: menuItemGroupLabel(entry.group, [...groups, ...allGroups]), color: entry.color })
		}
	}
	return groupLegend
}

/** Data do dia `dow` (ISO, 1 = segunda) na semana que começa em `weekStart`; `null` sem semana. */
export function weekdayDate(weekStart: Date | null, dow: number): Date | null {
	return weekStart ? addDays(weekStart, dow - 1) : null
}

/** Colunas da grade, datadas quando há semana escolhida. */
export function buildDayColumns(weekStart: Date | null): DayColumn[] {
	return WEEKDAYS.map((d) => {
		const date = weekdayDate(weekStart, d.num)
		return { num: d.num, label: d.label, dateLabel: date ? format(date, "dd/MM") : null }
	})
}

/** Faixa sob o título: a semana por extenso, ou o nome do cardápio sem semana escolhida. */
export function formatWeekLabel(weekStart: Date | null, templateName: string | null | undefined): string {
	if (!weekStart) return templateName ?? ""
	const end = addDays(weekStart, 6)
	return `SEMANA DE ${format(weekStart, "dd 'de' MMMM", { locale: ptBR })} A ${format(end, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`.toUpperCase()
}

/** Valor do `<input type="date">` da semana. */
export function formatWeekInputValue(weekStart: Date | null): string {
	return weekStart ? format(weekStart, "yyyy-MM-dd") : ""
}

/** Grade sem linhas: o texto depende de onde vêm os tipos de refeição. */
export function emptyMealTypesMessage(scope: PrintScope): string {
	return scope.kind === "kitchen" ? "Nenhum tipo de refeição configurado para esta cozinha." : "Nenhum tipo de refeição genérico configurado."
}
