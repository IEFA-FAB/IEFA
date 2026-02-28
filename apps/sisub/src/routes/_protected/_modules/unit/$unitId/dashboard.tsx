import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/dashboard")({
	component: UnitDashboardPage,
	head: () => ({
		meta: [{ title: "Painel — Gestão Unidade" }],
	}),
})

function UnitDashboardPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Painel — Gestão Unidade" />
			<p className="text-muted-foreground">Conteúdo em desenvolvimento.</p>
		</div>
	)
}
