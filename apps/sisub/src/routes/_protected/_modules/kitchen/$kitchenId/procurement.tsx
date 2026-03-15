import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Download } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ProcurementTable } from "@/components/features/local/ProcurementTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useProcurement } from "@/hooks/data/useProcurement"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/procurement")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: ProcurementPage,
	head: () => ({
		meta: [
			{ title: "Lista de Compras" },
			{ name: "description", content: "Calcule necessidades de aquisição" },
		],
	}),
})

function ProcurementPage() {
	// Default: próxima semana
	const getDefaultDateRange = () => {
		const today = new Date()
		const nextWeek = new Date(today)
		nextWeek.setDate(today.getDate() + 7)

		return {
			start: today.toISOString().split("T")[0],
			end: nextWeek.toISOString().split("T")[0],
		}
	}

	const [dateRange, setDateRange] = useState(() => getDefaultDateRange())

	const { needs, isLoading } = useProcurement({
		startDate: dateRange.start,
		endDate: dateRange.end,
	})

	const handleExportCSV = () => {
		const headers = ["Categoria", "Produto", "Quantidade", "Unidade"]
		const rows = needs.map((item) => [
			item.folder_description || "Sem categoria",
			item.product_name,
			item.total_quantity.toFixed(2),
			item.measure_unit || "UN",
		])

		const csv = [
			headers.join(","),
			...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
		].join("\n")

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const link = document.createElement("a")
		link.href = URL.createObjectURL(blob)
		link.download = `lista-compras-${dateRange.start}-${dateRange.end}.csv`
		link.click()
	}

	return (
		<div className="">
			<section className="container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14">
				<div className="mb-8">
					<h1 className="text-4xl font-bold tracking-tight mb-2">Lista de Compras</h1>
					<p className="text-muted-foreground text-lg">
						Calcule necessidades de aquisição baseado no cardápio planejado
					</p>
				</div>

				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Calendar className="h-5 w-5" aria-hidden="true" />
							Período
						</CardTitle>
						<CardDescription>Selecione o intervalo de datas para calcular</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col sm:flex-row gap-4 items-end">
							<div className="flex-1 space-y-2">
								<label htmlFor="start-date" className="text-sm font-medium">
									Data Inicial
								</label>
								<input
									id="start-date"
									type="date"
									value={dateRange.start}
									onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
									className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>
							<div className="flex-1 space-y-2">
								<label htmlFor="end-date" className="text-sm font-medium">
									Data Final
								</label>
								<input
									id="end-date"
									type="date"
									value={dateRange.end}
									onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
									className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>
							<Button
								onClick={handleExportCSV}
								variant="outline"
								disabled={needs.length === 0}
								className="gap-2"
								aria-label="Exportar lista em CSV"
							>
								<Download className="h-4 w-4" aria-hidden="true" />
								Exportar CSV
							</Button>
						</div>
					</CardContent>
				</Card>

				<ProcurementTable data={needs} isLoading={isLoading} />
			</section>
		</div>
	)
}
