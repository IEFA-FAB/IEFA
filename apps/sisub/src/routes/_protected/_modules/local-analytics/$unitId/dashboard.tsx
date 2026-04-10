import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import DashboardCard from "@/components/features/analytics/DashboardCard"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/local-analytics/$unitId/dashboard")({
	beforeLoad: ({ context }) => requirePermission(context, "local-analytics", 1),
	component: LocalDashboardPage,
	head: () => ({
		meta: [{ title: "Dashboard da Unidade" }, { name: "description", content: "Dashboard gerencial com previsões e presença em tempo real" }],
	}),
})

function LocalDashboardPage() {
	const { unitId } = Route.useParams()

	return (
		<div className="space-y-6">
			<PageHeader title="Dashboard" description="Previsões e presença em tempo real" />
			<DashboardCard unitId={Number(unitId)} />
		</div>
	)
}
