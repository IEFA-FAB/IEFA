import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"

export const Route = createFileRoute("/_protected/_modules/analytics")({
	beforeLoad: ({ context }) => requirePermission(context, "analytics", 1),
	component: AnalyticsLayout,
	notFoundComponent: ModuleNotFound,
})

function AnalyticsLayout() {
	return <Outlet />
}
