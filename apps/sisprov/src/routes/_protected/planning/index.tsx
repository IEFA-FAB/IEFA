import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/PageHeader"
import { ModuleFoundation } from "@/components/ModuleFoundation"

export const Route = createFileRoute("/_protected/planning/")({
	component: PlanningPage,
})

function PlanningPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Planejamento" description="Elo SISPROV na OM: previsão de incorporação, coleta de tamanhos e grupos de demanda." />
			<ModuleFoundation
				title="Módulo em fundação"
				description="O acesso está concedido e a casca existe. As telas de planejamento chegam nos próximos changes, um por vez, nesta ordem."
				upcoming={[
					{
						title: "Grupos de demanda e enxovais da OM",
						description: "Grupos por atividade, enxoval com quantidade e frequência de renovação.",
						change: "sisprov-demand-groups",
					},
					{
						title: "Coleta de tamanhos e adesão por turma",
						description: "Ficha de tamanhos por SARAM e acompanhamento da adesão da incorporação.",
						change: "sisprov-size-records",
					},
					{
						title: "Previsão de incorporação com cenários",
						description: "Estimativa por regressão sobre o SIGPES, ajustada pelo elo da OM.",
						change: "sisprov-engine",
					},
				]}
			/>
		</div>
	)
}
