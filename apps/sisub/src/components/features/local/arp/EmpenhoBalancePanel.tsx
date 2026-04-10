import type { Empenho, ProcurementArp, ProcurementArpItem } from "@iefa/database/sisub"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, PlusCircle, RefreshCw, XCircle } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAnularEmpenho, useCreateEmpenho, useEmpenhos, useSyncArpBalance } from "@/hooks/data/useArp"

// ─── Formatadores ─────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const [y, m, d] = iso.substring(0, 10).split("-")
	return `${d}/${m}/${y}`
}

function saldoPct(item: ProcurementArpItem): number | null {
	if (!item.quantidade_homologada || !item.quantidade_empenhada) return null
	const pct = (Number(item.quantidade_empenhada) / Number(item.quantidade_homologada)) * 100
	return Math.min(pct, 100)
}

// ─── Linha de empenho ─────────────────────────────────────────────────────────

function EmpenhoRow({ empenho, arpItemId }: { empenho: Empenho; arpItemId: string }) {
	const { mutate: anular, isPending } = useAnularEmpenho(arpItemId)
	const [confirming, setConfirming] = useState(false)

	if (empenho.status === "anulado") {
		return (
			<div className="flex items-center gap-3 py-1.5 text-xs text-muted-foreground line-through opacity-60">
				<XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
				<span className="font-mono">{empenho.numero_empenho}</span>
				<span>{fmtDate(empenho.data_empenho)}</span>
				<span>
					{NUM.format(empenho.quantidade_empenhada)} × {BRL.format(empenho.valor_unitario)}
				</span>
				<span className="font-medium">{BRL.format(empenho.valor_total)}</span>
				<Badge variant="outline" className="ml-auto text-xs">
					Anulado
				</Badge>
			</div>
		)
	}

	return (
		<div className="flex items-center gap-3 py-1.5 text-xs">
			<CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
			<span className="font-mono font-medium">{empenho.numero_empenho}</span>
			<span className="text-muted-foreground">{fmtDate(empenho.data_empenho)}</span>
			<span>
				{NUM.format(empenho.quantidade_empenhada)} × {BRL.format(empenho.valor_unitario)}
			</span>
			<span className="font-medium">{BRL.format(empenho.valor_total)}</span>
			{empenho.nota_lancamento && (
				<Tooltip>
					<TooltipTrigger className="text-muted-foreground underline decoration-dotted cursor-help truncate max-w-[140px] text-xs text-left">
						{empenho.nota_lancamento}
					</TooltipTrigger>
					<TooltipContent>{empenho.nota_lancamento}</TooltipContent>
				</Tooltip>
			)}
			<div className="ml-auto flex items-center gap-2">
				{confirming ? (
					<>
						<span className="text-destructive">Anular?</span>
						<Button
							size="sm"
							variant="destructive"
							className="h-6 text-xs px-2"
							disabled={isPending}
							onClick={() => anular(empenho.id, { onSettled: () => setConfirming(false) })}
						>
							{isPending ? <Spinner className="h-3 w-3" /> : "Confirmar"}
						</Button>
						<Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setConfirming(false)}>
							Cancelar
						</Button>
					</>
				) : (
					<Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
						Anular
					</Button>
				)}
			</div>
		</div>
	)
}

// ─── Formulário de novo empenho ───────────────────────────────────────────────

interface EmpenhoFormProps {
	unitId: number
	arpItemId: string
	onSuccess: () => void
}

