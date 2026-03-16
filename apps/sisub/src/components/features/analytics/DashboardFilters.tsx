import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { MessHallAPI } from "@/types/domain/dashboard"

interface DashboardFiltersProps {
	dateRange: { start: string; end: string }
	onDateRangeChange: (range: { start: string; end: string }) => void
	messHalls: MessHallAPI[]
	selectedMessHall: string
	onMessHallChange: (id: string) => void
}

const MESS_HALL_ALL_LABEL = "Todos os Ranchos"

export default function DashboardFilters({ dateRange, onDateRangeChange, messHalls, selectedMessHall, onMessHallChange }: DashboardFiltersProps) {
	const selectedMessHallLabel =
		selectedMessHall === "all"
			? MESS_HALL_ALL_LABEL
			: messHalls.find((mh) => mh.id.toString() === selectedMessHall)?.display_name

	const setToday = () => {
		const today = new Date().toISOString().split("T")[0]
		onDateRangeChange({ start: today, end: today })
	}

	const setNext7Days = () => {
		const today = new Date()
		const nextWeek = new Date(today)
		nextWeek.setDate(today.getDate() + 6)

		onDateRangeChange({
			start: today.toISOString().split("T")[0],
			end: nextWeek.toISOString().split("T")[0],
		})
	}

	const setThisMonth = () => {
		const today = new Date()
		const start = new Date(today.getFullYear(), today.getMonth(), 1)
		const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)

		onDateRangeChange({
			start: start.toISOString().split("T")[0],
			end: end.toISOString().split("T")[0],
		})
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Calendar className="h-4 w-4" aria-hidden="true" />
					Filtros
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{/* Date Range Selector */}
					<Field>
						<FieldLabel>Período</FieldLabel>
						<div className="flex gap-2 items-center">
							<Input
								type="date"
								value={dateRange.start}
								onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
								aria-label="Data inicial"
							/>
							<span className="text-sm text-muted-foreground shrink-0">até</span>
							<Input
								type="date"
								value={dateRange.end}
								onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
								aria-label="Data final"
							/>
						</div>
					</Field>

					{/* Mess Hall Selector */}
					<Field>
						<FieldLabel htmlFor="mess-hall-select">Rancho</FieldLabel>
						<Select
							value={selectedMessHall}
							onValueChange={(val) => {
								if (val !== null) {
									onMessHallChange(val)
								}
							}}
						>
							<SelectTrigger id="mess-hall-select" className="w-full">
								<SelectValue placeholder="Selecione o rancho">{selectedMessHallLabel}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Todos os Ranchos</SelectItem>
								{messHalls.map((mh) => (
									<SelectItem key={mh.id} value={mh.id.toString()}>
										{mh.display_name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{/* Quick Actions */}
					<Field>
						<FieldLabel>Atalhos</FieldLabel>
						<div className="flex gap-2 flex-wrap">
							<Button variant="outline" size="sm" onClick={setToday} className="text-xs">
								Hoje
							</Button>
							<Button variant="outline" size="sm" onClick={setNext7Days} className="text-xs">
								Próximos 7 dias
							</Button>
							<Button variant="outline" size="sm" onClick={setThisMonth} className="text-xs">
								Este mês
							</Button>
						</div>
					</Field>
				</div>
			</CardContent>
		</Card>
	)
}
