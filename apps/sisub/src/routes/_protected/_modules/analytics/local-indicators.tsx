import { createFileRoute, redirect } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"
import LocalIndicatorsCard from "@/components/features/analytics/LocalIndicatorsCard"

export const Route = createFileRoute("/_protected/_modules/analytics/local-indicators")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}
	},
	component: LocalIndicatorsPage,
	head: () => ({
		meta: [
			{ title: "Indicadores da Unidade" },
			{ name: "description", content: "Indicadores e relatórios da sua unidade" },
		],
	}),
})

function LocalIndicatorsPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Indicadores da Unidade" />
			<div className="grid grid-cols-1 gap-6 lg:gap-8">
				<LocalIndicatorsCard />
			</div>
		</div>
	)
}
