import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Download } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { ProcurementTable } from "@/components/features/local/ProcurementTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useProcurement } from "@/hooks/data/useProcurement"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: ProcurementPage,
	head: () => ({
		meta: [{ title: "Lista de Compras" }, { name: "description", content: "Calcule necessidades de aquisição" }],
	}),
})

function ProcurementPage() {
	const { unitId } = Route.useParams()

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
		unitId: Number(unitId),
	})

	const handleExportCSV = () => {
		const headers = ["Categoria", "Produto", "Quantidade", "Unidade"]
		const rows = needs.map((item) => [item.folder_description || "Sem categoria", item.product_name, item.total_quantity.toFixed(2), item.measure_unit || "UN"])

		const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const link = document.createElement("a")
		link.href = URL.createObjectURL(blob)
		link.download = `lista-compras-${dateRange.start}-${dateRange.end}.csv`
		link.click()
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Lista de Compras" description="Calcule necessidades de aquisição baseado no cardápio planejado." />

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
						<FieldGroup className="flex-1">
							<Field>
								<FieldLabel htmlFor="start-date">Data Inicial</FieldLabel>
								<Input id="start-date" type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} />
							</Field>
						</FieldGroup>
						<FieldGroup className="flex-1">
							<Field>
								<FieldLabel htmlFor="end-date">Data Final</FieldLabel>
								<Input id="end-date" type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} />
							</Field>
						</FieldGroup>
						<Button onClick={handleExportCSV} variant="outline" disabled={needs.length === 0} className="gap-2" aria-label="Exportar lista em CSV">
							<Download className="h-4 w-4" aria-hidden="true" />
							Exportar CSV
						</Button>
					</div>
				</CardContent>
			</Card>

			<ProcurementTable data={needs} isLoading={isLoading} />
		</div>
	)
}
