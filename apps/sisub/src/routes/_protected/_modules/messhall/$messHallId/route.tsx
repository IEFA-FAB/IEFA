import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { fetchMessHallsFn } from "@/server/mess-halls.fn"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/messhall/$messHallId")({
	beforeLoad: async ({ context, params }) => {
		const messHallId = Number(params.messHallId)
		requirePermission(context, "messhall", 1, { type: "mess_hall", id: messHallId })

		// Busca os ranchos (cache de 10 min via React Query no servidor)
		const messHalls = await context.queryClient.fetchQuery({
			queryKey: ["sisub", "mess_halls"],
			queryFn: () => fetchMessHallsFn(),
			staleTime: 600_000,
		})

		const messHall = messHalls.find((mh) => mh.id === messHallId)
		const scopeContext: ScopeContext = {
			id: messHallId,
			name: messHall?.display_name ?? messHall?.code ?? String(messHallId),
		}

		return { scopeContext }
	},
	component: MessHallLayout,
})

function MessHallLayout() {
	return <Outlet />
}
