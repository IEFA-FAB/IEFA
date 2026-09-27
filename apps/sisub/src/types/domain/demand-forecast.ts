import type { Tables } from "@iefa/database/sisub"

/** Previsão de demanda da cozinha: insumo do DFD e do anexo quantitativo do TR. */
export type DemandForecast = Tables<"kitchen_demand_forecast">
export type DemandForecastSelection = Tables<"kitchen_demand_forecast_selection">

/** Previsão com os cardápios escolhidos e os anexos em que a unidade já a importou. */
export interface DemandForecastWithSelections extends DemandForecast {
	selections: (DemandForecastSelection & {
		template: {
			id: string
			name: string | null
			template_type: string
		}
	})[]
	/** Anexos quantitativos em que a unidade já importou esta previsão. */
	imports: { quantity_estimate_id: string; title: string; imported_at: string }[]
}
