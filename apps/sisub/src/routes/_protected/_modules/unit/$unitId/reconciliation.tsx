import { createFileRoute, useRouter } from "@tanstack/react-router"
import { CheckCheck, Scale, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { fetchPhysicalAccountingFn, fetchReconciliationFn, type ReconciliationRow, resolveDivergenceFn } from "@/server/reconciliation.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/reconciliation")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: async ({ params }) => {
		const unitId = Number(params.unitId)
		const [documents, physical] = await Promise.all([
			fetchReconciliationFn({ data: { unitId, includeResolved: false } }),
			fetchPhysicalAccountingFn({ data: { unitId, minDays: 0 } }),
		])
		return { documents, physical }
	},
	component: ReconciliationPage,
	head: () => ({
		meta: [{ title: "Conciliação SIAFI — SISUB" }],
	}),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const SITUACAO_META: Record<string, { label: string; className: string }> = {
	divergente: { label: "Valor divergente", className: "text-destructive" },
	apenas_siafi: { label: "Apenas no SIAFI", className: "text-warning" },
	apenas_sisub: { label: "Apenas no sisub", className: "text-warning" },
}

const TIPO_LABEL: Record<string, string> = { ne: "NE", ns: "NS", ob: "OB" }

function DivergenceRow({ row, unitId, onResolved }: { row: ReconciliationRow; unitId: string; onResolved: () => void }) {
	const [open, setOpen] = useState(false)
	const [justificativa, setJustificativa] = useState("")
	const [busy, setBusy] = useState(false)
	const meta = SITUACAO_META[row.situacao] ?? { label: row.situacao, className: "" }

	async function resolve(decisao: "adotado_siafi" | "mantido_local") {
		if (decisao === "mantido_local" && justificativa.trim().length < 3) {
			toast.error("Manter o valor local exige justificativa")
			return
		}
		setBusy(true)
		try {
			await resolveDivergenceFn({
				data: {
					unitId: Number(unitId),
					documentoTipo: row.documento_tipo as "ne" | "ns" | "ob",
					numeroDocumento: row.numero_documento,
					decisao,
					justificativa: justificativa.trim() || undefined,
					valorSisub: row.valor_sisub,
					valorSiafi: row.valor_siafi,
				},
			})
			toast.success(decisao === "adotado_siafi" ? "Valor do SIAFI adotado" : "Valor local mantido com justificativa")
			setOpen(false)
			onResolved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao resolver divergência")
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<tr className="hover:bg-muted/40">
				<td className="py-2.5 px-3 text-xs">
					<Badge variant="outline" className="text-[10px] mr-1.5">
						{TIPO_LABEL[row.documento_tipo] ?? row.documento_tipo}
					</Badge>
					<span className="font-mono">{row.numero_documento}</span>
				</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{row.valor_sisub != null ? BRL.format(row.valor_sisub) : "—"}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{row.valor_siafi != null ? BRL.format(row.valor_siafi) : "—"}</td>
				<td className={`py-2.5 px-2 text-xs text-right tabular-nums ${row.diferenca !== 0 ? "text-destructive" : ""}`}>
					{row.diferenca !== 0 ? BRL.format(row.diferenca) : "—"}
				</td>
				<td className={`py-2.5 px-2 text-xs ${meta.className}`}>{meta.label}</td>
				<td className="py-2.5 px-2 text-right">
					<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
						{open ? "Fechar" : "Resolver"}
					</Button>
				</td>
			</tr>
			{open && (
				<tr>
					<td colSpan={6} className="bg-muted/20 px-3 pb-2">
						<div className="ml-4 flex flex-wrap items-end gap-2 py-2">
							<Input
								className="h-7 text-xs flex-1 min-w-[240px]"
								placeholder="Justificativa (obrigatória para manter o valor local)"
								value={justificativa}
								onChange={(e) => setJustificativa(e.target.value)}
							/>
							<Button size="sm" className="h-7 text-xs gap-1.5" disabled={busy} onClick={() => resolve("adotado_siafi")}>
								{busy ? <Spinner className="size-3" /> : <CheckCheck className="size-3.5" />}
								Adotar SIAFI
							</Button>
							<Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => resolve("mantido_local")}>
								Manter local
							</Button>
						</div>
						{row.documento_tipo === "ne" && (
							<p className="ml-4 pb-2 text-[11px] text-muted-foreground">
								Adotar o SIAFI num empenho registra um evento de reforço/anulação — o valor original nunca é editado.
							</p>
						)}
					</td>
				</tr>
			)}
		</>
	)
}

function ReconciliationPage() {
	const { documents, physical } = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()

	return (
		<div className="space-y-6">
			<PageHeader
				title="Conciliação SIAFI"
				description="Divergências entre o registrado no sisub e o último relatório importado. O sistema aponta — a resolução é sua, e fica registrada."
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Documentos (NE, NS, OB)</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{documents.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<Scale className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma divergência pendente entre sisub e SIAFI.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label">Documento</th>
									<th className="py-2 px-2 text-right text-label w-32">sisub</th>
									<th className="py-2 px-2 text-right text-label w-32">SIAFI</th>
									<th className="py-2 px-2 text-right text-label w-32">Diferença</th>
									<th className="py-2 px-2 text-left text-label w-40">Situação</th>
									<th className="py-2 px-2 w-24" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{documents.map((row) => (
									<DivergenceRow key={`${row.documento_tipo}:${row.numero_documento}`} row={row} unitId={unitId} onResolved={() => router.invalidate()} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Físico × contábil</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{physical.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">Todo recebimento definitivo tem liquidação com valor compatível.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label w-28">Recebido em</th>
									<th className="py-2 px-2 text-right text-label w-32">Valor recebido</th>
									<th className="py-2 px-2 text-left text-label w-36">NS</th>
									<th className="py-2 px-2 text-right text-label w-32">Valor liquidado</th>
									<th className="py-2 px-2 text-left text-label w-40">Situação</th>
									<th className="py-2 px-2 text-right text-label w-24">Dias</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{physical.map(
									(row: {
										goods_receipt_id: string
										definitive_at: string
										valor_recebido: number
										numero_ns: string | null
										valor_liquidado: number | null
										situacao: string
										dias_desde_recebimento: number
									}) => (
										<tr key={row.goods_receipt_id}>
											<td className="py-2.5 px-3 text-xs" suppressHydrationWarning>
												{new Date(row.definitive_at).toLocaleDateString("pt-BR")}
											</td>
											<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(Number(row.valor_recebido))}</td>
											<td className="py-2.5 px-2 text-xs font-mono">{row.numero_ns ?? "—"}</td>
											<td className="py-2.5 px-2 text-xs text-right tabular-nums">
												{row.valor_liquidado != null ? BRL.format(Number(row.valor_liquidado)) : "—"}
											</td>
											<td className="py-2.5 px-2 text-xs">
												<span className={row.situacao === "sem_liquidacao" ? "text-warning inline-flex items-center gap-1" : "text-destructive"}>
													{row.situacao === "sem_liquidacao" ? <TriangleAlert className="size-3.5" /> : null}
													{row.situacao === "sem_liquidacao" ? "Sem liquidação" : "Valor divergente"}
												</span>
											</td>
											<td className={`py-2.5 px-2 text-xs text-right tabular-nums ${row.dias_desde_recebimento > 30 ? "text-warning" : ""}`}>
												{row.dias_desde_recebimento}d
											</td>
										</tr>
									)
								)}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
