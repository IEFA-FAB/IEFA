import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@iefa/ui";
import {
	Building2,
	ChevronDown,
	ChevronRight,
	Maximize2,
	Minimize2,
	Minus,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { calculatePercentage } from "@/lib/dashboard";
import type { MessHallStats } from "@/types/domain/dashboard";

interface MessHallBreakdownProps {
	data: MessHallStats[];
}

export default function MessHallBreakdown({ data }: MessHallBreakdownProps) {
	// Track which cards are open (default: all closed for better UX)
	const [openIds, setOpenIds] = useState<Set<number>>(new Set());

	const toggleOpen = (id: number) => {
		setOpenIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const expandAll = () => {
		setOpenIds(new Set(data.map((m) => m.mess_hall_id)));
	};

	const collapseAll = () => {
		setOpenIds(new Set());
	};

	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Building2 className="h-5 w-5" aria-hidden="true" />
						Detalhamento por Rancho
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center h-32 text-muted-foreground">
						Sem dados para exibir
					</div>
				</CardContent>
			</Card>
		);
	}

	const getTrendIcon = (rate: number) => {
		if (rate >= 90) return <TrendingUp className="h-4 w-4" />;
		if (rate >= 70) return <Minus className="h-4 w-4" />;
		return <TrendingDown className="h-4 w-4" />;
	};

	const getTrendColor = (rate: number) => {
		if (rate >= 90) return "text-chart-2";
		if (rate >= 70) return "text-chart-3";
		return "text-chart-5";
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Building2 className="h-5 w-5" aria-hidden="true" />
							Detalhamento por Rancho
						</CardTitle>
						<CardDescription>
							Previsão e presença por refeitório
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={expandAll}
							className="text-xs gap-1"
							title="Expandir todos"
						>
							<Maximize2 className="h-3 w-3" aria-hidden="true" />
							<span className="hidden sm:inline">Expandir</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={collapseAll}
							className="text-xs gap-1"
							title="Recolher todos"
						>
							<Minimize2 className="h-3 w-3" aria-hidden="true" />
							<span className="hidden sm:inline">Recolher</span>
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{data.map((mh) => {
					const isOpen = openIds.has(mh.mess_hall_id);
					const attendanceRate = calculatePercentage(
						mh.total_presence,
						mh.total_forecast,
					);
					const trendColor = getTrendColor(attendanceRate);

					return (
						<Collapsible
							key={mh.mess_hall_id}
							open={isOpen}
							onOpenChange={() => toggleOpen(mh.mess_hall_id)}
						>
							<CollapsibleTrigger className="w-full">
								<div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
									<div className="flex items-center gap-3">
										{isOpen ? (
											<ChevronDown
												className="h-4 w-4 text-muted-foreground"
												aria-hidden="true"
											/>
										) : (
											<ChevronRight
												className="h-4 w-4 text-muted-foreground"
												aria-hidden="true"
											/>
										)}
										<h3 className="font-semibold text-lg text-left">
											{mh.mess_hall_name}
										</h3>
									</div>
									{/* Taxa de comparecimento sempre visível */}
									<div
										className={`flex items-center gap-2 ${trendColor} font-semibold`}
									>
										{getTrendIcon(attendanceRate)}
										<span className="text-sm">
											{attendanceRate.toFixed(1)}%
										</span>
									</div>
								</div>
							</CollapsibleTrigger>

							<CollapsibleContent>
								<div className="p-4 pt-3 space-y-4">
									{/* Grid com métricas */}
									<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
										<div>
											<p className="text-sm text-muted-foreground">
												Total Previsto
											</p>
											<p className="text-2xl font-bold">{mh.total_forecast}</p>
										</div>
										<div>
											<p className="text-sm text-muted-foreground">
												Total Presença
											</p>
											<p className="text-2xl font-bold">{mh.total_presence}</p>
										</div>
										<div className="col-span-2 md:col-span-1">
											<p className="text-sm text-muted-foreground">
												Taxa de Comparecimento
											</p>
											<p className={`text-2xl font-bold ${trendColor}`}>
												{attendanceRate.toFixed(1)}%
											</p>
										</div>
									</div>

									{/* By meal breakdown */}
									<div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t">
										{mh.by_meal.map((meal) => (
											<div
												key={meal.meal}
												className="p-2 bg-muted/50 rounded text-xs"
											>
												<span className="font-medium capitalize block mb-1">
													{meal.meal}
												</span>
												<div className="flex items-baseline gap-1">
													<span className="text-sm font-semibold">
														{meal.forecast}
													</span>
													<span className="text-muted-foreground">/</span>
													<span className="text-sm text-muted-foreground">
														{meal.presence}
													</span>
												</div>
											</div>
										))}
									</div>
								</div>
							</CollapsibleContent>
						</Collapsible>
					);
				})}
			</CardContent>
		</Card>
	);
}
