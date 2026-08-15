import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ChevronDown, ChevronRight, FileSignature, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { type EmpenhoRow, fetchEmpenhoFn, inscribeRestosAPagarFn, listEmpenhosFn, registerEmpenhoEventFn } from "@/server/empenho.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/empenhos")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: ({ params }) => listEmpenhosFn({ data: { unitId: Number(params.unitId) } }),
	component: EmpenhosPage,
	head: () => ({
		meta: [{ title: "Empenhos — SISUB" }],
	}),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const TIPO_LABEL: Record<string, string> = {
	ordinario: "Ordinário",
	estimativo: "Estimativo",
	global: "Global",
}

const EVENT_LABEL: Record<string, string> = {
	reforco: "Reforço",
	anulacao: "Anulação",
	cancelamento: "Cancelamento",
	rp_inscricao: "Inscrição em RP",
}

interface EmpenhoEvent {
	id: string
	tipo: string
	valor: number
	data: string
	documento: string | null
	justificativa: string
}

function EmpenhoDetail({ empenhoId, onChanged }: { empenhoId: string; onChanged: () => void }) {
	const [detail, setDetail] = useState<{ events: EmpenhoEvent[] } | null>(null)
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [tipo, setTipo] = useState<"reforco" | "anulacao">("reforco")
	const [valor, setValor] = useState("")
	const [justificativa, setJustificativa] = useState("")

	// carrega o histórico ao expandir
	if (loading && detail == null) {
		fetchEmpenhoFn({ data: { empenhoId } })
			.then((result) => setDetail(result as unknown as { events: EmpenhoEvent[] }))
			.catch(() => toast.error("Falha ao carregar histórico"))
			.finally(() => setLoading(false))
	}

	async function submitEvent() {
		if (!valor || justificativa.trim().length < 5) {
			toast.error("Informe valor e justificativa (mínimo 5 caracteres)")
			return
		}
		setBusy(true)
		try {
			await registerEmpenhoEventFn({
				data: {
					empenhoId,
					tipo,
					valor: Number(valor),
					data: new Date().toISOString().substring(0, 10),
					justificativa: justificativa.trim(),
				},
			})
			toast.success(tipo === "reforco" ? "Reforço registrado" : "Anulação registrada")
			setValor("")
			setJustificativa("")
			setDetail(null)
			setLoading(true)
			onChanged()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar evento")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="ml-6 space-y-3 py-2">
			{loading ? (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner className="size-3.5" />
					Carregando histórico…
				</div>
			) : (detail?.events.length ?? 0) === 0 ? (
				<p className="text-xs text-muted-foreground">Nenhum reforço ou anulação registrado.</p>
			) : (
				<div className="divide-y divide-border/50">
					{detail?.events.map((event) => (
						<div key={event.id} className="flex items-center gap-3 py-1.5 text-xs">
							<Badge variant="outline" className="text-[10px] shrink-0">
								{EVENT_LABEL[event.tipo] ?? event.tipo}
							</Badge>
							<span className="tabular-nums">{BRL.format(Number(event.valor))}</span>
							<span className="text-muted-foreground">{event.data}</span>
							<span className="truncate text-muted-foreground">{event.justificativa}</span>
						</div>
					))}
				</div>
			)}

			<div className="rounded-md bg-muted/40 p-3 space-y-2">
				<p className="text-label text-muted-foreground">Registrar evento (o valor do empenho nunca é editado diretamente)</p>
				<div className="grid gap-2 sm:grid-cols-4 items-end">
					<div className="space-y-1">
						<Label className="text-xs">Tipo</Label>
						<div className="flex gap-1">
							<Button
								type="button"
								size="sm"
								variant={tipo === "reforco" ? "default" : "outline"}
								className="h-7 text-xs gap-1"
								onClick={() => setTipo("reforco")}
							>
								<Plus className="size-3" />
								Reforço
							</Button>
							<Button
								type="button"
								size="sm"
								variant={tipo === "anulacao" ? "default" : "outline"}
								className="h-7 text-xs gap-1"
								onClick={() => setTipo("anulacao")}
							>
								<Minus className="size-3" />
								Anulação
							</Button>
						</div>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Valor (R$)</Label>
						<Input className="h-7 text-xs" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
					</div>
					<div className="space-y-1 sm:col-span-2">
						<Label className="text-xs">Justificativa *</Label>
						<Input className="h-7 text-xs" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Motivo do reforço/anulação" />
					</div>
				</div>
				<div className="flex justify-end">
					<Button size="sm" className="h-7 text-xs" disabled={busy} onClick={submitEvent}>
						{busy ? <Spinner className="size-3" /> : "Registrar"}
					</Button>
				</div>
			</div>
		</div>
	)
}

function EmpenhoLine({ empenho, onChanged }: { empenho: EmpenhoRow; onChanged: () => void }) {
	const [expanded, setExpanded] = useState(false)

	return (
		<>
			<tr className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded((v) => !v)}>
				<td className="py-2.5 px-3 w-6">
					{expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
				</td>
				<td className="py-2.5 px-2 text-xs font-mono">{empenho.numero_empenho}</td>
				<td className="py-2.5 px-2 text-xs text-muted-foreground">{empenho.data_empenho}</td>
				<td className="py-2.5 px-2 text-xs">
					{empenho.favorecido_nome ?? "—"}
					{empenho.nd && <span className="block text-[10px] font-mono text-muted-foreground">ND {empenho.nd}</span>}
				</td>
				<td className="py-2.5 px-2 text-xs">{empenho.tipo ? (TIPO_LABEL[empenho.tipo] ?? empenho.tipo) : "—"}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(empenho.valor_vigente ?? 0)}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">{BRL.format(empenho.valor_liquidado ?? 0)}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">{BRL.format(empenho.valor_pago ?? 0)}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums text-subheading">{BRL.format(empenho.saldo_a_liquidar ?? 0)}</td>
				<td className="py-2.5 px-2 text-center">
					{empenho.rp_inscrito ? (
						<Badge variant="outline" className="text-[10px]">
							RP {empenho.rp_tipo === "processado" ? "proc." : "não-proc."}
						</Badge>
					) : (
						<Badge variant={empenho.status === "ativo" ? "secondary" : "destructive"} className="text-[10px]">
							{empenho.status}
						</Badge>
					)}
				</td>
			</tr>
			{expanded && (
				<tr>
					<td colSpan={10} className="bg-muted/20 px-3 pb-2">
						<EmpenhoDetail empenhoId={empenho.id} onChanged={onChanged} />
					</td>
				</tr>
			)}
		</>
	)
}

