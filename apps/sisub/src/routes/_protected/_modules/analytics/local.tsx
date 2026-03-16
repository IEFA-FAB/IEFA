import { createFileRoute, redirect } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"
import DashboardCard from "@/components/features/analytics/DashboardCard"

export const Route = createFileRoute("/_protected/_modules/analytics/local")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}
	},
	component: LocalAnalyticsPage,
	head: () => ({
		meta: [{ title: "Análise Local" }, { name: "description", content: "Análises da sua unidade" }],
	}),
})

function LocalAnalyticsPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Análise Local" description="Dashboard gerencial com previsões e presença em tempo real" />
			<DashboardCard />
		</div>
	)
}
