import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	BarChart3,
	Building2,
	LayoutDashboard,
	UserCog,
	Users,
} from "lucide-react";
import { useState } from "react";
import { aggregateDashboardMetrics } from "@/lib/dashboard";
import type { AdminProfile } from "@/services/AdminService";
import {
	dashboardForecastsQueryOptions,
	dashboardPresencesQueryOptions,
	messHallsQueryOptions,
} from "@/services/DashboardService";

import DashboardFilters from "./DashboardFilters";
import MealDistributionChart from "./MealDistributionChart";
import MessHallBreakdown from "./MessHallBreakdown";
import MetricsOverview from "./MetricsOverview";
import PresenceTable from "./PresenceTable";

interface DashboardCardProps {
	profile: AdminProfile;
}

export default function DashboardCard({ profile }: DashboardCardProps) {
	// Calculate default date range (next 7 days)
	const getDefaultDateRange = () => {
		const today = new Date();
		const nextWeek = new Date(today);
		nextWeek.setDate(today.getDate() + 6);

		return {
			start: today.toISOString().split("T")[0],
			end: nextWeek.toISOString().split("T")[0],
		};
	};

	const [dateRange, setDateRange] = useState(getDefaultDateRange());
	const [selectedMessHall, setSelectedMessHall] = useState<string>("all");

	// Determine unit_id based on role
	const isSuperAdmin = profile.role === "superadmin";

	const { data: messHalls = [] } = useSuspenseQuery(
		messHallsQueryOptions(undefined),
	);

	// Filter mess halls by admin's om if admin (not superadmin)
	const filteredMessHalls = isSuperAdmin
		? messHalls
		: messHalls.filter(() => {
				// TODO: Proper filtering based on profile.om
				return true;
			});

	// Fetch forecasts and presences
	const messHallIdParam =
		selectedMessHall === "all" ? undefined : Number(selectedMessHall);

	const { data: forecasts = [] } = useSuspenseQuery(
		dashboardForecastsQueryOptions({
			mess_hall_id: messHallIdParam,
			startDate: dateRange.start,
			endDate: dateRange.end,
		}),
	);

	const { data: presences = [] } = useSuspenseQuery(
		dashboardPresencesQueryOptions({
			mess_hall_id: messHallIdParam,
			startDate: dateRange.start,
			endDate: dateRange.end,
		}),
	);

	// Aggregate metrics
	const metrics = aggregateDashboardMetrics(
		forecasts,
		presences,
		filteredMessHalls,
		dateRange,
	);

	return (
		<Card className="border-2">
			<CardHeader>
				<div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border w-fit">
					<BarChart3 className="h-4 w-4" aria-hidden="true" />
					Indicadores
				</div>
				<CardTitle>Indicadores da Unidade</CardTitle>
				<CardDescription>
					Dashboard gerencial com previsões e presença em tempo real
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Filtros - Sticky outside tabs */}
				<DashboardFilters
					dateRange={dateRange}
					onDateRangeChange={setDateRange}
					messHalls={filteredMessHalls}
					selectedMessHall={selectedMessHall}
					onMessHallChange={setSelectedMessHall}
				/>

				{/* Tabs for content organization */}
				<Tabs defaultValue="overview" className="w-full">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="overview" className="gap-2">
							<LayoutDashboard className="h-4 w-4" aria-hidden="true" />
							<span className="hidden sm:inline">Resumo</span>
							<span className="sm:hidden">Resumo</span>
						</TabsTrigger>
						<TabsTrigger value="mess-halls" className="gap-2">
							<Building2 className="h-4 w-4" aria-hidden="true" />
							<span className="hidden sm:inline">Por Rancho</span>
							<span className="sm:hidden">Ranchos</span>
						</TabsTrigger>
						<TabsTrigger value="presence" className="gap-2">
							<Users className="h-4 w-4" aria-hidden="true" />
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
						<PresenceTable forecasts={forecasts} presences={presences} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
