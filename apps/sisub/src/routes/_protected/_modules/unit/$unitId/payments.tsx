import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Banknote } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { createPagamentoFn, fetchPaymentPanelFn } from "@/server/liquidation.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/payments")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: ({ params }) => fetchPaymentPanelFn({ data: { unitId: Number(params.unitId) } }),
	component: PaymentsPage,
	head: () => ({
		meta: [{ title: "Pagamentos — SISUB" }],
	}),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function PayRow({
	row,
	unitId,
	onPaid,
}: {
	row: { id: string; numero_ns: string; data: string; a_pagar: number; dias_em_aberto: number | null; fornecedor: string }
	unitId: string
	onPaid: () => void
}) {
	const [open, setOpen] = useState(false)
	const [numeroOb, setNumeroOb] = useState("")
	const [valor, setValor] = useState(String(row.a_pagar))
	const [busy, setBusy] = useState(false)
	const atrasado = (row.dias_em_aberto ?? 0) > 30

	async function pay() {
		if (!numeroOb || !valor) return
		setBusy(true)
		try {
			await createPagamentoFn({
				data: { unitId: Number(unitId), liquidacaoId: row.id, numeroOb, data: new Date().toISOString().substring(0, 10), valor: Number(valor) },
			})
			toast.success("Pagamento registrado")
			setOpen(false)
			onPaid()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar pagamento")
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<tr className="hover:bg-muted/40">
				<td className="py-2.5 px-3 text-xs font-mono">{row.numero_ns}</td>
				<td className="py-2.5 px-2 text-xs">{row.fornecedor}</td>
				<td className="py-2.5 px-2 text-xs text-muted-foreground">{row.data}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(row.a_pagar)}</td>
				<td className={`py-2.5 px-2 text-xs text-right tabular-nums ${atrasado ? "text-warning text-subheading" : ""}`}>{row.dias_em_aberto ?? 0}d</td>
				<td className="py-2.5 px-2 text-right">
					<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
						{open ? "Cancelar" : "Registrar OB"}
					</Button>
				</td>
			</tr>
			{open && (
				<tr>
					<td colSpan={6} className="bg-muted/20 px-3 pb-2">
						<div className="ml-4 flex items-end gap-2 py-2">
							<Input className="h-7 text-xs w-40" placeholder="2026OB000789" value={numeroOb} onChange={(e) => setNumeroOb(e.target.value.toUpperCase())} />
							<Input className="h-7 text-xs w-32" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
							<Button size="sm" className="h-7 text-xs" disabled={busy} onClick={pay}>
								{busy ? <Spinner className="size-3" /> : "Confirmar pagamento"}
							</Button>
						</div>
					</td>
				</tr>
			)}
		</>
	)
}

function PaymentsPage() {
	const { openLiquidations, averageDays } = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const total = openLiquidations.reduce((acc, row) => acc + row.a_pagar, 0)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Pagamentos (OB)"
				description="3ª fase da despesa. Contas a pagar ordenadas por antiguidade e prazo médio entre liquidação e pagamento por fornecedor."
			/>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Total a pagar</p>
						<p className="text-heading tabular-nums">{BRL.format(total)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Liquidações em aberto</p>
						<p className="text-heading tabular-nums">{openLiquidations.length}</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Contas a pagar</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{openLiquidations.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<Banknote className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma liquidação em aberto.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label w-36">Nº NS</th>
									<th className="py-2 px-2 text-left text-label">Fornecedor</th>
									<th className="py-2 px-2 text-left text-label w-24">Liquidada em</th>
									<th className="py-2 px-2 text-right text-label w-32">A pagar</th>
									<th className="py-2 px-2 text-right text-label w-24">Em aberto</th>
									<th className="py-2 px-2 w-32" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{openLiquidations.map((row) => (
									<PayRow key={row.id} row={row} unitId={unitId} onPaid={() => router.invalidate()} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			{averageDays.length > 0 && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-subheading">Prazo médio de pagamento</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="divide-y divide-border/50">
							{averageDays.map((row) => (
								<div key={row.fornecedor} className="flex items-center gap-3 py-1.5 text-xs">
									<span className="truncate">{row.fornecedor}</span>
									<span className="ml-auto tabular-nums shrink-0">{row.dias} dias</span>
									<span className="text-muted-foreground shrink-0">
										({row.amostras} pagamento{row.amostras > 1 ? "s" : ""})
									</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
