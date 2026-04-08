import { createFileRoute } from "@tanstack/react-router"
import { addDays, format, isToday, parseISO, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { ProductionBoard } from "@/components/features/kitchen-production/ProductionBoard"
import { ProductionSummary } from "@/components/features/kitchen-production/ProductionSummary"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useProductionBoard, useUpdateTaskStatus } from "@/hooks/data/useProduction"
import type { ScopeContext } from "@/types/domain/scope"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/$kitchenId/")({
	component: KitchenProductionPage,
	head: () => ({
		meta: [{ title: "Painel — Produção Cozinha" }],
	}),
})

function KitchenProductionPage() {
	const { kitchenId: kitchenIdStr } = Route.useParams()
	const kitchenId = Number(kitchenIdStr)

	const ctx = Route.useRouteContext() as { scopeContext?: ScopeContext }
	const kitchenName = ctx.scopeContext?.name ?? `Cozinha ${kitchenId}`

	// Date state — defaults to today
	const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))

	const selectedDateObj = parseISO(selectedDate)
	const isTodaySelected = isToday(selectedDateObj)

	function goToPrevDay() {
		setSelectedDate(format(subDays(selectedDateObj, 1), "yyyy-MM-dd"))
	}

	function goToNextDay() {
		setSelectedDate(format(addDays(selectedDateObj, 1), "yyyy-MM-dd"))
	}

	function goToToday() {
		setSelectedDate(format(new Date(), "yyyy-MM-dd"))
	}

	// Data
	const { data, isLoading } = useProductionBoard(kitchenId, selectedDate)
	const { mutate: updateStatus, isPending: isUpdating } = useUpdateTaskStatus()

	const items = data ?? []

	return (
		<div className="flex flex-col gap-4 h-full">
			<PageHeader title="Painel de Produção" description={kitchenName}>
				{/* Date navigation */}
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="icon-sm" onClick={goToPrevDay} aria-label="Dia anterior">
						<ChevronLeft className="h-4 w-4" />
					</Button>

					<button
						type="button"
						className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium hover:bg-muted transition-colors"
						onClick={goToToday}
						title="Ir para hoje"
					>
						<span className="capitalize">{format(selectedDateObj, "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
						{isTodaySelected && (
							<Badge variant="secondary" className="text-xs">
								hoje
							</Badge>
						)}
					</button>

					<Button variant="ghost" size="icon-sm" onClick={goToNextDay} aria-label="Próximo dia">
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</PageHeader>

			<ProductionSummary items={items} />

			<ProductionBoard
				items={items}
				isLoading={isLoading}
				kitchenId={kitchenId}
				date={selectedDate}
				isUpdating={isUpdating}
				onUpdateStatus={(taskId, status, kId, date) => updateStatus({ taskId, status, kitchenId: kId, date })}
			/>
		</div>
	)
}