function EmpenhosPage() {
	const empenhos = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const [busy, setBusy] = useState(false)

	const totals = empenhos.reduce(
		(acc, e) => ({
			vigente: acc.vigente + (e.valor_vigente ?? 0),
			liquidado: acc.liquidado + (e.valor_liquidado ?? 0),
			pago: acc.pago + (e.valor_pago ?? 0),
			aLiquidar: acc.aLiquidar + (e.saldo_a_liquidar ?? 0),
		}),
		{ vigente: 0, liquidado: 0, pago: 0, aLiquidar: 0 }
	)

	async function inscribeRp() {
		setBusy(true)
		try {
			const exercicio = new Date().getFullYear()
			const result = await inscribeRestosAPagarFn({ data: { unitId: Number(unitId), exercicio } })
			toast.success(`${result.inscritos} empenho(s) inscrito(s) em restos a pagar de ${exercicio}`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao inscrever RP")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Empenhos"
				description="Documento orçamentário completo: classificação, favorecido e execução (liquidado, pago, a liquidar). Reforço e anulação entram como eventos — o valor original nunca é editado."
			>
				<Button variant="outline" size="sm" disabled={busy} onClick={inscribeRp}>
					{busy ? <Spinner className="size-4" /> : "Inscrever restos a pagar"}
				</Button>
			</PageHeader>

			<div className="grid gap-4 sm:grid-cols-4">
				{[
					{ label: "Vigente", value: totals.vigente },
					{ label: "Liquidado", value: totals.liquidado },
					{ label: "Pago", value: totals.pago },
					{ label: "A liquidar", value: totals.aLiquidar },
				].map((card) => (
					<Card key={card.label}>
						<CardContent className="pt-4">
							<p className="text-label text-muted-foreground">{card.label}</p>
							<p className="text-heading tabular-nums">{BRL.format(card.value)}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Documentos</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{empenhos.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<FileSignature className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhum empenho registrado. Lance pela tela da ATA ou importe as NE do Tesouro Gerencial.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 w-6" />
									<th className="py-2 px-2 text-left text-label w-36">Nº empenho</th>
									<th className="py-2 px-2 text-left text-label w-24">Data</th>
									<th className="py-2 px-2 text-left text-label">Favorecido / ND</th>
									<th className="py-2 px-2 text-left text-label w-24">Tipo</th>
									<th className="py-2 px-2 text-right text-label w-32">Vigente</th>
									<th className="py-2 px-2 text-right text-label w-32">Liquidado</th>
									<th className="py-2 px-2 text-right text-label w-32">Pago</th>
									<th className="py-2 px-2 text-right text-label w-32">A liquidar</th>
									<th className="py-2 px-2 text-center text-label w-28">Situação</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{empenhos.map((empenho) => (
									<EmpenhoLine key={empenho.id} empenho={empenho} onChanged={() => router.invalidate()} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