function EmpenhoForm({ unitId, arpItemId, onSuccess }: EmpenhoFormProps) {
	const [numero, setNumero] = useState("")
	const [data, setData] = useState(new Date().toISOString().substring(0, 10))
	const [qtd, setQtd] = useState("")
	const [valor, setValor] = useState("")
	const [nota, setNota] = useState("")

	const { mutate: create, isPending } = useCreateEmpenho(arpItemId)

	const valorTotal = Number(qtd) > 0 && Number(valor) > 0 ? Number(qtd) * Number(valor) : null

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!numero.trim() || !data || !qtd || !valor) return
		create(
			{
				unitId,
				arpItemId,
				numeroEmpenho: numero,
				dataEmpenho: data,
				quantidadeEmpenhada: Number(qtd),
				valorUnitario: Number(valor),
				notaLancamento: nota || undefined,
			},
			{
				onSuccess: () => {
					onSuccess()
					setNumero("")
					setQtd("")
					setValor("")
					setNota("")
				},
			}
		)
	}

	return (
		<form onSubmit={handleSubmit} className="bg-muted/40 rounded-lg p-3 space-y-3 mt-2">
			<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registrar empenho</p>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div className="space-y-1">
					<Label className="text-xs">Nº Empenho *</Label>
					<Input className="h-8 text-xs" placeholder="2026NE000123" value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} required />
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Data *</Label>
					<Input className="h-8 text-xs" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Quantidade *</Label>
					<Input
						className="h-8 text-xs"
						type="number"
						min="0.0001"
						step="any"
						placeholder="0,000"
						value={qtd}
						onChange={(e) => setQtd(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Valor unit. (R$) *</Label>
					<Input
						className="h-8 text-xs"
						type="number"
						min="0.01"
						step="any"
						placeholder="0,0000"
						value={valor}
						onChange={(e) => setValor(e.target.value)}
						required
					/>
				</div>
			</div>
			<div className="space-y-1">
				<Label className="text-xs">Nota de lançamento</Label>
				<Textarea
					className="text-xs resize-none"
					rows={2}
					placeholder="Observações sobre este empenho..."
					value={nota}
					onChange={(e) => setNota(e.target.value)}
				/>
			</div>
			<div className="flex items-center justify-between">
				{valorTotal != null ? (
					<p className="text-xs text-muted-foreground">
						Total: <strong className="text-foreground">{BRL.format(valorTotal)}</strong>
					</p>
				) : (
					<span />
				)}
				<Button type="submit" size="sm" disabled={isPending || !numero.trim() || !qtd || !valor} className="gap-1.5">
					{isPending && <Spinner className="h-3.5 w-3.5" />}
					Registrar
				</Button>
			</div>
		</form>
	)
}

// ─── Linha expandível de item da ARP ─────────────────────────────────────────

interface ArpItemRowProps {
	item: ProcurementArpItem
	unitId: number
}

