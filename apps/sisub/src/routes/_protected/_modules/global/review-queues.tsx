import { createFileRoute } from "@tanstack/react-router"
import { Ruler, ScanBarcode } from "lucide-react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchBarcodeReviewFn, fetchMeasureUnitReviewFn } from "@/server/review-queues.fn"

const TABS = ["unidades", "barcodes"] as const

const searchSchema = z.object({
	tab: z.enum(TABS).catch("unidades").optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/review-queues")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	loader: async () => {
		const [units, barcodes] = await Promise.all([fetchMeasureUnitReviewFn(), fetchBarcodeReviewFn()])
		return { units, barcodes }
	},
	component: ReviewQueuesPage,
	head: () => ({
		meta: [{ title: "Filas de Revisão — SISUB" }],
	}),
})

const SOURCE_LABELS: Record<string, string> = {
	"kitchen.ingredient": "Insumo",
	"kitchen.ingredient_item": "Item de insumo",
	"procurement.purchase_item": "Item de compra",
	"procurement.procurement_list_item": "Item de ATA",
	"procurement.procurement_list_item (compra)": "Item de ATA (unid. compra)",
}

function ReviewQueuesPage() {
	const { units, barcodes } = Route.useLoaderData()
	const { tab = "unidades" } = Route.useSearch()
	const navigate = Route.useNavigate()

	return (
		<div className="space-y-6">
			<PageHeader
				title="Filas de Revisão"
				description="Pendências de catálogo que bloqueiam o módulo de estoque: unidades fora do padrão canônico e barcodes que não validaram como GTIN."
			/>

			<Tabs value={tab} onValueChange={(value) => navigate({ search: { tab: value as (typeof TABS)[number] } })}>
				<TabsList>
					<TabsTrigger value="unidades" className="gap-1.5">
						<Ruler className="size-3.5" />
						Unidades <Badge variant="secondary">{units.length}</Badge>
					</TabsTrigger>
					<TabsTrigger value="barcodes" className="gap-1.5">
						<ScanBarcode className="size-3.5" />
						Barcodes <Badge variant="secondary">{barcodes.length}</Badge>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="unidades">
					<Card>
						<CardContent className="pt-4">
							{units.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">Nenhuma unidade pendente — catálogo 100% canônico.</p>
							) : (
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b text-xs text-muted-foreground">
											<th className="py-2 pr-3 text-left text-label">Origem</th>
											<th className="py-2 pr-3 text-left text-label">Descrição</th>
											<th className="py-2 text-left text-label">Unidade encontrada</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border/60">
										{units.map((row) => (
											<tr key={`${row.source_table}:${row.source_id}`}>
												<td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{SOURCE_LABELS[row.source_table] ?? row.source_table}</td>
												<td className="py-2 pr-3 text-xs">{row.source_description || "—"}</td>
												<td className="py-2">
													<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.raw_value}</code>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="barcodes">
					<Card>
						<CardContent className="pt-4">
							{barcodes.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">Nenhum barcode pendente — todos migrados para GTIN.</p>
							) : (
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b text-xs text-muted-foreground">
											<th className="py-2 pr-3 text-left text-label">Item de insumo</th>
											<th className="py-2 text-left text-label">Barcode legado</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border/60">
										{barcodes.map((row) => (
											<tr key={row.ingredient_item_id}>
												<td className="py-2 pr-3 text-xs">{row.description || "—"}</td>
												<td className="py-2">
													<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.raw_barcode}</code>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	)
}
