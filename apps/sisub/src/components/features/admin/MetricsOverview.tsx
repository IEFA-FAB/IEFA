import { Card, CardContent } from "@iefa/ui";
import { Coffee, Moon, Users, Utensils } from "lucide-react";
import type { DashboardMetrics } from "@/types/domain/dashboard";

const MEAL_ICONS = {
	cafe: Coffee,
	almoco: Utensils,
	janta: Utensils,
	ceia: Moon,
} as const;

const MEAL_LABELS = {
	cafe: "Café",
	almoco: "Almoço",
	janta: "Janta",
	ceia: "Ceia",
} as const;

const MEAL_COLORS = {
	cafe: "from-chart-2/10 to-chart-2/5 border-chart-2/20",
	almoco: "from-chart-3/10 to-chart-3/5 border-chart-3/20",
	janta: "from-chart-5/10 to-chart-5/5 border-chart-5/20",
	ceia: "from-chart-1/10 to-chart-1/5 border-chart-1/20",
} as const;

const MEAL_ICON_COLORS = {
	cafe: "text-chart-2",
	almoco: "text-chart-3",
	janta: "text-chart-5",
	ceia: "text-chart-1",
} as const;

interface MetricsOverviewProps {
	metrics: DashboardMetrics;
}

export default function MetricsOverview({ metrics }: MetricsOverviewProps) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
			{/* Total Card - Full width on mobile */}
			<Card className="bg-linear-to-br from-primary/10 to-primary/5 border-2 col-span-2 lg:col-span-1">
				<CardContent className="p-4 md:p-6">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Users className="h-6 w-6 text-primary" aria-hidden="true" />
						</div>
						<div className="flex-1">
							<p className="text-xs md:text-sm text-muted-foreground font-medium">
								Total Previsto
							</p>
							<p className="text-2xl md:text-3xl font-bold text-primary">
								{metrics.total_forecast}
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								Presença: {metrics.total_presence}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* By Meal Type - 2 columns on mobile */}
			{metrics.by_meal_type.map((stat) => {
				const Icon = MEAL_ICONS[stat.meal];
				const color = MEAL_COLORS[stat.meal];
				const iconColor = MEAL_ICON_COLORS[stat.meal];

				return (
					<Card key={stat.meal} className={`bg-linear-to-br ${color} border`}>
						<CardContent className="p-4 md:p-6">
							<div className="flex items-center gap-2 md:gap-3">
								<div className="p-2 bg-white/50 rounded-lg">
									<Icon
										className={`h-4 w-4 md:h-5 md:w-5 ${iconColor}`}
										aria-hidden="true"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-xs md:text-sm text-muted-foreground font-medium truncate">
										{MEAL_LABELS[stat.meal]}
									</p>
									<div className="flex items-baseline gap-1 md:gap-2">
										<p className="text-xl md:text-2xl font-bold">
											{stat.forecast}
										</p>
										<span className="text-xs text-muted-foreground font-medium">
											{stat.percentage.toFixed(1)}%
										</span>
									</div>
									<p className="text-xs text-muted-foreground mt-1">
										Presença: {stat.presence}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
