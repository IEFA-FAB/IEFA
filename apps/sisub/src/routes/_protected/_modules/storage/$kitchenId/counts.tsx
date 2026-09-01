import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ClipboardCheck, Plus } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { confirmInventoryCountFn, createInventoryCountFn, fetchInventoryCountsFn, fetchStockBalanceFn, upsertCountItemFn } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/counts")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 3),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [counts, balance] = await Promise.all([fetchInventoryCountsFn({ data: { kitchenId } }), fetchStockBalanceFn({ data: { kitchenId } })])
		return { ...counts, balance }
	},
	component: InventoryCountsPage,
	head: () => ({
		meta: [{ title: "Estoque — Contagem Física" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

function InventoryCountsPage() {
	const { counts, draftItems, balance } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)

	const draft = counts.find((c: { status: string }) => c.status === "draft")
	const countedByLot = new Map(draftItems.map((item) => [item.lot_id, item.counted_qty]))
	const lots = balance.flatMap((item) =>
		item.lots.filter((lot) => lot.lot_id != null && lot.balance !== 0).map((lot) => ({ ...lot, description: item.description, measureUnit: item.measureUnit }))
	)

	async function createCount() {
		setBusy(true)
		try {
			await createInventoryCountFn({ data: { kitchenId: Number(kitchenId) } })
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao criar contagem")
		} finally {
			setBusy(false)
		}
	}

	async function saveItem(lotId: string, value: string) {
		if (!draft || value.trim() === "") return
		const qty = Number(value)
		if (!Number.isFinite(qty) || qty < 0) return
		try {
			await upsertCountItemFn({ data: { countId: draft.id, lotId, countedQty: qty } })
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar")
		}
	}

	async function confirm() {
		if (!draft) return
		setBusy(true)
		try {
			const result = await confirmInventoryCountFn({ data: { countId: draft.id } })
			toast.success(`Contagem confirmada — ${result.adjustments} ajuste${result.adjustments === 1 ? "" : "s"} gerado${result.adjustments === 1 ? "" : "s"}`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao confirmar")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Contagem Física"
				description="A contagem não move saldo — divergências viram ajustes justificados, vinculados à contagem, na confirmação."
			>
				{!draft && (
					<Button onClick={createCount} disabled={busy} className="gap-2">
						{busy ? <Spinner className="size-4" /> : <Plus className="size-4" />}
						Nova contagem
					</Button>
				)}
			</PageHeader>

			{draft && (
				<Card>
					<CardHeader className="pb-2 flex-row items-center justify-between">
						<CardTitle className="text-subheading">Contagem em andamento</CardTitle>
						<Button onClick={confirm} disabled={busy} className="gap-2">
							{busy ? <Spinner className="size-4" /> : <ClipboardCheck className="size-4" />}
							Confirmar contagem
						</Button>
					</CardHeader>
					<CardContent className="px-0 pb-0">
						{lots.length === 0 ? (
							<p className="text-sm text-muted-foreground py-6 text-center">Nenhum lote com saldo para contar.</p>
						) : (
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
										<th className="py-2 px-3 text-left text-label">Item</th>
										<th className="py-2 px-2 text-left text-label w-36">Lote</th>
										<th className="py-2 px-2 text-right text-label w-28">Saldo (ledger)</th>
										<th className="py-2 px-2 text-right text-label w-36">Contado</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{lots.map((lot) => (
										<tr key={lot.lot_id}>
											<td className="py-2 px-3 text-xs">{lot.description}</td>
											<td className="py-2 px-2 text-xs">
												<code className="bg-muted px-1.5 rounded">{lot.lot_code ?? "—"}</code>
											</td>
											<td className="py-2 px-2 text-xs text-right tabular-nums">
												{NUM.format(lot.balance)}
												{lot.measureUnit && <span className="ml-1 text-muted-foreground">{lot.measureUnit}</span>}
											</td>
											<td className="py-2 px-2">
												<Input
													type="number"
													min="0"
													step="any"
													className="h-7 text-xs text-right"
													defaultValue={countedByLot.get(lot.lot_id as string) ?? ""}
													onBlur={(e) => saveItem(lot.lot_id as string, e.target.value)}
												/>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Histórico</CardTitle>
				</CardHeader>
				<CardContent>
					{counts.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhuma contagem realizada.</p>
					) : (
						<div className="divide-y divide-border/50">
							{counts.map((count: { id: string; status: string; created_at: string; confirmed_at: string | null }) => (
								<div key={count.id} className="flex items-center gap-3 py-1.5 text-xs">
									<span suppressHydrationWarning>{new Date(count.created_at).toLocaleDateString("pt-BR")}</span>
									<Badge variant={count.status === "confirmed" ? "secondary" : "outline"} className="text-[10px]">
										{count.status === "confirmed" ? "Confirmada" : "Em andamento"}
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
