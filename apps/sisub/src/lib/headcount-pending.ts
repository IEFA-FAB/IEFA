/**
 * Pendência "efetivo a definir" de uma refeição do dia: o cardápio foi aplicado sem efetivo (o
 * modelo global só tem %, ou a cozinha ainda não sabia o número) e há preparação sem porções
 * esperando por ele. Informar o efetivo da refeição calcula essas porções (`updateHeadcount`).
 *
 * Item de evento ou apoio não conta: ele mede pela refeição do evento ou pelos kits, e o efetivo
 * da rotina não o preenche — é o mesmo corte de `portionsForArrivingHeadcount` no domínio.
 */
type ItemLike = { planned_portion_quantity?: number | null; origin_template_type?: string | null }
type MenuLike = { forecasted_headcount?: number | null; menu_items?: readonly ItemLike[] | null }

const OCCASION_ORIGINS = new Set(["event", "apoio"])

export function isHeadcountPending(menu: MenuLike): boolean {
	if (menu.forecasted_headcount != null) return false
	return (menu.menu_items ?? []).some((item) => item.planned_portion_quantity == null && !OCCASION_ORIGINS.has(item.origin_template_type ?? ""))
}
