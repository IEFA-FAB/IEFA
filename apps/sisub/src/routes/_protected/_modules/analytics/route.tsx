import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requirePermission } from "@/auth/pbac"

export const Route = createFileRoute("/_protected/_modules/analytics")({
	beforeLoad: ({ context }) => requirePermission(context, "analytics", 1),
	component: AnalyticsLayout,
})

function AnalyticsLayout() {
	return <Outlet />
}
