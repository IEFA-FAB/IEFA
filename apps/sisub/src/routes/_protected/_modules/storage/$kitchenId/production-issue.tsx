import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CheckCircle2, ChevronDown, ChevronRight, FlameKindling, Snowflake } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { confirmIssueFn, fetchPendingIssuesFn, fetchVarianceFn, listFrozenPreparationsLiteFn, registerLeftoverFn } from "@/server/production-issue.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/production-issue")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const today = new Date()
		const from = `${today.toISOString().substring(0, 7)}-01`
		const to = today.toISOString().substring(0, 10)
		const [pending, variance, frozenPreparations] = await Promise.all([
			fetchPendingIssuesFn({ data: { kitchenId } }),
			fetchVarianceFn({ data: { kitchenId, from, to } }),
			listFrozenPreparationsLiteFn(),
		])
		return { pending, variance, frozenPreparations }
	},
	component: ProductionIssuePage,
	head: () => ({
		meta: [{ title: "Estoque — Baixa por Produção" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

interface PendingLine {
	ingredientId: string
	description: string
	measureUnit: string | null
	quantity: number
	available: number
	sufficient: boolean
}

interface PendingTask {
	taskId: string
	productionDate: string
	recipeName: string
	lines: PendingLine[]
	sufficient: number
	total: number
}

function TaskCard({
	task,
	frozenPreparations,
	onDone,
}: {
	task: PendingTask
	frozenPreparations: { id: string; description: string | null }[]
	onDone: () => void
}) {
	const [expanded, setExpanded] = useState(false)
	const [busy, setBusy] = useState(false)
	const [quantities, setQuantities] = useState<Record<string, string>>({})
	const [leftoverQty, setLeftoverQty] = useState("")
	const [leftoverPrep, setLeftoverPrep] = useState("")
	const [discard, setDiscard] = useState(false)
	const [discardReason, setDiscardReason] = useState("")

	async function confirm() {
		setBusy(true)
		try {
			const items = task.lines.map((line) => ({
				ingredientId: line.ingredientId,
				quantity: Number(quantities[line.ingredientId] ?? line.quantity),
			}))
			const result = await confirmIssueFn({ data: { taskId: task.taskId, items: items.filter((item) => item.quantity > 0) } })
			toast.success(`Baixa registrada: ${result.movements} movimento(s) FEFO`)
			onDone()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha na baixa")
		} finally {
			setBusy(false)
		}
	}

	async function saveLeftover() {
		if (!leftoverPrep || !leftoverQty) return
		setBusy(true)
		try {
			await registerLeftoverFn({
				data: {
					taskId: task.taskId,
					frozenPreparationId: leftoverPrep,
					quantity: Number(leftoverQty),
					discard,
					discardReason: discard ? discardReason : undefined,
				},
			})
			toast.success(discard ? "Descarte documentado (retorno + perda)" : "Sobra registrada como preparação congelada (validade pelo shelf life)")
			onDone()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar sobra")
		} finally {
			setBusy(false)
		}
	}

	return (
		<Card>
			<CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
				<div className="flex items-center gap-2">
					{expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
					<CardTitle className="text-subheading">{task.recipeName}</CardTitle>
					<span className="text-xs text-muted-foreground">{task.productionDate}</span>
					<Badge
						variant={task.sufficient === task.total ? "secondary" : "outline"}
						className={`ml-auto text-xs ${task.sufficient < task.total ? "text-warning" : ""}`}
					>
						Ingredientes: {task.sufficient}/{task.total} disponíveis
					</Badge>
				</div>
			</CardHeader>
			{expanded && (
				<CardContent className="space-y-4">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-xs text-muted-foreground">
								<th className="py-1.5 pr-2 text-left text-label">Ingrediente</th>
								<th className="py-1.5 px-2 text-right text-label w-32">Teórico (snapshot)</th>
								<th className="py-1.5 px-2 text-right text-label w-28">Disponível</th>
								<th className="py-1.5 px-2 text-right text-label w-32">Baixar</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{task.lines.map((line) => (
								<tr key={line.ingredientId}>
									<td className="py-1.5 pr-2 text-xs">{line.description}</td>
									<td className="py-1.5 px-2 text-xs text-right tabular-nums">
										{NUM.format(line.quantity)}
										{line.measureUnit && <span className="ml-1 text-muted-foreground">{line.measureUnit}</span>}
									</td>
									<td className={`py-1.5 px-2 text-xs text-right tabular-nums ${line.sufficient ? "" : "text-warning"}`}>{NUM.format(line.available)}</td>
									<td className="py-1.5 px-2">
										<Input
											type="number"
											min="0"
											step="any"
											className="h-7 text-xs text-right"
											defaultValue={line.quantity}
											onChange={(e) => setQuantities((q) => ({ ...q, [line.ingredientId]: e.target.value }))}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<div className="flex justify-end">
						<Button size="sm" className="gap-1.5" disabled={busy} onClick={confirm}>
							{busy ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" />}
							Confirmar baixa (FEFO)
						</Button>
					</div>

					<div className="rounded-md bg-muted/40 p-3 space-y-2">
						<p className="text-label text-muted-foreground flex items-center gap-1.5">
							<Snowflake className="size-3.5" />
							Sobra do serviço
						</p>
						<div className="grid gap-2 sm:grid-cols-4 items-end">
							<div className="sm:col-span-2 max-h-24 overflow-y-auto rounded border p-1 space-y-0.5 bg-background">
								{frozenPreparations.map((prep) => (
									<button
										key={prep.id}
										type="button"
										onClick={() => setLeftoverPrep(prep.id)}
										className={`w-full text-left text-xs px-2 py-0.5 rounded ${leftoverPrep === prep.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
									>
										{prep.description}
									</button>
								))}
							</div>
							<Input
								type="number"
								min="0"
								step="any"
								className="h-8 text-xs"
								placeholder="quantidade"
								value={leftoverQty}
								onChange={(e) => setLeftoverQty(e.target.value)}
							/>
							<Button size="sm" variant="outline" disabled={busy || !leftoverPrep || !leftoverQty} onClick={saveLeftover}>
								Registrar
							</Button>
						</div>
						<label className="flex items-center gap-2 text-xs">
							<input type="checkbox" checked={discard} onChange={(e) => setDiscard(e.target.checked)} />
							Descartar (perda documentada)
						</label>
						{discard && (
							<Input
								className="h-8 text-xs"
								placeholder="motivo do descarte (obrigatório)"
								value={discardReason}
								onChange={(e) => setDiscardReason(e.target.value)}
							/>
						)}
					</div>
				</CardContent>
			)}
		</Card>
	)
}

function ProductionIssuePage() {
	const { pending, variance, frozenPreparations } = Route.useLoaderData()
	const router = useRouter()

	return (
		<div className="space-y-6">
			<PageHeader
				title="Baixa por Produção"
				description="Consumo teórico calculado do snapshot congelado do cardápio (auditável — edições posteriores da receita não mudam a baixa). Alocação FEFO por lote."
			/>

			{pending.length === 0 ? (
				<Card>
					<CardContent className="py-10 text-center text-muted-foreground">
						<FlameKindling className="size-8 mx-auto mb-2 opacity-50" />
						<p className="text-sm">Nenhuma produção concluída aguardando baixa nos últimos 30 dias.</p>
					</CardContent>
				</Card>
			) : (
				pending.map((task) => <TaskCard key={task.taskId} task={task} frozenPreparations={frozenPreparations} onDone={() => router.invalidate()} />)
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Variância teórico × real (mês corrente)</CardTitle>
				</CardHeader>
				<CardContent>
					{variance.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Sem dados no período.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-xs text-muted-foreground">
									<th className="py-1.5 pr-2 text-left text-label">Ingrediente</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Teórico</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Real</th>
									<th className="py-1.5 px-2 text-right text-label w-28">Δ</th>
									<th className="py-1.5 px-2 text-right text-label w-20">Δ%</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/50">
								{variance.map((row) => (
									<tr key={row.ingredientId}>
										<td className="py-1.5 pr-2 text-xs">{row.description}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(row.theoretical)}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{NUM.format(row.real)}</td>
										<td className={`py-1.5 px-2 text-xs text-right tabular-nums ${Math.abs(row.delta) > 0 ? "text-warning" : ""}`}>{NUM.format(row.delta)}</td>
										<td className="py-1.5 px-2 text-xs text-right tabular-nums">{row.deltaPct != null ? `${row.deltaPct}%` : "—"}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
