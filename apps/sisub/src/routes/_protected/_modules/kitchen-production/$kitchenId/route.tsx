import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { fetchKitchensFn } from "@/server/kitchens.fn"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/$kitchenId")({
	beforeLoad: async ({ context, params }) => {
		const kitchenId = Number(params.kitchenId)
		requirePermission(context, "kitchen-production", 1, { type: "kitchen", id: kitchenId })

		const kitchens = await context.queryClient.fetchQuery({
			queryKey: ["user", "kitchens"],
			queryFn: () => fetchKitchensFn(),
			staleTime: 10 * 60 * 1000,
		})

		const kitchen = kitchens.find((k) => k.id === kitchenId)
		const scopeContext: ScopeContext = {
			id: kitchenId,
			name: kitchen?.unit?.display_name ?? kitchen?.unit?.code ?? `Cozinha ${kitchenId}`,
		}

		return { scopeContext }
	},
	component: () => <Outlet />,
})
