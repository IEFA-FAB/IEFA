import { z } from "zod"
import { isMainDish } from "@/lib/cardapio-print"
import { eventDraftFrom } from "@/lib/event-meals"
import { isSnackStandard, type OccasionMenuType, snackStandardLabel, withLegacySnackPortions } from "@/lib/occasion-menu"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * Regras do evento e do cardápio de apoio impressos (tela, PDF e DOCX), fora do componente para
 * serem testáveis. A grade do semanal (refeição × dia) não serve aqui: evento e apoio não têm dia,
 * e cada refeição tem a própria composição. A folha sai como blocos, um por refeição, com os
 * grupos dela em linhas.
 */

/** Título padrão da folha; editável na página, como o do semanal. */
export const OCCASION_PRINT_TITLE: Record<OccasionMenuType, string> = {
	event: "CARDÁPIO DE EVENTO",
	apoio: "CARDÁPIO DE APOIO",
}

/** Uma preparação impressa. `demand` já formatada ("120 pax", "2 por kit") ou `null`. */
export type OccasionPrintEntry = { recipeId: string; name: string; main: boolean; demand: string | null }

/** Grupo da refeição com o que está nele. `label: null` = kit simples, sem composição (lista solta). */
export type OccasionPrintGroup = { key: string | null; label: string | null; entries: OccasionPrintEntry[] }

export type OccasionPrintMeal = {
	id: string
	name: string
	/** Horário do calendário, quando diz algo além do nome da refeição. */
	slotName: string | null
	/** Efetivo da refeição já formatado ("120 pessoas", "40 kits") ou `null`. */
	base: string | null
	groups: OccasionPrintGroup[]
}

type PrintableTemplate = Pick<MenuTemplateWithItems, "items" | "event_meals" | "snack_family" | "snack_class" | "snack_variant">

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

/**
 * Quantidade impressa ao lado da preparação. Pax direto sai sempre (no apoio é o total de
 * porções). A proporção só sai no apoio, onde diz o que vai em cada kit ("2 por kit"); no evento
 * ela é % do efetivo, dado de planejamento que o semanal também não imprime.
 */
export function formatOccasionDemand(
	item: { headcount_override?: number | null; recommended_proportion?: number | null },
	templateType: OccasionMenuType
): string | null {
	if (item.headcount_override != null) return templateType === "apoio" ? `${item.headcount_override} porções` : `${item.headcount_override} pax`
	if (templateType === "apoio" && item.recommended_proportion != null) return `${decimal.format(item.recommended_proportion / 100)} por kit`
	return null
}

/** Efetivo da refeição: pessoas no evento, kits no apoio. */
export function formatOccasionBase(base: number | null | undefined, templateType: OccasionMenuType): string | null {
	if (base == null) return null
	if (templateType === "apoio") return base === 1 ? "1 kit" : `${base} kits`
	return base === 1 ? "1 pessoa" : `${base} pessoas`
}

/**
 * Refeições do evento ou do apoio na ordem gravada, cada uma com os grupos da composição (na
 * ordem dela) e as preparações deles. A colocação dos itens é a do editor (`eventDraftFrom`):
 * item sem refeição vai para a do mesmo horário, grupo que a composição perdeu vira "Sem grupo".
 * Grupo vazio não sai — a folha diz o que se serve, não o que se planejou servir.
 *
 * Padrão de lanche: as refeições ficam no horário de sistema dos lanches (`snackSlotId`), como o
 * editor mostra e o servidor fixa ao salvar — gravado antes disso, o horário podia ser outro.
 */
export function buildOccasionPrintMeals(
	template: PrintableTemplate,
	templateType: OccasionMenuType,
	slotNameOf: (mealTypeId: string) => string | null,
	snackSlotId: string | null = null
): OccasionPrintMeal[] {
	const isSnack = templateType === "apoio" && isSnackStandard(template)
	// Padrão de lanche gravado antes da proporção única guardava as porções por kit no pax.
	const stored = isSnack ? template.items.map(withLegacySnackPortions) : template.items
	const draft = eventDraftFrom(template.event_meals, stored, templateType)
	const nameById = new Map(template.items.flatMap((i) => (i.recipe_id ? [[i.recipe_id, i.recipe_origin?.name?.trim() || "Preparação sem nome"] as const] : [])))

	return draft.meals.map((meal) => {
		const items = draft.items.filter((i) => i.meal_type_id === meal.id).toSorted((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
		const entry = (item: (typeof items)[number]): OccasionPrintEntry => ({
			recipeId: item.recipe_id,
			name: nameById.get(item.recipe_id) ?? "Preparação sem nome",
			main: isMainDish(item.item_group),
			// Padrão de lanche: os kits vêm do pedido — só as porções por kit dizem algo (o editor nem mostra o pax).
			demand: formatOccasionDemand(isSnack ? { recommended_proportion: item.recommended_proportion } : item, templateType),
		})
		const groups: OccasionPrintGroup[] = meal.groups.map((g) => ({
			key: g.key,
			label: g.label,
			entries: items.filter((i) => i.item_group === g.key).map(entry),
		}))
		const ungrouped = items.filter((i) => i.item_group == null || !meal.groups.some((g) => g.key === i.item_group)).map(entry)
		// Com composição, o que ficou fora dela é "Sem grupo"; sem composição (kit simples), é a lista.
		groups.push({ key: null, label: meal.groups.length > 0 ? "Sem grupo" : null, entries: ungrouped })

		const slot = slotNameOf(isSnack && snackSlotId ? snackSlotId : meal.meal_type_id)?.trim() || null
		return {
			id: meal.id,
			name: meal.name,
			slotName: slot && slot.localeCompare(meal.name.trim(), "pt-BR", { sensitivity: "base" }) !== 0 ? slot : null,
			base: isSnack ? null : formatOccasionBase(meal.base_headcount, templateType),
			groups: groups.filter((g) => g.entries.length > 0),
		}
	})
}

/** Linha de identificação sob o título: nome do cardápio e, no padrão de lanche, a classificação. */
export function occasionPrintSubtitle(template: PrintableTemplate & { name: string | null }): string {
	const name = template.name?.trim() || ""
	const snack = snackStandardLabel(template)
	return snack && name ? `${name} · ${snack}` : name || snack || ""
}

/** `?date=` das rotas de impressão: data ISO, para não virar Invalid Date em `parseISO`. */
export const occasionPrintSearchSchema = z.object({
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
})
