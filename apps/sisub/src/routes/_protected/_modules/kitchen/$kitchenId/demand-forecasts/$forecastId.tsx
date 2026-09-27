import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { DemandForecastEditor } from "@/components/features/local/demand-forecast/DemandForecastEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { useDemandForecasts, useSendDemandForecast, useUpdateDemandForecast } from "@/hooks/data/useDemandForecast"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import type { TemplateSelection } from "@/types/domain/ata"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/demand-forecasts/$forecastId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: EditDemandForecastPage,
})

function EditDemandForecastPage() {
	const { kitchenId: kitchenIdStr, forecastId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: forecasts, isLoading: isLoadingForecasts, isFetching: isFetchingForecasts } = useDemandForecasts(kitchenId)
	const forecast = forecasts?.find((d) => d.id === forecastId)
	useCrumbLabel(forecast?.title)
	// Chegar aqui vindo de /demand-forecasts/new significa cair sobre a listagem em cache, que
	// ainda é a de antes da criação: a previsão existe, mas não está nela. Sem esperar o
	// refetch, a tela diria "não encontrado" no instante seguinte ao toast que confirmou a
	// criação. "Não encontrado" só é verdade com a busca parada.
	const forecastPending = isLoadingForecasts || (!forecast && isFetchingForecasts)

	const { data: templates, isLoading: isLoadingTemplates } = useMenuTemplates(kitchenId)
	const { mutate: updateForecast, isPending: isSaving } = useUpdateDemandForecast()
	const { mutate: sendForecast, isPending: isSending } = useSendDemandForecast()

	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []
	const weeklyTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type === "weekly")
	// "Eventos / Refeições Especiais" agrupa eventos + exceções previsíveis.
	const eventTemplates = localTemplates.filter((t) => {
		const type = (t as typeof t & { template_type?: string }).template_type
		return type === "event" || type === "exception"
	})

	if (forecastPending) {
		return (
			<div className="space-y-6">
				<div className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
				<div className="h-48 animate-pulse rounded bg-muted" aria-hidden="true" />
			</div>
		)
	}

	if (!forecast) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Previsão não encontrada.</p>
			</div>
		)
	}

	const initialSelections: TemplateSelection[] = forecast.selections.map((s) => ({
		templateId: s.template.id,
		templateName: s.template.name || "",
		repetitions: s.repetitions,
	}))

	// Salvar mantém a previsão aberta — ela segue em elaboração depois do save, então tirar o
	// usuário da tela obrigava a reabrir para o ajuste seguinte. Quem encerra o fluxo é
	// "Enviar" (abaixo), que aí sim volta para a listagem.
	const handleSave = (title: string, notes: string, selections: TemplateSelection[]) => {
		updateForecast({ forecastId: forecast.id, updates: { title, notes: notes || null }, selections })
	}

	const handleSend = (title: string, notes: string, selections: TemplateSelection[]) => {
		updateForecast(
			{ forecastId: forecast.id, updates: { title, notes: notes || null }, selections },
			{
				onSuccess: () => {
					sendForecast(forecast.id, {
						onSuccess: () => {
							navigate({ to: "/kitchen/$kitchenId/demand-forecasts", params: { kitchenId: kitchenIdStr as string } })
						},
					})
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Editar previsão" description={`Editando: ${forecast.title}`} />
			<DemandForecastEditor
				initialTitle={forecast.title}
				initialNotes={forecast.notes || ""}
				initialSelections={initialSelections}
				weeklyTemplates={weeklyTemplates}
				eventTemplates={eventTemplates}
				isLoadingTemplates={isLoadingTemplates}
				isSaving={isSaving}
				isSending={isSending}
				onSave={handleSave}
				onSend={forecast.status === "pending" ? handleSend : undefined}
			/>
		</div>
	)
}
