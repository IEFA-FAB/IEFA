import { createFileRoute, Outlet, redirect, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"
import { useRealtimeSubscription } from "@/hooks/realtime/useRealtime"
import { fetchKitchensFn } from "@/server/kitchens.fn"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId")({
	beforeLoad: async ({ context, params }) => {
		const kitchenId = Number(params.kitchenId)
		requirePermission(context, "kitchen", 1, { type: "kitchen", id: kitchenId })

		const kitchens = await context.queryClient.fetchQuery({
			queryKey: ["user", "kitchens"],
			queryFn: () => fetchKitchensFn(),
			staleTime: 600_000,
		})

		const kitchen = kitchens.find((k) => k.id === kitchenId)
		if (!kitchen) throw redirect({ to: "/kitchen", replace: true })

		const scopeContext: ScopeContext = {
			id: kitchenId,
			name: kitchen.unit?.display_name ?? kitchen.unit?.code ?? `Cozinha ${kitchenId}`,
		}

		return { scopeContext }
	},
	component: KitchenLayout,
	notFoundComponent: ModuleNotFound,
})

function KitchenLayout() {
	const { kitchenId } = useParams({ from: "/_protected/_modules/kitchen/$kitchenId" })
	const filter = `kitchen_id=eq.${kitchenId}`

	useRealtimeSubscription({
		table: "daily_menu",
		queryKeyPrefix: ["planning"],
		message: "Cardápio atualizado por outro usuário",
		filter,
	})

	useRealtimeSubscription({
		table: "recipes",
		queryKeyPrefix: ["recipes"],
		message: "Preparação atualizada por outro usuário",
		filter,
	})

	useRealtimeSubscription({
		table: "menu_items",
		queryKeyPrefix: ["planning", "procurement"],
		message: "Item do cardápio atualizado",
		filter,
	})

	return <Outlet />
}
