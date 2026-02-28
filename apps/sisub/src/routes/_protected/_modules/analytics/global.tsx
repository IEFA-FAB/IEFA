import { createFileRoute, redirect } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"
import IndicatorsCard from "@/components/features/analytics/GlobalIndicatorsCard"

export const Route = createFileRoute("/_protected/_modules/analytics/global")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}
	},
	component: SuperAdminPanel,
	head: () => ({
		meta: [
			{ title: "Painel SuperAdmin" },
			{
				name: "description",
				content: "Controle o sistema de subsistência",
			},
		],
	}),
})

function SuperAdminPanel() {
	return (
		<div className="space-y-6">
			<PageHeader title="Análise Sistêmica" />
			<div className="grid grid-cols-1 gap-6 lg:gap-8">
				<IndicatorsCard />
			</div>
		</div>
	)
}
