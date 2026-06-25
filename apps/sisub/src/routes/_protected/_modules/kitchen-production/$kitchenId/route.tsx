import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"
import { expectArray } from "@/lib/observability/expect-array"
import type { KitchenWithUnit } from "@/server/kitchens.fn"
import { fetchKitchensFn } from "@/server/kitchens.fn"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/$kitchenId")({
	beforeLoad: async ({ context, params, preload }) => {
		const kitchenId = Number(params.kitchenId)
		requirePermission({ context, preload }, "kitchen-production", 1, { type: "kitchen", id: kitchenId })

		const kitchens = expectArray<KitchenWithUnit>(
			await context.queryClient.fetchQuery({
				queryKey: ["user", "kitchens"],
				queryFn: () => fetchKitchensFn(),
				staleTime: 10 * 60 * 1000,
			}),
			{ source: "fetchKitchensFn", route: "kitchen-production/$kitchenId" }
		)

		const kitchen = kitchens.find((k) => k.id === kitchenId)
		if (!kitchen) throw redirect({ to: "/kitchen-production", replace: true })

		const scopeContext: ScopeContext = {
			id: kitchenId,
			name: kitchen.unit?.display_name ?? kitchen.unit?.code ?? `Cozinha ${kitchenId}`,
		}

		return { scopeContext }
	},
	component: () => <Outlet />,
	notFoundComponent: ModuleNotFound,
})
