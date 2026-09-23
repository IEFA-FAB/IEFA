import { Sandwich } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import type { ProductionItem, ProductionSnackRequest } from "@/types/domain/production"

/**
 * Discriminação do item de pedido de lanche no quadro de produção: a cozinha precisa saber de
 * qual missão é cada kit — dois pedidos do mesmo padrão no mesmo dia não se misturam na
 * montagem nem na etiqueta. Item do rancho (`snack_request` nulo) não recebe nada.
 */

const PICKUP_TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })

export function formatSnackPickupTime(pickupAt: string): string {
	const time = Date.parse(pickupAt)
	return Number.isFinite(time) ? PICKUP_TIME.format(time) : "—"
}

export function snackKindLabel(missionKind: string): string {
	return missionKind === "terrestre" ? "Lanche de Apoio" : "Lanche de Bordo"
}

/** "Lanche de Bordo · <missão> · retirada HH:mm · <padrão>" */
export function describeSnackRequest(request: ProductionSnackRequest, options?: { withStandard?: boolean }): string {
	const parts = [snackKindLabel(request.mission_kind), request.mission_description, `retirada ${formatSnackPickupTime(request.pickup_at)}`]
	if (options?.withStandard !== false && request.standard_name) parts.push(request.standard_name)
	return parts.join(" · ")
}

export function SnackRequestTag({ request, withStandard = true, className }: { request: ProductionSnackRequest; withStandard?: boolean; className?: string }) {
	const text = describeSnackRequest(request, { withStandard })
	return (
		<Badge variant="accent" className={cn("max-w-full justify-start font-normal", className)} title={text}>
			<Sandwich />
			<span className="truncate">{text}</span>
		</Badge>
	)
}

export type ProductionItemGroup = { key: string; snackRequest: ProductionSnackRequest | null; items: ProductionItem[] }

/**
 * Rancho primeiro, na ordem em que veio; depois um grupo por pedido de lanche, pela hora de
 * retirada — é a ordem em que a produção precisa entregar.
 */
export function groupBySnackRequest(items: ProductionItem[]): ProductionItemGroup[] {
	const regular: ProductionItem[] = []
	const bySnack = new Map<string, ProductionItemGroup>()
	for (const item of items) {
		const request = item.menuItem.snack_request ?? null
		if (!request) {
			regular.push(item)
			continue
		}
		const group = bySnack.get(request.id) ?? { key: request.id, snackRequest: request, items: [] }
		group.items.push(item)
		bySnack.set(request.id, group)
	}
	const snackGroups = [...bySnack.values()].sort((a, b) => Date.parse(a.snackRequest?.pickup_at ?? "") - Date.parse(b.snackRequest?.pickup_at ?? ""))
	return [...(regular.length > 0 ? [{ key: "rancho", snackRequest: null, items: regular }] : []), ...snackGroups]
}
