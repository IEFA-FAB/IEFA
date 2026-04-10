import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { fetchUnitsFn } from "@/server/mess-halls.fn"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/local-analytics/$unitId")({
	beforeLoad: async ({ context, params }) => {
		const unitId = Number(params.unitId)
		requirePermission(context, "local-analytics", 1, { type: "unit", id: unitId })

		const units = await context.queryClient.fetchQuery({
			queryKey: ["sisub", "units"],
			queryFn: () => fetchUnitsFn(),
			staleTime: 600_000,
		})

		const unit = units.find((u) => u.id === unitId)
		const scopeContext: ScopeContext = {
			id: unitId,
			name: unit?.display_name ?? unit?.code ?? String(unitId),
		}

		return { scopeContext }
	},
	component: () => <Outlet />,
})
