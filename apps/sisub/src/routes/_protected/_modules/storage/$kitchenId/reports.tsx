import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Download, FileSpreadsheet, Lock, Printer } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { closeMonthFn, exportCatmatCsvFn, fetchBalanceteFn, fetchEmpenhoLiquidacaoFn, fetchLedgerSheetFn, listClosingsFn } from "@/server/stock-reports.fn"

const searchSchema = z.object({
	competencia: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.optional(),
})

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/reports")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loaderDeps: ({ search }) => ({ competencia: search.competencia }),
	loader: async ({ params, deps }) => {
		const kitchenId = Number(params.kitchenId)
		const competencia = deps.competencia ?? new Date().toISOString().substring(0, 7)
		const [balancete, closings, empenhoPanel] = await Promise.all([
			fetchBalanceteFn({ data: { kitchenId, competencia } }),
			listClosingsFn({ data: { kitchenId } }),
			fetchEmpenhoLiquidacaoFn({ data: { kitchenId } }),
		])
		return { balancete, closings, empenhoPanel, competencia }
	},
	component: StockReportsPage,
	head: () => ({
		meta: [{ title: "Estoque — Relatórios MCASP" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function StockReportsPage() {
	const { balancete, closings, empenhoPanel, competencia } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const navigate = Route.useNavigate()
	const [busy, setBusy] = useState(false)
	const [sheet, setSheet] = useState<{ ingredientId: string; description: string; opening: number; entries: Record<string, unknown>[] } | null>(null)

	const isClosed = closings.some((c: { competencia: string }) => c.competencia.substring(0, 7) === competencia)

	async function closeMonth() {
		setBusy(true)
		try {
			const result = await closeMonthFn({ data: { kitchenId: Number(kitchenId), competencia } })
			toast.success(`Competência ${competencia} fechada (${result.items} itens no snapshot) — período bloqueado`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha no fechamento")
		} finally {
			setBusy(false)
		}
	}

	async function downloadCsv() {
		setBusy(true)
		try {
			const csv = await exportCatmatCsvFn({ data: { kitchenId: Number(kitchenId), competencia } })
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `balancete-catmat-${competencia}.csv`
			a.click()
			URL.revokeObjectURL(url)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha na exportação")
		} finally {
			setBusy(false)
		}
	}

	async function openSheet(ingredientId: string, description: string) {
		try {
			const result = await fetchLedgerSheetFn({ data: { kitchenId: Number(kitchenId), ingredientId, competencia } })
			setSheet({ ingredientId, description, ...result })
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao carregar ficha")
		}
	}

	return (
		<div className="space-y-6">
			<div className="print:hidden">
				<PageHeader
					title="Relatórios MCASP"
					description="Balancete mensal (RMA/RMB), Ficha de Almoxarifado, fechamento com lock de período e exportação por CATMAT."
				>
					<Input type="month" className="h-8 text-xs w-40" value={competencia} onChange={(e) => navigate({ search: { competencia: e.target.value } })} />
					<Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
						<Printer className="size-4" />
						Imprimir
					</Button>
					<Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={downloadCsv}>
						<Download className="size-4" />
						CSV CATMAT
					</Button>
					{isClosed ? (
						<Badge variant="secondary" className="gap-1">
							<Lock className="size-3" />
							Fechada
						</Badge>
					) : (
						<Button size="sm" className="gap-1.5" disabled={busy} onClick={closeMonth}>
							{busy ? <Spinner className="size-4" /> : <Lock className="size-4" />}
							Fechar competência
						</Button>
					)}
				</PageHeader>
			</div>

			<div className="hidden print:block">
				<h1 className="text-heading">Balancete de Almoxarifado — {competencia}</h1>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Balancete — {competencia}</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{balancete.length === 0 ? (
						<p className="text-sm text-muted-foreground py-6 text-center">Sem movimentos até o fim desta competência.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label">Item</th>
									<th className="py-2 px-2 text-right text-label w-28">Saldo inicial</th>
									<th className="py-2 px-2 text-right text-label w-28">Entradas</th>
									<th className="py-2 px-2 text-right text-label w-28">Saídas</th>
									<th className="py-2 px-2 text-right text-label w-28">Saldo final</th>
									<th className="py-2 px-2 text-right text-label w-32">Valor final</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{balancete.map((row) => (
									<tr
										key={row.key}
										className={row.ingredientId ? "cursor-pointer hover:bg-muted/40" : ""}
										onClick={() => row.ingredientId && openSheet(row.ingredientId, row.description ?? "")}
									>
										<td className="py-2 px-3 text-xs">{row.description}</td>
										<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.openQty)}</td>
										<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.inQty)}</td>
										<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.outQty)}</td>
										<td className="py-2 px-2 text-xs text-right tabular-nums">{NUM.format(row.finalQty)}</td>
										<td className="py-2 px-2 text-xs text-right tabular-nums">{BRL.format(row.finalVal)}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			{sheet && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-subheading">
							Ficha de Almoxarifado — {sheet.description} ({competencia})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-xs text-muted-foreground mb-2">Saldo anterior: {NUM.format(sheet.opening)}</p>
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-xs text-muted-foreground">
									<th className="py-1.5 pr-2 text-left text-label">Data</th>
									<th className="py-1.5 px-2 text-left text-label">Tipo</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Qtd</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Custo</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Saldo</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/50">
								{sheet.entries.map((entry) => (
									<tr key={String(entry.id)}>
										<td suppressHydrationWarning className="py-1.5 pr-2 text-xs">
											{new Date(String(entry.created_at)).toLocaleString("pt-BR")}
										</td>
										<td className="py-1.5 px-2 text-xs">{String(entry.type)}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(Number(entry.quantity))}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{entry.total_cost != null ? BRL.format(Number(entry.total_cost)) : "—"}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(Number(entry.running))}</td>
									</tr>
								))}
							</tbody>
						</table>
					</CardContent>
				</Card>
			)}

			<Card className="print:hidden">
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Empenho × Liquidação</CardTitle>
				</CardHeader>
				<CardContent>
					{empenhoPanel.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhum empenho ativo na unidade.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-xs text-muted-foreground">
									<th className="py-1.5 pr-2 text-left text-label">Empenho</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Empenhada</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Recebida</th>
									<th className="py-1.5 px-2 text-right text-label w-28">A receber</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/50">
								{empenhoPanel.map((row: { empenhoId: string; numeroEmpenho: string; empenhada: number; recebida: number; aReceber: number }) => (
									<tr key={row.empenhoId}>
										<td className="py-1.5 pr-2 text-xs font-mono">{row.numeroEmpenho}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(row.empenhada)}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(row.recebida)}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(row.aReceber)}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			<Card className="print:hidden">
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Fechamentos</CardTitle>
				</CardHeader>
				<CardContent>
					{closings.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhuma competência fechada.</p>
					) : (
						<div className="divide-y divide-border/50">
							{closings.map((closing: { id: string; competencia: string; opening_value: number; closing_value: number; closed_at: string }) => (
								<div key={closing.id} className="flex items-center gap-3 py-1.5 text-xs">
									<FileSpreadsheet className="size-3.5 text-muted-foreground" />
									<span className="font-mono">{closing.competencia.substring(0, 7)}</span>
									<span className="text-muted-foreground">
										{BRL.format(Number(closing.opening_value))} → {BRL.format(Number(closing.closing_value))}
									</span>
									<Badge variant="secondary" className="text-[10px] ml-auto gap-1">
										<Lock className="size-2.5" />
										Fechada
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
