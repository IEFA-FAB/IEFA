/**
 * O que cada cardápio pôs num dia do agendamento, pela origem gravada no item
 * (`origin_template_id`). É o grão dos imprevistos: adiar ou tirar do dia age sobre tudo o que
 * UM cardápio pôs ali. Produção de pedido de lanche fica de fora — ela segue o pedido.
 */
export type DayOriginType = "weekly" | "event" | "exception"

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

const TYPE_LABEL: Record<DayOriginType, string> = { weekly: "Cardápio semanal", event: "Evento", exception: "Apoio" }
const TYPE_ORDER: Record<string, number> = { weekly: 0, event: 1, exception: 2 }

function asType(value: string | null | undefined): DayOriginType | null {
	return value === "weekly" || value === "event" || value === "exception" ? value : null
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
