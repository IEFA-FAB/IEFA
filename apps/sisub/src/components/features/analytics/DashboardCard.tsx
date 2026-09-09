import { useQuery } from "@tanstack/react-query"
import { Building2, LayoutDashboard, Users } from "lucide-react"
import { useState } from "react"
import { DashboardSkeleton } from "@/components/features/analytics/DashboardSkeleton"
import PresenceTable from "@/components/features/local/PresenceTable"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { aggregateDashboardMetrics } from "@/lib/dashboard"
import { unitDashboardQueryOptions } from "@/services/DashboardService"
import DashboardFilters from "./DashboardFilters"
import MealDistributionChart from "./MealDistributionChart"
import MessHallBreakdown from "./MessHallBreakdown"
import MetricsOverview from "./MetricsOverview"

export default function DashboardCard({ unitId }: { unitId: number }) {
	const [dateRange, setDateRange] = useState(() => {
		const today = new Date()
		const nextWeek = new Date(today)
		nextWeek.setDate(today.getDate() + 6)

		return {
			start: today.toISOString().split("T")[0],
			end: nextWeek.toISOString().split("T")[0],
		}
	})
	const [selectedMessHall, setSelectedMessHall] = useState<string>("all")

	const messHallIdParam = selectedMessHall === "all" ? undefined : Number(selectedMessHall)

	// Previsão, presença, refeitórios e diretório vêm juntos, do servidor, já recortados pela
	// unidade da rota — `unitId` deixou de ser ignorado, e com ele some o painel que somava
	// todos os refeitórios da FAB para quem só tinha acesso a um.
	const { data, isLoading } = useQuery(
		unitDashboardQueryOptions({
			unitId,
			messHallId: messHallIdParam,
			startDate: dateRange.start,
			endDate: dateRange.end,
		})
	)

	// A lista do filtro é a da unidade inteira, e não segue o refeitório selecionado — senão
	// escolher um refeitório apagaria as demais opções do seletor.
	const filteredMessHalls = data?.messHalls ?? []
	const forecastsData = data?.forecasts ?? []
	const presencesData = data?.presences ?? []

	// Aggregate metrics (only when data is available)
	const metrics = aggregateDashboardMetrics(forecastsData, presencesData, filteredMessHalls, dateRange)

	return (
		<Card>
			<CardContent className="space-y-6">
				{/* Filtros - Sticky outside tabs */}
				<DashboardFilters
					dateRange={dateRange}
					onDateRangeChange={setDateRange}
					messHalls={filteredMessHalls}
					selectedMessHall={selectedMessHall}
					onMessHallChange={setSelectedMessHall}
				/>

				{/* Shell-First Approach: Skeleton durante loading */}
				{isLoading ? (
					<DashboardSkeleton />
				) : (
					<>
						{/* Tabs for content organization */}
						<Tabs defaultValue="overview" className="w-full">
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="overview" className="gap-2">
									<LayoutDashboard className="size-4" aria-hidden="true" />
									<span className="hidden sm:inline">Resumo</span>
									<span className="sm:hidden">Resumo</span>
								</TabsTrigger>
								<TabsTrigger value="mess-halls" className="gap-2">
									<Building2 className="size-4" aria-hidden="true" />
									<span className="hidden sm:inline">Por Rancho</span>
									<span className="sm:hidden">Ranchos</span>
								</TabsTrigger>
								<TabsTrigger value="presence" className="gap-2">
									<Users className="size-4" aria-hidden="true" />
									<span className="hidden sm:inline">Presenças</span>
									<span className="sm:hidden">Pessoas</span>
								</TabsTrigger>
							</TabsList>

							<TabsContent value="overview" className="space-y-6 mt-6">
								<MetricsOverview metrics={metrics} />
								<MealDistributionChart data={metrics.daily_distribution} />
							</TabsContent>

							<TabsContent value="mess-halls" className="mt-6">
								<MessHallBreakdown data={metrics.by_mess_hall} />
							</TabsContent>

							<TabsContent value="presence" className="mt-6">
								<PresenceTable
									forecasts={forecastsData}
									presences={presencesData}
									users={data?.users ?? []}
									militaries={data?.militaries ?? []}
									messHalls={filteredMessHalls}
								/>
							</TabsContent>
						</Tabs>
					</>
				)}
			</CardContent>
		</Card>
	)
}
