import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"
import { expectArray } from "@/lib/observability/expect-array"
import { fetchUnitsFn } from "@/server/mess-halls.fn"
import type { Unit } from "@/types/domain/meal"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId")({
	beforeLoad: async ({ context, params, preload }) => {
		const unitId = Number(params.unitId)
		requirePermission({ context, preload }, "unit", 1, { type: "unit", id: unitId })

		const units = expectArray<Unit>(
			await context.queryClient.fetchQuery({
				queryKey: ["sisub", "units"],
				queryFn: () => fetchUnitsFn(),
				staleTime: 600_000,
			}),
			{ source: "fetchUnitsFn", route: "unit/$unitId" }
		)

		const unit = units.find((u) => u.id === unitId)
		if (!unit) throw redirect({ to: "/unit", replace: true })

		const scopeContext: ScopeContext = {
			id: unitId,
			name: unit.display_name ?? unit.code ?? String(unitId),
		}

		return { scopeContext }
	},
	component: UnitLayout,
	notFoundComponent: ModuleNotFound,
})

function UnitLayout() {
	return <Outlet />
}
