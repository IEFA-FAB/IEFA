import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Receipt } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { listEmpenhosFn } from "@/server/empenho.fn"
import { createLiquidacaoFn, listLiquidacoesFn } from "@/server/liquidation.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/liquidations")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: async ({ params }) => {
		const unitId = Number(params.unitId)
		const [liquidacoes, empenhos] = await Promise.all([listLiquidacoesFn({ data: { unitId } }), listEmpenhosFn({ data: { unitId, status: "ativo" } })])
		return { liquidacoes, empenhos }
	},
	component: LiquidationsPage,
	head: () => ({
		meta: [{ title: "Liquidações — SISUB" }],
	}),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function LiquidationsPage() {
	const { liquidacoes, empenhos } = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [empenhoId, setEmpenhoId] = useState("")
	const [numeroNs, setNumeroNs] = useState("")
	const [data, setData] = useState(new Date().toISOString().substring(0, 10))
	const [valor, setValor] = useState("")

	const selected = empenhos.find((e) => e.id === empenhoId)

	async function submit(e: React.SyntheticEvent) {
		e.preventDefault()
		if (!empenhoId || !numeroNs || !valor) return
		setBusy(true)
		try {
			await createLiquidacaoFn({ data: { unitId: Number(unitId), empenhoId, numeroNs, data, valor: Number(valor) } })
			toast.success("Liquidação registrada")
			setNumeroNs("")
			setValor("")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar liquidação")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Liquidações (NS)"
				description="2ª fase da despesa (art. 63 da Lei 4.320) — atesta que o material foi recebido. A NS nasce no SIAFI; aqui ela é registrada e vinculada ao empenho e ao recebimento."
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Registrar liquidação</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={submit} className="grid gap-3 sm:grid-cols-5 items-end">
						<div className="space-y-1 sm:col-span-2">
							<Label className="text-xs">Empenho *</Label>
							<div className="max-h-32 overflow-y-auto rounded-md border p-1 space-y-0.5">
								{empenhos.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum empenho ativo.</p>}
								{empenhos.map((empenho) => (
									<button
										key={empenho.id}
										type="button"
										onClick={() => setEmpenhoId(empenho.id)}
										className={`w-full text-left text-xs px-2 py-1 rounded ${empenhoId === empenho.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
									>
										<span className="font-mono">{empenho.numero_empenho}</span>
										<span className="text-muted-foreground ml-2">a liquidar {BRL.format(empenho.saldo_a_liquidar ?? 0)}</span>
									</button>
								))}
							</div>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Nº NS *</Label>
							<Input className="h-8 text-xs" value={numeroNs} onChange={(e) => setNumeroNs(e.target.value.toUpperCase())} placeholder="2026NS000456" required />
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Data *</Label>
							<Input className="h-8 text-xs" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Valor (R$) *</Label>
							<Input className="h-8 text-xs" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
						</div>
						<div className="sm:col-span-5 flex items-center justify-between">
							{selected && <p className="text-xs text-muted-foreground">Saldo a liquidar do empenho: {BRL.format(selected.saldo_a_liquidar ?? 0)}</p>}
							<Button type="submit" size="sm" disabled={busy || !empenhoId}>
								{busy ? <Spinner className="size-3.5" /> : "Registrar NS"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Liquidações registradas</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{liquidacoes.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<Receipt className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma liquidação registrada.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label w-36">Nº NS</th>
									<th className="py-2 px-2 text-left text-label w-24">Data</th>
									<th className="py-2 px-2 text-right text-label w-32">Valor</th>
									<th className="py-2 px-2 text-right text-label w-32">Pago</th>
									<th className="py-2 px-2 text-right text-label w-32">A pagar</th>
									<th className="py-2 px-2 text-center text-label w-28">Recebimento</th>
									<th className="py-2 px-2 text-center text-label w-24">Origem</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{liquidacoes.map((row) => (
									<tr key={row.id}>
										<td className="py-2.5 px-3 text-xs font-mono">{row.numero_ns}</td>
										<td className="py-2.5 px-2 text-xs text-muted-foreground">{row.data}</td>
										<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(row.valor)}</td>
										<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">{BRL.format(row.pago)}</td>
										<td className={`py-2.5 px-2 text-xs text-right tabular-nums ${row.a_pagar > 0 ? "text-warning" : ""}`}>{BRL.format(row.a_pagar)}</td>
										<td className="py-2.5 px-2 text-center">
											{row.goods_receipt_id ? (
												<Badge variant="secondary" className="text-[10px]">
													vinculado
												</Badge>
											) : (
												<Badge variant="outline" className="text-[10px] text-muted-foreground">
													sem lastro
												</Badge>
											)}
										</td>
										<td className="py-2.5 px-2 text-center text-xs text-muted-foreground">{row.origem}</td>
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
