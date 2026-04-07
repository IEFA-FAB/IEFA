import { Package } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ProcurementNeed } from "@/services/ProcurementService"

interface AtaItemsTableProps {
	data: ProcurementNeed[]
	isLoading?: boolean
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

function formatCatmat(code: number | null): string {
	if (!code) return "—"
	// Formato padrão CATMAT: grupo.classe.pdm.item (mascarado como string)
	return String(code)
}

export function AtaItemsTable({ data, isLoading }: AtaItemsTableProps) {
	const groupedData = data.reduce(
		(acc, item) => {
			const category = item.folder_description || "Sem categoria"
			if (!acc[category]) acc[category] = []
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
						Lista de Itens da ATA
					</CardTitle>
					<CardDescription>Calculando quantitativos...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="h-12 animate-pulse rounded bg-muted" aria-hidden="true" />
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
						Lista de Itens da ATA
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<Package className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
					<p className="text-muted-foreground">Nenhum item calculado.</p>
					<p className="text-sm text-muted-foreground mt-1">Selecione templates e clique em Calcular Lista.</p>
				</CardContent>
			</Card>
		)
	}

	// Total geral estimado
	const grandTotal = data.reduce((sum, item) => sum + (item.total_value || 0), 0)
	const hasPrices = data.some((item) => item.total_value !== null)

	return (
		<div className="space-y-6">
			{Object.entries(groupedData).map(([category, items]) => (
				<Card key={category}>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-base">
							<Package className="h-4 w-4 text-primary" aria-hidden="true" />
							{category}
						</CardTitle>
						<CardDescription>
							{items.length} {items.length === 1 ? "item" : "itens"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-28">CATMAT</TableHead>
										<TableHead>Descrição CATMAT</TableHead>
										<TableHead>Produto</TableHead>
										<TableHead className="text-right">Qtd</TableHead>
										<TableHead className="text-right">Unid</TableHead>
										<TableHead className="text-right">Preço Un.</TableHead>
										<TableHead className="text-right">Total Est.</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => (
										<TableRow key={item.product_id}>
											<TableCell className="font-mono text-xs text-muted-foreground">{formatCatmat(item.catmat_item_codigo)}</TableCell>
											<TableCell className="text-xs max-w-48 truncate" title={item.catmat_item_descricao || undefined}>
												{item.catmat_item_descricao || <span className="text-muted-foreground">—</span>}
											</TableCell>
											<TableCell className="font-medium">{item.product_name}</TableCell>
											<TableCell className="text-right tabular-nums">{NUM.format(item.total_quantity)}</TableCell>
											<TableCell className="text-right text-muted-foreground text-xs">{item.measure_unit || "UN"}</TableCell>
											<TableCell className="text-right tabular-nums text-sm">
												{item.unit_price !== null ? BRL.format(item.unit_price) : <span className="text-muted-foreground">—</span>}
											</TableCell>
											<TableCell className="text-right tabular-nums text-sm font-medium">
												{item.total_value !== null ? BRL.format(item.total_value) : <span className="text-muted-foreground">—</span>}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			))}

			{hasPrices && (
				<div className="flex justify-end">
					<div className="rounded-md border bg-muted/50 px-6 py-3 text-right">
						<p className="text-sm text-muted-foreground">Total Estimado da ATA</p>
						<p className="text-xl font-bold tabular-nums">{BRL.format(grandTotal)}</p>
					</div>
				</div>
			)}
		</div>
	)
}
