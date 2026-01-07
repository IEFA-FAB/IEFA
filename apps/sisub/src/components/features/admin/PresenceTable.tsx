import {
	Avatar,
	AvatarFallback,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	Check,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Copy,
	TrendingDown,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { aggregatePresenceData } from "@/lib/dashboard";
import {
	messHallsQueryOptions,
	userDataQueryOptions,
	userMilitaryDataQueryOptions,
} from "@/services/DashboardService";
import type {
	AggregatedPresenceRecord,
	DashboardPresenceRecord,
	ForecastRecord,
	PersonDetail,
} from "@/types/domain/dashboard";

interface PresenceTableProps {
	forecasts: ForecastRecord[];
	presences: DashboardPresenceRecord[];
}

const MEAL_LABELS = {
	cafe: "Café",
	almoco: "Almoço",
	janta: "Janta",
	ceia: "Ceia",
} as const;

// Additional visual improvements for meals
const MEAL_BADGES = {
	cafe: "bg-chart-2/10 text-chart-2 border-chart-2/20",
	almoco: "bg-chart-3/10 text-chart-3 border-chart-3/20",
	janta: "bg-chart-5/10 text-chart-5 border-chart-5/20",
	ceia: "bg-chart-1/10 text-chart-1 border-chart-1/20",
} as const;

function getInitials(name: string) {
	return name
		.split(" ")
		.map((n) => n[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function PersonCard({
	person,
	variant,
}: {
	person: PersonDetail;
	variant: "missing" | "present" | "extra";
}) {
	const borderClass = {
		missing: "border-chart-5/20 bg-chart-5/5 hover:border-chart-5/30",
		present: "border-chart-2/20 bg-chart-2/5 hover:border-chart-2/30",
		extra: "border-chart-1/20 bg-chart-1/5 hover:border-chart-1/30",
	};

	const avatarClass = {
		missing: "bg-chart-5/10 text-chart-5",
		present: "bg-chart-2/10 text-chart-2",
		extra: "bg-chart-1/10 text-chart-1",
	};

	const icon = {
		missing: <X className="h-3 w-3 text-chart-5" />,
		present: <Check className="h-3 w-3 text-chart-2" />,
		extra: <AlertTriangle className="h-3 w-3 text-chart-1" />,
	};

	const displayName = person.name || person.email.split("@")[0];

	return (
		<div
			className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${borderClass[variant]}`}
		>
			<div className="relative">
				<Avatar
					className={`h-10 w-10 border-2 border-white ${avatarClass[variant]}`}
				>
					<AvatarFallback className={avatarClass[variant]}>
						{getInitials(displayName)}
					</AvatarFallback>
				</Avatar>
				<div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border shadow-sm">
					{icon[variant]}
				</div>
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold truncate" title={displayName}>
					{displayName}
				</p>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium text-foreground/80">
						{person.posto || "-"}
					</span>
					<span>•</span>
					<span className="truncate">{person.org || "-"}</span>
				</div>
			</div>
		</div>
	);
}

export default function PresenceTable({
	forecasts,
	presences,
}: PresenceTableProps) {
	const [openIds, setOpenIds] = useState<Set<string>>(new Set());

	// Get unique user IDs from forecasts and presences
	const forecastUserIds = Array.from(new Set(forecasts.map((f) => f.user_id)));
	const presenceUserIds = Array.from(new Set(presences.map((p) => p.user_id)));
	const allUserIds = Array.from(
		new Set([...forecastUserIds, ...presenceUserIds]),
	);

	// Fetch user data
	const { data: userData = [] } = useSuspenseQuery(
		userDataQueryOptions(allUserIds.length > 0 ? allUserIds : undefined),
	);

	// Extract nrOrdens and fetch military data
	const nrOrdemList = userData
		.filter((u) => u.nrOrdem !== null)
		.map((u) => u.nrOrdem as string);

	const { data: militaryData = [] } = useSuspenseQuery(
		userMilitaryDataQueryOptions(
			nrOrdemList.length > 0 ? nrOrdemList : undefined,
		),
	);

	// Fetch mess halls for names
	const { data: messHalls = [] } = useSuspenseQuery(
		messHallsQueryOptions(undefined),
	);

	// Aggregate data
	const aggregatedData = aggregatePresenceData(
		forecasts,
		presences,
		userData,
		militaryData,
		messHalls,
	);

	const toggleOpen = (id: string) => {
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

	const handleCopyCsv = (record: AggregatedPresenceRecord) => {
		const headers = "Nome,Posto,Organizacao,Status,Email";
		const rows = [
			...record.absences.map(
				(p) =>
					`"${p.name || ""}",${p.posto || ""},${p.org || ""},Faltou,${p.email}`,
			),
			...record.attended.map(
				(p) =>
					`"${p.name || ""}",${p.posto || ""},${p.org || ""},Compareceu,${p.email}`,
			),
			...record.extras.map(
				(p) =>
					`"${p.name || ""}",${p.posto || ""},${p.org || ""},Extra,${p.email}`,
			),
		];
		const csvContent = [headers, ...rows].join("\n");

		navigator.clipboard.writeText(csvContent);
		toast.success("Dados copiados para a área de transferência", {
			description: `${rows.length} registros exportados`,
			icon: <CheckCircle className="h-4 w-4 text-chart-2" />,
		});
	};

	const getRowKey = (record: AggregatedPresenceRecord) =>
		`${record.date}|${record.meal}|${record.mess_hall_id}`;

	const getRateColor = (rate: number) => {
		if (rate >= 90) return "text-chart-2";
		if (rate >= 70) return "text-chart-3";
		return "text-chart-5";
	};

	const getRateIcon = (rate: number) => {
		if (rate >= 90) return <TrendingUp className="h-4 w-4" />;
		if (rate >= 70) return <Check className="h-4 w-4" />;
		return <TrendingDown className="h-4 w-4" />;
	};

	if (aggregatedData.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Users className="h-5 w-5" aria-hidden="true" />
						Análise de Presenças
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center h-32 text-muted-foreground">
						Sem previsões para o período selecionado
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Users className="h-5 w-5" aria-hidden="true" />
					Análise de Presenças
				</CardTitle>
				<CardDescription>
					Comparação entre previsões e presenças por dia, refeição e rancho
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10"></TableHead>
								<TableHead>Data</TableHead>
								<TableHead>Rancho</TableHead>
								<TableHead>Refeição</TableHead>
								<TableHead className="text-center">Previsto</TableHead>
								<TableHead className="text-center">Presença</TableHead>
								<TableHead className="text-center">Diferença</TableHead>
								<TableHead className="text-center">Taxa</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{aggregatedData.map((record) => {
								const rowKey = getRowKey(record);
								const isOpen = openIds.has(rowKey);
								const rateColor = getRateColor(record.attendance_rate);
								const hasAbsences = record.absences.length > 0;
								const hasExtras = record.extras.length > 0;

								return (
									<>
										{/* Main Row */}
										<TableRow
											key={rowKey}
											className="cursor-pointer hover:bg-muted/50"
											onClick={() => toggleOpen(rowKey)}
										>
											<TableCell>
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
											</TableCell>
											<TableCell className="font-medium">
												<div className="flex flex-col">
													<span>
														{new Date(record.date).toLocaleDateString("pt-BR", {
															day: "2-digit",
															month: "2-digit",
														})}
													</span>
													<span className="text-xs text-muted-foreground capitalize">
														{new Date(record.date).toLocaleDateString("pt-BR", {
															weekday: "short",
														})}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-sm">
												{record.mess_hall_name}
											</TableCell>
											<TableCell>
												<span
													className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${MEAL_BADGES[record.meal]}`}
												>
													{MEAL_LABELS[record.meal]}
												</span>
											</TableCell>
											<TableCell className="text-center font-semibold">
												{record.forecast_count}
											</TableCell>
											<TableCell className="text-center font-semibold">
												{record.presence_count}
											</TableCell>
											<TableCell
												className={`text-center font-semibold ${
													record.difference < 0
														? "text-orange-600"
														: record.difference > 0
															? "text-blue-600"
															: "text-muted-foreground"
												}`}
											>
												{record.difference > 0 ? "+" : ""}
												{record.difference}
											</TableCell>
											<TableCell className="text-center">
												<div
													className={`flex items-center justify-center gap-1 ${rateColor} font-semibold`}
												>
													{getRateIcon(record.attendance_rate)}
													<span className="text-sm">
														{record.attendance_rate.toFixed(1)}%
													</span>
												</div>
											</TableCell>
										</TableRow>

										{/* Drill-down Row */}
										{isOpen && (
											<TableRow>
												<TableCell colSpan={8} className="bg-muted/10 p-0">
													<div className="p-6 space-y-8 border-t border-b bg-muted/20">
														<div className="flex items-center justify-between">
															<h3 className="font-semibold text-lg flex items-center gap-2">
																Detalhamento
																<span className="text-sm font-normal text-muted-foreground">
																	(
																	{record.forecast_count + record.extras.length}{" "}
																	pessoas total)
																</span>
															</h3>
															<Button
																variant="outline"
																size="sm"
																onClick={() => handleCopyCsv(record)}
																className="gap-2"
															>
																<Copy className="h-4 w-4" />
																Copiar CSV
															</Button>
														</div>

														{/* Absences */}
														{hasAbsences && (
															<div className="rounded-lg border border-chart-5/20 bg-chart-5/5 p-4">
																<h4 className="font-semibold text-sm mb-4 flex items-center gap-2 text-chart-5">
																	<div className="p-1 rounded bg-chart-5/10">
																		<X className="h-4 w-4" aria-hidden="true" />
																	</div>
																	Faltaram ({record.absences.length})
																	<span className="text-muted-foreground font-normal ml-1">
																		- Previram mas não compareceram
																	</span>
																</h4>
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
																	{record.absences.map((person) => (
																		<PersonCard
																			key={person.id}
																			person={person}
																			variant="missing"
																		/>
																	))}
																</div>
															</div>
														)}

														{/* Attended */}
														{record.attended.length > 0 && (
															<div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-4">
																<h4 className="font-semibold text-sm mb-4 flex items-center gap-2 text-chart-2">
																	<div className="p-1 rounded bg-chart-2/10">
																		<Check
																			className="h-4 w-4"
																			aria-hidden="true"
																		/>
																	</div>
																	Compareceram ({record.attended.length})
																	<span className="text-muted-foreground font-normal ml-1">
																		- Confirmados
																	</span>
																</h4>
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
																	{record.attended.map((person) => (
																		<PersonCard
																			key={person.id}
																			person={person}
																			variant="present"
																		/>
																	))}
																</div>
															</div>
														)}

														{/* Extras */}
														{hasExtras && (
															<div className="rounded-lg border border-chart-1/20 bg-chart-1/5 p-4">
																<h4 className="font-semibold text-sm mb-4 flex items-center gap-2 text-chart-1">
																	<div className="p-1 rounded bg-chart-1/10">
																		<AlertTriangle
																			className="h-4 w-4"
																			aria-hidden="true"
																		/>
																	</div>
																	Extras ({record.extras.length})
																	<span className="text-muted-foreground font-normal ml-1">
																		- Não previram mas compareceram
																	</span>
																</h4>
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
																	{record.extras.map((person) => (
																		<PersonCard
																			key={person.id}
																			person={person}
																			variant="extra"
																		/>
																	))}
																</div>
															</div>
														)}

														{/* Summary */}
														{!hasAbsences && !hasExtras && (
															<div className="text-center py-8">
																<div className="inline-flex items-center justify-center p-3 rounded-full bg-chart-2/10 mb-3">
																	<Check className="h-6 w-6 text-chart-2" />
																</div>
																<h4 className="font-semibold text-lg text-chart-2">
																	Balanço Perfeito
																</h4>
																<p className="text-muted-foreground">
																	Todos que previram compareceram e não houveram
																	extras.
																</p>
															</div>
														)}
													</div>
												</TableCell>
											</TableRow>
										)}
									</>
								);
							})}
						</TableBody>
					</Table>
				</div>

				<div className="mt-4 text-sm text-muted-foreground flex justify-between items-center">
					<span>Mostrando {aggregatedData.length} avaliações agregadas</span>
				</div>
			</CardContent>
		</Card>
	);
}
