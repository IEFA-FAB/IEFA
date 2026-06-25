import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"
import { expectArray } from "@/lib/observability/expect-array"
import { fetchMessHallsFn } from "@/server/mess-halls.fn"
import type { MessHall } from "@/types/domain/meal"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/messhall/$messHallId")({
	beforeLoad: async ({ context, params, preload }) => {
		const messHallId = Number(params.messHallId)
		requirePermission({ context, preload }, "messhall", 1, { type: "mess_hall", id: messHallId })

		// Busca os ranchos (cache de 10 min via React Query no servidor)
		const messHalls = expectArray<MessHall>(
			await context.queryClient.fetchQuery({
				queryKey: ["sisub", "mess_halls"],
				queryFn: () => fetchMessHallsFn(),
				staleTime: 600_000,
			}),
			{ source: "fetchMessHallsFn", route: "messhall/$messHallId" }
		)

		const messHall = messHalls.find((mh) => mh.id === messHallId)
		if (!messHall) throw redirect({ to: "/messhall", replace: true })

		const scopeContext: ScopeContext = {
			id: messHallId,
			name: messHall.display_name ?? messHall.code ?? String(messHallId),
		}

		return { scopeContext }
	},
	component: MessHallLayout,
	notFoundComponent: ModuleNotFound,
})

function MessHallLayout() {
	return <Outlet />
}
