import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { DemandForecastEditor } from "@/components/features/local/demand-forecast/DemandForecastEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { useCreateDemandForecast, useSendDemandForecast } from "@/hooks/data/useDemandForecast"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import type { TemplateSelection } from "@/types/domain/quantity-estimate"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/demand-forecasts/new")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: NewDemandForecastPage,
})

function NewDemandForecastPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: templates, isLoading: isLoadingTemplates } = useMenuTemplates(kitchenId)
	const { mutate: createForecast, isPending: isSaving } = useCreateDemandForecast()
	const { mutate: sendAfterCreate, isPending: isSending } = useSendDemandForecast()

	// Separar templates locais por tipo
	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []
	const weeklyTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type === "weekly")
	// "Eventos / Refeições Especiais" agrupa eventos + exceções previsíveis.
	const eventTemplates = localTemplates.filter((t) => {
		const type = (t as typeof t & { template_type?: string }).template_type
		return type === "event" || type === "exception"
	})

	// Salvar a previsão continua no editor: a rota "new" não tem id, então o destino é a
	// própria tela de edição da previsão recém-criada — não a listagem. Salvar é um marco
	// do trabalho em curso; quem termina usa "Enviar", que aí sim encerra o fluxo.
	const handleSave = (title: string, notes: string, selections: TemplateSelection[]) => {
		createForecast(
			{ kitchenId, title, notes: notes || undefined, selections },
			{
				onSuccess: (forecast) => {
					if (!forecast) return
					navigate({
						to: "/kitchen/$kitchenId/demand-forecasts/$forecastId",
						params: { kitchenId: kitchenIdStr as string, forecastId: forecast.id },
						replace: true,
					})
				},
			}
		)
	}

	const handleSend = (title: string, notes: string, selections: TemplateSelection[]) => {
		createForecast(
			{ kitchenId, title, notes: notes || undefined, selections },
			{
				onSuccess: (forecast) => {
					if (forecast) {
						sendAfterCreate(forecast.id, {
							onSuccess: () => {
								navigate({ to: "/kitchen/$kitchenId/demand-forecasts", params: { kitchenId: kitchenIdStr as string } })
							},
						})
					}
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Nova previsão de demanda"
				description="Selecione os cardápios semanais, eventos e cardápios de apoio que a cozinha vai produzir e quantas vezes."
			/>
			<DemandForecastEditor
				weeklyTemplates={weeklyTemplates}
				eventTemplates={eventTemplates}
				isLoadingTemplates={isLoadingTemplates}
				isSaving={isSaving}
				isSending={isSending}
				onSave={handleSave}
				onSend={handleSend}
			/>
		</div>
	)
}
