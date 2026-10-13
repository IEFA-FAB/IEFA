import { MAX_EVENT_MEAL_GROUPS } from "@iefa/sisub-domain/schemas"
import {
	type EventMealDraft,
	findDuplicateGroup,
	groupSuggestionsFor,
	isGroupCountInverted,
	isSuggestionPresent,
	type OccasionGroup,
	parseGroupItemCount,
	resolveGroupKeys,
} from "@/lib/event-meals"
import type { OccasionMenuType } from "@/lib/occasion-menu"

/** Derivações puras do diálogo de refeição do evento ou do apoio (`EventMealDialog`). */

/** Tetos do schema (`TemplateEventMealSchema` / `MenuGroupSchema`): acima deles o salvamento inteiro seria recusado. */
export const MAX_NAME = 80
export const MAX_LABEL = 60

/**
 * Linha da composição no diálogo. `key` vazia = grupo novo, a chave sai do rótulo ao salvar. A
 * contagem esperada fica como o usuário digitou até salvar.
 */
export type DraftGroup = { key: string; label: string; minItems: string; maxItems: string }

export function toDraftGroup(g: OccasionGroup): DraftGroup {
	return { key: g.key, label: g.label, minItems: g.minItems != null ? String(g.minItems) : "", maxItems: g.maxItems != null ? String(g.maxItems) : "" }
}

export function fromDraftGroup(g: DraftGroup): OccasionGroup {
	const minItems = parseGroupItemCount(g.minItems)
	const maxItems = parseGroupItemCount(g.maxItems)
	return { key: g.key, label: g.label, ...(minItems != null && { minItems }), ...(maxItems != null && { maxItems }) }
}

/** O que o diálogo cobra da refeição em edição e se ela pode ser gravada no rascunho. */
export function assessEventMealDraft({
	meal,
	name,
	mealTypeId,
	groups,
	templateType,
	countLeaving,
}: {
	meal: EventMealDraft | null
	name: string
	mealTypeId: string
	groups: readonly DraftGroup[]
	templateType: OccasionMenuType
	countLeaving: (mealId: string, groups: readonly OccasionGroup[]) => number
}) {
	const isSupportMenu = templateType === "apoio"
	// A chave só é derivada do rótulo quando o grupo é NOVO: regerá-la ao renomear tiraria de
	// grupo todas as preparações que já estavam nele.
	const resolved = resolveGroupKeys(groups.map(fromDraftGroup))
	const hasBlank = groups.some((g) => g.label.trim() === "")
	const duplicate = findDuplicateGroup(resolved)
	const tooMany = groups.length > MAX_EVENT_MEAL_GROUPS
	// Mínimo acima do máximo o servidor recusaria. Contagem FORA do esperado não trava nada.
	const invertedCount = resolved.find(isGroupCountInverted)
	const leaving = meal ? countLeaving(meal.id, resolved) : 0
	// Sugestão some quando a chave OU o rótulo já está na composição ("Bebidas" digitado esconde a sugestão "Bebidas").
	const suggestions = groupSuggestionsFor(templateType).filter((s) => !isSuggestionPresent(s, resolved))
	// Evento precisa de ao menos uma coluna; o apoio sem grupo é o kit simples.
	const missingGroups = !isSupportMenu && groups.length === 0

	// `maxLength` segura a digitação; isto segura o que chega colado ou de rascunho antigo.
	const tooLong = name.trim().length > MAX_NAME || resolved.some((g) => g.label.length > MAX_LABEL)
	const canSave = meal != null && name.trim() !== "" && mealTypeId !== "" && !missingGroups && !hasBlank && !duplicate && !tooMany && !tooLong && !invertedCount
	return { resolved, hasBlank, duplicate, tooMany, invertedCount, leaving, suggestions, missingGroups, canSave }
}

export function getEventMealDialogTitle(isNew: boolean, isSupportMenu: boolean): string {
	return isNew ? (isSupportMenu ? "Nova refeição do apoio" : "Nova refeição do evento") : "Editar refeição"
}
