/**
 * O que cada cardápio pôs num dia do agendamento, pela origem gravada no item
 * (`origin_template_id`). É o grão dos imprevistos: adiar ou tirar do dia age sobre tudo o que
 * UM cardápio pôs ali. Produção de pedido de lanche fica de fora — ela segue o pedido.
 */
import { TEMPLATE_TYPE_VOCABULARY, type TemplateType } from "@iefa/sisub-domain/schemas"

export type DayOriginType = TemplateType

export type DayOrigin = {
	templateId: string
	type: DayOriginType | null
	typeLabel: string
	name: string
	itemCount: number
}

type ItemLike = { origin_template_id?: string | null; origin_template_type?: string | null; origin_snack_request_id?: string | null }
type MenuLike = { menu_items?: readonly ItemLike[] | null }
type TemplateLike = { id: string; name: string | null; template_type?: string | null }

const TYPE_LABEL: Record<DayOriginType, string> = { weekly: "Cardápio semanal", event: "Evento", apoio: "Cardápio de apoio" }
const TYPE_ORDER: Record<string, number> = { weekly: 0, event: 1, apoio: 2 }

/** O item gravado antes do contract do lote 5 ainda diz `exception` para o cardápio de apoio. */
function asType(value: string | null | undefined): DayOriginType | null {
	return TEMPLATE_TYPE_VOCABULARY.normalize(value)
}

export function dayOriginsOf(menus: readonly MenuLike[], templates: readonly TemplateLike[]): DayOrigin[] {
	const nameById = new Map(templates.map((t) => [t.id, t.name]))
	const byId = new Map<string, DayOrigin>()
	for (const menu of menus) {
		for (const item of menu.menu_items ?? []) {
			if (!item.origin_template_id || item.origin_snack_request_id) continue
			const current = byId.get(item.origin_template_id)
			if (current) {
				current.itemCount++
				continue
			}
			const type = asType(item.origin_template_type) ?? asType(templates.find((t) => t.id === item.origin_template_id)?.template_type)
			byId.set(item.origin_template_id, {
				templateId: item.origin_template_id,
				type,
				typeLabel: type ? TYPE_LABEL[type] : "Cardápio",
				// Cardápio apagado depois de aplicado continua tendo itens no dia: o nome some, a origem não.
				name: nameById.get(item.origin_template_id) ?? "Cardápio removido",
				itemCount: 1,
			})
		}
	}
	return [...byId.values()].sort((a, b) => (TYPE_ORDER[a.type ?? ""] ?? 3) - (TYPE_ORDER[b.type ?? ""] ?? 3) || a.name.localeCompare(b.name, "pt-BR"))
}
