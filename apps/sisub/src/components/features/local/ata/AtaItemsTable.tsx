import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { MoreHorizontal, Package, Pencil, TrendingUp } from "lucide-react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface AtaItemsTableProps {
	data: ProcurementNeed[]
	isLoading?: boolean
	onPesquisarPreco?: (item: ProcurementNeed) => void
	onUpdateDescription?: (ingredientId: string, ataItemId: string | null | undefined, description: string) => void
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

function formatCatmat(code: number | null): string {
	if (!code) return "—"
	return String(code)
}

export function AtaItemsTable({ data, isLoading, onPesquisarPreco, onUpdateDescription }: AtaItemsTableProps) {
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editingValue, setEditingValue] = useState("")

	const startEditing = (item: ProcurementNeed) => {
		setEditingId(item.ingredient_id)
		setEditingValue(item.item_description ?? "")
	}

	const commitEditing = (item: ProcurementNeed) => {
		onUpdateDescription?.(item.ingredient_id, item.ata_item_id, editingValue)
		setEditingId(null)
	}

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
						<Package className="size-5" aria-hidden="true" />
						Lista de Itens da Ata
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
						<Package className="size-5" aria-hidden="true" />
						Lista de Itens da Ata
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<Package className="size-12 text-muted-foreground mb-4" aria-hidden="true" />
					<p className="text-muted-foreground">Nenhum item calculado.</p>
					<p className="text-sm text-muted-foreground mt-1">Selecione templates e clique em Calcular Lista.</p>
				</CardContent>
			</Card>
		)
	}

	const hasPrices = data.some((item) => item.unit_price !== null)
	const grandTotal = data.reduce((sum, item) => {
		if (item.unit_price === null) return sum
		const qty = item.purchase_quantity ?? item.total_quantity
		return sum + qty * item.unit_price
	}, 0)

	return (
		<div className="space-y-6">
			{Object.entries(groupedData).map(([category, items]) => (
				<Card key={category}>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-base">
							<Package className="size-4 text-primary" aria-hidden="true" />
							{category}
						</CardTitle>
						<CardDescription>
							{items.length} {items.length === 1 ? "item" : "itens"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-24">CATMAT</TableHead>
										<TableHead>Item de Compra</TableHead>
										<TableHead>Insumo (Cozinha)</TableHead>
										<TableHead className="text-right">Qtd Cozinha</TableHead>
										<TableHead className="text-right">Qtd Compra</TableHead>
										<TableHead className="text-right">Preço Un.</TableHead>
										<TableHead className="text-right">Total Est.</TableHead>
										{onPesquisarPreco && <TableHead className="w-10" />}
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => {
										const qty = item.purchase_quantity ?? item.total_quantity
										const unit = item.purchase_measure_unit ?? item.measure_unit ?? "UN"
										const isEditing = onUpdateDescription && editingId === item.ingredient_id
										return (
											<TableRow key={item.ingredient_id}>
												<TableCell className="font-mono text-xs text-muted-foreground">{formatCatmat(item.catmat_item_codigo)}</TableCell>
												<TableCell className="max-w-52">
													<div className="space-y-0.5">
														<p className="text-xs truncate" title={item.purchase_item_description ?? item.catmat_item_descricao ?? undefined}>
															{item.purchase_item_description ?? item.catmat_item_descricao ?? <span className="text-muted-foreground">—</span>}
														</p>
														{onUpdateDescription && (
															<div className="min-h-4">
																{isEditing ? (
																	<input
																		// biome-ignore lint/a11y/noAutofocus: foco intencional na edição inline
																		autoFocus
																		className="text-xs w-full border-b border-primary outline-none bg-transparent text-foreground placeholder:text-muted-foreground/50"
																		value={editingValue}
																		placeholder="Descrição adicional..."
																		onChange={(e) => setEditingValue(e.target.value)}
																		onBlur={() => commitEditing(item)}
																		onKeyDown={(e) => {
																			if (e.key === "Enter") commitEditing(item)
																			if (e.key === "Escape") setEditingId(null)
																		}}
																	/>
																) : item.item_description ? (
																	<button
																		type="button"
																		onClick={() => startEditing(item)}
																		className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground text-left group"
																	>
																		<Pencil className="size-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
																		<span className="truncate">{item.item_description}</span>
																	</button>
																) : (
																	<button
																		type="button"
																		onClick={() => startEditing(item)}
																		className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
																	>
																		+ descrição
																	</button>
																)}
															</div>
														)}
													</div>
												</TableCell>
												<TableCell className="text-subheading">{item.ingredient_name}</TableCell>
												<TableCell className="text-right tabular-nums text-xs text-muted-foreground">
													{NUM.format(item.total_quantity)} {item.measure_unit ?? ""}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{item.purchase_quantity !== null ? (
														<span>
															{NUM.format(item.purchase_quantity)} <span className="text-xs text-muted-foreground">{unit}</span>
														</span>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell className="text-right tabular-nums text-sm">
													{item.unit_price !== null ? BRL.format(item.unit_price) : <span className="text-muted-foreground">—</span>}
												</TableCell>
												<TableCell className="text-right tabular-nums text-subheading">
													{item.unit_price !== null ? BRL.format(qty * item.unit_price) : <span className="text-muted-foreground">—</span>}
												</TableCell>
												{onPesquisarPreco && (
													<TableCell className="w-10 p-1">
														{item.catmat_item_codigo && (
															<DropdownMenu>
																<DropdownMenuTrigger className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
																	<MoreHorizontal className="size-4" aria-hidden="true" />
																	<span className="sr-only">Ações</span>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem onClick={() => onPesquisarPreco(item)}>
																		<TrendingUp />
																		Pesquisar preço
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														)}
													</TableCell>
												)}
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			))}

			{hasPrices && (
				<div className="flex justify-end">
					<div className="rounded-md border bg-muted/50 px-6 py-3 text-right">
						<p className="text-sm text-muted-foreground">Total Estimado da Ata</p>
						<p className="text-display tabular-nums">{BRL.format(grandTotal)}</p>
					</div>
				</div>
			)}
		</div>
	)
}
