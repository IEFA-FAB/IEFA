import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/$kitchenId/")({
	component: KitchenProductionPage,
	head: () => ({
		meta: [{ title: "Painel — Produção Cozinha" }],
	}),
})

function KitchenProductionPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Painel — Produção Cozinha" />
			<p className="text-muted-foreground">Conteúdo em desenvolvimento.</p>
		</div>
	)
}
