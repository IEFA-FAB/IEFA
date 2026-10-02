import { getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import { DEDUCTION_LABELS } from "@iefa/sisub-domain/operations"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Banknote } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { DeductionRemittanceForm } from "@/components/features/finance/DeductionsPanel"
import { RestosAPagarCard } from "@/components/features/finance/RestosAPagarCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAssuredAction } from "@/hooks/auth/useAssuredAction"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { createPagamentoFn, fetchPagamentoPanelFn, type LiquidacaoRow } from "@/server/liquidacao.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/pagamentos")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: ({ params }) => fetchPagamentoPanelFn({ data: { unitId: Number(params.unitId) } }),
	component: PagamentosPage,
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function PayRow({ row, unitId, onPaid }: { row: LiquidacaoRow & { fornecedor: string }; unitId: string; onPaid: () => void }) {
	const [open, setOpen] = useState(false)
	const [numeroOb, setNumeroOb] = useState("")
	const [valor, setValor] = useState(String(row.a_pagar))
	const [busy, setBusy] = useState(false)
	// `createPagamentoFn` é `"session"` no registro de garantia (`unit` nível 2).
	const runAssured = useAssuredAction()
	const atrasado = (row.dias_em_aberto ?? 0) > 30

	async function pay() {
		if (!numeroOb || !valor) return
		setBusy(true)
		try {
			await runAssured(() =>
				createPagamentoFn({
					data: { unitId: Number(unitId), liquidacaoId: row.id, numeroOb, data: getBrasiliaToday(), valor: Number(valor) },
				})
			)
			toast.success("Pagamento registrado")
			setOpen(false)
			onPaid()
		} catch (err) {
			// Desistir da confirmação de identidade não é falha: o formulário continua preenchido.
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao registrar pagamento")
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
				<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">
					{row.deducoes > 0 ? (
						<Tooltip>
							<TooltipTrigger className="cursor-help">{BRL.format(row.valor)}</TooltipTrigger>
							<TooltipContent>
								Bruto {BRL.format(row.valor)} − retenções {BRL.format(row.deducoes)} = líquido {BRL.format(row.liquido)}. A OB paga o líquido; a retenção é
								recolhida por DARF/DAR/GPS.
							</TooltipContent>
						</Tooltip>
					) : (
						BRL.format(row.valor)
					)}
				</td>
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
					<td colSpan={7} className="bg-muted/20 px-3 pb-2">
						<div className="ml-4 flex items-end gap-2 py-2">
							<Input className="h-7 text-xs w-40" placeholder="2026OB000789" value={numeroOb} onChange={(e) => setNumeroOb(e.target.value.toUpperCase())} />
							<Input className="h-7 text-xs w-32" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
							<Button size="sm" className="h-7 text-xs" disabled={busy} onClick={pay}>
								{busy ? <Spinner className="size-3" /> : "Confirmar pagamento"}
							</Button>
							{row.deducoes > 0 && <span className="text-xs text-muted-foreground">Líquido da NS: {BRL.format(row.liquido)}</span>}
						</div>
					</td>
				</tr>
			)}
		</>
	)
}

function PagamentosPage() {
	const { openLiquidacoes, pendingRemittances, averageDays } = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const [payingId, setPayingId] = useState<string | null>(null)
	const total = openLiquidacoes.reduce((acc, row) => acc + row.a_pagar, 0)
	const totalARecolher = pendingRemittances.reduce((acc, row) => acc + row.amount, 0)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Pagamentos (OB)"
				description="3ª fase da despesa. Contas a pagar pelo líquido (bruto − retenções), ordenadas por antiguidade, as retenções a recolher e o prazo médio entre liquidação e pagamento por fornecedor."
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">A pagar aos credores</p>
						<p className="text-heading tabular-nums">{BRL.format(total)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Retenções a recolher</p>
						<p className="text-heading tabular-nums">{BRL.format(totalARecolher)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-label text-muted-foreground">Liquidações em aberto</p>
						<p className="text-heading tabular-nums">{openLiquidacoes.length}</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Contas a pagar</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{openLiquidacoes.length === 0 ? (
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
									<th className="py-2 px-2 text-right text-label w-28">Bruto</th>
									<th className="py-2 px-2 text-right text-label w-32">A pagar (líquido)</th>
									<th className="py-2 px-2 text-right text-label w-24">Em aberto</th>
									<th className="py-2 px-2 w-32" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{openLiquidacoes.map((row) => (
									<PayRow key={row.id} row={row} unitId={unitId} onPaid={() => router.invalidate()} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			{pendingRemittances.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Retenções a recolher</CardTitle>
						<CardDescription>Retidas na NS e ainda sem o DARF/DAR/GPS registrado. Registre o documento quando ele for pago.</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup>
							{pendingRemittances.map((deduction) => (
								<Item key={deduction.id} variant="outline" size="sm" className="flex-wrap">
									<ItemContent>
										<ItemTitle>
											{DEDUCTION_LABELS[deduction.kind]} · {BRL.format(deduction.amount)}
										</ItemTitle>
										<ItemDescription>
											NS {deduction.numero_ns} · {deduction.fornecedor}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Button size="sm" variant="outline" onClick={() => setPayingId(payingId === deduction.id ? null : deduction.id)}>
											{payingId === deduction.id ? "Fechar" : "Registrar recolhimento"}
										</Button>
									</ItemActions>
									{payingId === deduction.id && (
										<div className="basis-full pt-2">
											<DeductionRemittanceForm
												unitId={Number(unitId)}
												deduction={deduction}
												onDone={() => {
													setPayingId(null)
													router.invalidate()
												}}
											/>
										</div>
									)}
								</Item>
							))}
						</ItemGroup>
					</CardContent>
				</Card>
			)}

			<RestosAPagarCard unitId={Number(unitId)} />

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
