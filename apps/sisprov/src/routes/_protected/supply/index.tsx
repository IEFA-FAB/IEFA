import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/PageHeader"
import { ModuleFoundation } from "@/components/ModuleFoundation"

export const Route = createFileRoute("/_protected/supply/")({
	component: SupplyPage,
})

function SupplyPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Almoxarifado"
				description="Ordens de fornecimento recebidas, estoque de fardamento da OM, distribuição ao militar, troca e devolução."
			/>
			<ModuleFoundation
				title="Módulo em fundação"
				description="O acesso está concedido e a casca existe. O almoxarifado só opera depois que o ledger do núcleo aceitar itens de fardamento."
				upcoming={[
					{
						title: "Catálogo de fardamento",
						description: "Famílias, variantes por gênero, grade de tamanhos e itens sobre core.item.",
						change: "sisprov-catalog",
					},
					{
						title: "Estoque de fardamento no ledger do núcleo",
						description: "Saldo por item e tamanho na OM; recebimento da OF.",
						change: "sisprov-core-inventory",
					},
					{
						title: "Distribuição ao militar",
						description: "Por planejamento com confirmação por SARAM, troca, devolução e avulsa com justificativa.",
						change: "sisprov-distribution",
					},
				]}
			/>
		</div>
	)
}
