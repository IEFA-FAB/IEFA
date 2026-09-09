import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Building2, LayoutDashboard, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { DashboardSkeleton } from "@/components/features/analytics/DashboardSkeleton"
import PresenceTable from "@/components/features/local/PresenceTable"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

	// Trocar de unidade zera a seleção: refeitório de outra unidade agora é 404 da leitura
	// inteira, não filtro sem resultado — e o painel morreria em vez de mostrar a unidade nova.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset governado pela unidade
	useEffect(() => {
		setSelectedMessHall("all")
	}, [unitId])

	const messHallIdParam = selectedMessHall === "all" ? undefined : Number(selectedMessHall)

	// Previsão, presença, refeitórios e diretório vêm juntos, do servidor, já recortados pela
	// unidade da rota — `unitId` deixou de ser ignorado, e com ele some o painel que somava
	// todos os refeitórios da FAB para quem só tinha acesso a um.
	const { data, isLoading, error } = useQuery(
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
				) : error ? (
					// Falha tem que aparecer como falha: sem este ramo, `data` indefinido rende
					// métricas zeradas e tabela vazia — o painel afirmaria que não houve movimento
					// quando na verdade não conseguiu ler. Alcançável por intervalo acima do teto
					// (400), unidade sem permissão (403) e refeitório fora da unidade (404).
					<Alert variant="destructive">
						<AlertTriangle className="size-4" />
						<AlertTitle>Não foi possível carregar o painel</AlertTitle>
						<AlertDescription>{error instanceof Error ? error.message : "Erro desconhecido."}</AlertDescription>
					</Alert>
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
