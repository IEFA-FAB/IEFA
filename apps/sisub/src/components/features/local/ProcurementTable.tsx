import {
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
} from "@iefa/ui"
import { Package } from "lucide-react"
import type { ProcurementNeed } from "@/services/ProcurementService"

interface ProcurementTableProps {
	data: ProcurementNeed[]
	isLoading?: boolean
}

export function ProcurementTable({ data, isLoading }: ProcurementTableProps) {
	// Agrupar por categoria
	const groupedData = data.reduce(
		(acc, item) => {
			const category = item.folder_description || "Sem categoria"
			if (!acc[category]) {
				acc[category] = []
			}
			acc[category].push(item)
			return acc
		},
		{} as Record<string, ProcurementNeed[]>
	)

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" aria-hidden="true" />
						Necessidades de Compra
					</CardTitle>
					<CardDescription>Calculando quantidades necessárias...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="h-12 bg-muted animate-pulse rounded" aria-hidden="true" />
						))}
					</div>
				</CardContent>
			</Card>
		)
	}

	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Package className="h-5 w-5" aria-hidden="true" />
						Necessidades de Compra
					</CardTitle>
					<CardDescription>Nenhum cardápio planejado neste período</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<Package className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
					<p className="text-muted-foreground">Não há itens para compra no período selecionado.</p>
					<p className="text-sm text-muted-foreground mt-2">
						Planeje cardápios para ver as necessidades de aquisição.
					</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-6">
			{Object.entries(groupedData).map(([category, items]) => (
				<Card key={category}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Package className="h-5 w-5 text-primary" aria-hidden="true" />
							{category}
						</CardTitle>
						<CardDescription>
							{items.length} {items.length === 1 ? "item" : "itens"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Produto</TableHead>
										<TableHead className="text-right">Quantidade</TableHead>
										<TableHead className="text-right">Unidade</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => (
										<TableRow key={item.product_id}>
											<TableCell className="font-medium">{item.product_name}</TableCell>
											<TableCell className="text-right tabular-nums">
												{item.total_quantity.toFixed(2)}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{item.measure_unit || "UN"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	)
}