function ArpItemRow({ item, unitId }: ArpItemRowProps) {
	const [expanded, setExpanded] = useState(false)
	const [showForm, setShowForm] = useState(false)

	const { data: empenhos = [], isLoading } = useEmpenhos(expanded ? item.id : null)

	const qtdHom = Number(item.quantidade_homologada ?? 0)
	const qtdEmp = Number(item.quantidade_empenhada ?? 0)
	const saldo = item.saldo_empenho != null ? Number(item.saldo_empenho) : qtdHom - qtdEmp
	const pct = saldoPct(item)
	const saldoBaixo = pct != null && pct >= 90

	return (
		<>
			<tr className="group cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setExpanded((v) => !v)}>
				<td className="py-2.5 px-3 w-6">
					{expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
				</td>
				<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{item.numero_item ?? "—"}</td>
				<td className="py-2.5 px-2 text-xs font-mono">{item.catmat_item_codigo ?? "—"}</td>
				<td className="py-2.5 px-2 text-xs max-w-[240px]">
					<span className="line-clamp-1">{item.descricao_item ?? "—"}</span>
					{item.nome_fornecedor && <span className="block text-muted-foreground text-[10px] truncate">{item.nome_fornecedor}</span>}
				</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">
					{qtdHom > 0 ? NUM.format(qtdHom) : "—"}
					{item.medida_catmat && <span className="ml-1 text-muted-foreground">{item.medida_catmat}</span>}
				</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{qtdEmp > 0 ? NUM.format(qtdEmp) : "0"}</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">
					<div className="flex items-center justify-end gap-1.5">
						{saldoBaixo && (
							<Tooltip>
								<TooltipTrigger>
									<AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
								</TooltipTrigger>
								<TooltipContent>Mais de 90% do saldo empenhado</TooltipContent>
							</Tooltip>
						)}
						<span className={saldoBaixo ? "text-amber-600 font-semibold" : ""}>{NUM.format(saldo)}</span>
					</div>
				</td>
				<td className="py-2.5 px-2 text-xs text-right tabular-nums">{item.valor_unitario != null ? BRL.format(item.valor_unitario) : "—"}</td>
				<td className="py-2.5 px-2 text-xs">
					{item.ata_item_id ? (
						<Badge variant="secondary" className="text-[10px] h-4">
							Vinculado
						</Badge>
					) : (
						<Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">
							Sem vínculo
						</Badge>
					)}
				</td>
			</tr>

			{/* Painel expandido: lista de empenhos + formulário */}
			{expanded && (
				<tr>
					<td colSpan={9} className="px-3 pb-3 bg-muted/20">
						<div className="ml-6 space-y-1">
							{isLoading ? (
								<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
									<Spinner className="h-3.5 w-3.5" />
									Carregando empenhos...
								</div>
							) : empenhos.length === 0 ? (
								<p className="text-xs text-muted-foreground py-2">Nenhum empenho registrado para este item.</p>
							) : (
								<div className="divide-y divide-border/50">
									{empenhos.map((emp) => (
										<EmpenhoRow key={emp.id} empenho={emp} arpItemId={item.id} />
									))}
								</div>
							)}

							{!showForm ? (
								<Button
									size="sm"
									variant="ghost"
									className="h-7 text-xs gap-1.5 mt-1"
									onClick={(e) => {
										e.stopPropagation()
										setShowForm(true)
									}}
								>
									<PlusCircle className="h-3.5 w-3.5" />
									Registrar empenho
								</Button>
							) : (
								<div>
									<EmpenhoForm unitId={unitId} arpItemId={item.id} onSuccess={() => setShowForm(false)} />
									<Button size="sm" variant="ghost" className="h-7 text-xs mt-1" onClick={() => setShowForm(false)}>
										Cancelar
									</Button>
								</div>
							)}
						</div>
					</td>
				</tr>
			)}
		</>
	)
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface EmpenhoBalancePanelProps {
	arp: ProcurementArp & { items: ProcurementArpItem[] }
	unitId: number
	ataId: string
}

export function EmpenhoBalancePanel({ arp, unitId, ataId }: EmpenhoBalancePanelProps) {
	const { mutate: syncBalance, isPending: isSyncing } = useSyncArpBalance(ataId)

	const vigenciaFim = arp.data_vigencia_fim
	const isVencida = vigenciaFim ? new Date(vigenciaFim) < new Date() : false

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="space-y-0.5">
						<CardTitle className="text-sm font-semibold flex items-center gap-2">
							ARP {arp.numero_ata}/{arp.ano_ata ?? ""}
							<Badge variant={isVencida ? "destructive" : "default"} className="text-xs">
								{isVencida ? "Vencida" : "Ativa"}
							</Badge>
						</CardTitle>
						<p className="text-xs text-muted-foreground">
							UASG {arp.uasg_gerenciadora}
							{arp.nome_uasg_gerenciadora ? ` — ${arp.nome_uasg_gerenciadora}` : ""}
						</p>
						{arp.objeto && <p className="text-xs text-foreground/80 max-w-lg line-clamp-2">{arp.objeto}</p>}
						<p className="text-xs text-muted-foreground">
							Vigência: {fmtDate(arp.data_vigencia_inicio)} → {fmtDate(arp.data_vigencia_fim)}
							{arp.last_synced_at && <span className="ml-3">Saldo sincronizado em {fmtDate(arp.last_synced_at)}</span>}
						</p>
					</div>
					<Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => syncBalance(arp.id)} disabled={isSyncing}>
						{isSyncing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
						Sincronizar saldo
					</Button>
				</div>
			</CardHeader>

			<Separator />

			<CardContent className="pt-0 px-0 pb-0">
				{arp.items.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center py-8">Nenhum item importado desta ARP.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 w-6" />
									<th className="py-2 px-2 text-left font-medium w-14">Item</th>
									<th className="py-2 px-2 text-left font-medium w-24">CATMAT</th>
									<th className="py-2 px-2 text-left font-medium">Descrição / Fornecedor</th>
									<th className="py-2 px-2 text-right font-medium w-32">Qtd Registrada</th>
									<th className="py-2 px-2 text-right font-medium w-28">Qtd Empenhada</th>
									<th className="py-2 px-2 text-right font-medium w-28">Saldo</th>
									<th className="py-2 px-2 text-right font-medium w-28">Valor Unit.</th>
									<th className="py-2 px-2 text-center font-medium w-24">ATA</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{arp.items.map((item) => (
									<ArpItemRow key={item.id} item={item} unitId={unitId} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
