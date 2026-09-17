import { useRouter } from "@tanstack/react-router"
import { Check, ListChecks, PackageCheck, Undo2 } from "lucide-react"
import { useState } from "react"
import { ScanInput } from "@/components/features/storage/scan/ScanInput"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import {
	associateGtinToLineFn,
	bulkConfirmReceiptFn,
	confirmLineManuallyFn,
	recordScanEventFn,
	refuseReceiptLineFn,
	reverseScanEventFn,
} from "@/server/receiving.fn"

/**
 * Conferência do recebimento.
 *
 * A versão anterior só destacava a linha quando o código era lido: nada ficava
 * registrado, e o "termo circunstanciado" do art. 140 não circunstanciava
 * nada. Aqui cada leitura é um evento com autor, método e fator — e a
 * quantidade conferida da linha é a soma deles.
 *
 * Três atalhos existem porque a alternativa é o conferente desistir e digitar
 * tudo depois que o caminhão vai embora:
 *  • ler UMA embalagem e informar ×N (30 caixas iguais não se leem uma a uma);
 *  • "aceitar conforme faturado" para as linhas sem exceção;
 *  • confirmar à mão a linha sem código (hortifrúti, granel, "SEM GTIN").
 */

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })

const REFUSAL_REASONS = [
	{ value: "damaged", label: "Avaria" },
	{ value: "short_shelf_life", label: "Validade insuficiente" },
	{ value: "out_of_spec", label: "Fora da especificação" },
	{ value: "temperature", label: "Temperatura fora da faixa" },
	{ value: "not_ordered", label: "Não solicitado" },
	{ value: "other", label: "Outro" },
] as const

export interface ConferenceLine {
	id: string
	description: string
	measure_unit: string | null
	invoiced_qty_base: number | null
	received_qty_base: number
	divergence_reason: string | null
}

export interface ScanEventRow {
	id: string
	seq: number
	receipt_item_id: string | null
	method: string
	raw_code: string | null
	gtin: string | null
	quantity_base: number
	reversed_event_id: string | null
	created_at: string
}

const METHOD_LABEL: Record<string, string> = {
	scanner: "leitura",
	camera: "câmera",
	manual_confirm: "confirmação manual",
	typed: "digitado",
	bulk_confirm: "aceito conforme faturado",
	reversal: "estorno",
}

/** Identificador da leitura, gerado no clique: o retry não conta duas vezes. */
function newClientEventId(): string {
	return crypto.randomUUID()
}

interface ScanConferenceProps {
	receiptId: string
	lines: ConferenceLine[]
	events: ScanEventRow[]
	editable: boolean
	scannerConfig: { prefix?: string; suffix?: string; gsSubstitute?: string }
}

export function ScanConference({ receiptId, lines, events, editable, scannerConfig }: ScanConferenceProps) {
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [multiplier, setMultiplier] = useState("1")
	const [unknownGtin, setUnknownGtin] = useState<string | null>(null)
	const [associateTo, setAssociateTo] = useState<string>("")
	const [refusing, setRefusing] = useState<ConferenceLine | null>(null)
	const [refusalReason, setRefusalReason] = useState<(typeof REFUSAL_REASONS)[number]["value"]>("damaged")
	const [refusalNote, setRefusalNote] = useState("")
	const [replacementPromised, setReplacementPromised] = useState(false)

	const reversed = new Set(events.filter((event) => event.method === "reversal").map((event) => event.reversed_event_id))
	const pendingLines = lines.filter((line) => !events.some((event) => event.receipt_item_id === line.id))

	async function run<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
		setBusy(true)
		try {
			const result = await action()
			if (success) toast.success(success)
			await router.invalidate()
			return result
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na conferência")
			return undefined
		} finally {
			setBusy(false)
		}
	}

	async function handleScan(raw: string, gtin: string, lotCode?: string, expiryDate?: string) {
		const times = Math.max(1, Number(multiplier) || 1)
		const result = await run(() =>
			recordScanEventFn({
				data: {
					receiptId,
					clientEventId: newClientEventId(),
					rawCode: raw,
					gtin,
					lotCode,
					expiryDate,
					multiplier: times,
				},
			})
		)
		if (!result) return
		if (!result.matched) {
			// o sistema não adiciona item que a nota não tem: quem decide é o operador
			setUnknownGtin(gtin)
			return
		}
		if (result.duplicate) {
			toast.info("Esta leitura já tinha sido registrada")
			return
		}
		toast.success(`+${NUM.format(result.quantityBase)} conferido${times > 1 ? ` (${times} embalagens)` : ""}`)
		setMultiplier("1")
	}

	return (
		<>
			{editable && (
				<Card className="print:hidden">
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-subheading">
							<PackageCheck className="size-4" />
							Conferência
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-wrap items-end gap-2">
							<div className="min-w-64 flex-1">
								<ScanInput
									label="Código do volume"
									placeholder="Leia o código do volume recebido…"
									disabled={busy}
									config={scannerConfig}
									onReading={(reading) => {
										if (reading.kind === "gtin") handleScan(reading.raw, reading.gtin)
										else if (reading.kind === "gs1" && reading.fields.gtin) {
											// etiqueta GS1 traz lote e validade na mesma leitura — é o que
											// alimenta o FEFO sem ninguém digitar lote
											handleScan(reading.raw, reading.fields.gtin, reading.fields.lotCode ?? undefined, reading.fields.expiryDate ?? undefined)
										} else toast.error("Leitura sem GTIN — use 'Confirmar à mão' na linha correspondente")
									}}
								/>
							</div>
							<div className="w-28 space-y-1">
								<Label htmlFor="multiplier">Embalagens</Label>
								<Input id="multiplier" inputMode="numeric" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} />
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Leia uma embalagem e informe quantas iguais chegaram — ler 30 caixas uma a uma é o que faz a conferência parar no meio.
						</p>

						{pendingLines.length > 0 && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() =>
									run(
										() => bulkConfirmReceiptFn({ data: { receiptId, clientEventId: newClientEventId() } }),
										`${pendingLines.length} linha(s) aceitas conforme faturado`
									)
								}
							>
								<ListChecks className="mr-2 size-4" />
								Aceitar conforme faturado ({pendingLines.length} restantes)
							</Button>
						)}
					</CardContent>
				</Card>
			)}

			<Card className="print:border-0 print:shadow-none">
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Linhas conferidas</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{lines.map((line) => {
						const remaining = line.invoiced_qty_base == null ? null : Number((line.invoiced_qty_base - line.received_qty_base).toFixed(4))
						const done = remaining != null && Math.abs(remaining) < 0.0001
						const over = remaining != null && remaining < 0
						const lineEvents = events.filter((event) => event.receipt_item_id === line.id && event.method !== "reversal" && !reversed.has(event.id))
						return (
							<div key={line.id} className="rounded-xl border p-3 text-sm">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<strong>{line.description}</strong>
										<span className="ml-2 text-xs text-muted-foreground">
											conferido {NUM.format(line.received_qty_base)}
											{line.invoiced_qty_base != null && ` de ${NUM.format(line.invoiced_qty_base)}`} {line.measure_unit ?? ""}
										</span>
									</div>
									<div className="flex items-center gap-2">
										{done && (
											<Badge variant="secondary" className="text-xs">
												<Check className="mr-1 size-3" />
												completo
											</Badge>
										)}
										{over && (
											<Badge variant="outline" className="text-xs text-warning">
												a maior: {NUM.format(Math.abs(remaining))}
											</Badge>
										)}
										{remaining != null && remaining > 0 && (
											<Badge variant="outline" className="text-xs">
												falta {NUM.format(remaining)}
											</Badge>
										)}
										{editable && (
											<>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													disabled={busy}
													onClick={() => {
														const value = window.prompt(
															`Quantidade conferida de ${line.description} (${line.measure_unit ?? ""})`,
															String(line.invoiced_qty_base ?? "")
														)
														if (value == null) return
														const quantity = Number(value.replace(",", "."))
														if (!Number.isFinite(quantity) || quantity < 0) {
															toast.error("Quantidade inválida")
															return
														}
														run(
															() => confirmLineManuallyFn({ data: { receiptItemId: line.id, clientEventId: newClientEventId(), quantityBase: quantity } }),
															"Linha confirmada à mão"
														)
													}}
												>
													Confirmar à mão
												</Button>
												<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRefusing(line)}>
													Recusar
												</Button>
											</>
										)}
									</div>
								</div>
								{line.divergence_reason && <p className="mt-1 text-xs text-warning">{line.divergence_reason}</p>}
								{lineEvents.length > 0 && (
									<ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
										{lineEvents.map((event) => (
											<li key={event.id} className="flex items-center gap-2">
												<span>
													{METHOD_LABEL[event.method] ?? event.method} · {NUM.format(event.quantity_base)}
													{event.gtin ? ` · ${event.gtin}` : ""}
												</span>
												{editable && (
													<Button
														type="button"
														size="sm"
														variant="ghost"
														className="h-5 px-1"
														disabled={busy}
														onClick={() =>
															run(() => reverseScanEventFn({ data: { eventId: event.id, clientEventId: newClientEventId() } }), "Leitura desfeita")
														}
													>
														<Undo2 className="size-3" />
													</Button>
												)}
											</li>
										))}
									</ul>
								)}
							</div>
						)
					})}
				</CardContent>
			</Card>

			{/* Código que não está na nota: o sistema não decide sozinho */}
			{unknownGtin && (
				<Dialog open onOpenChange={(open) => !open && setUnknownGtin(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Código não consta nesta nota</DialogTitle>
							<DialogDescription>
								O GTIN {unknownGtin} não corresponde a nenhuma linha. Pode ser embalagem nova do mesmo produto, item trocado pelo fornecedor, ou volume de outra
								entrega.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="associate">Associar a uma linha (aprende para as próximas notas)</Label>
							<Select value={associateTo || null} onValueChange={(value) => setAssociateTo(value ?? "")}>
								<SelectTrigger id="associate">
									<SelectValue>{lines.find((line) => line.id === associateTo)?.description ?? "Escolha a linha"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{lines.map((line) => (
										<SelectItem key={line.id} value={line.id}>
											{line.description}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								O código vira um apelido do insumo, pendente de revisão global — o GTIN antigo continua valendo para as notas anteriores.
							</p>
						</div>
						<DialogFooter>
							<Button type="button" variant="ghost" onClick={() => setUnknownGtin(null)}>
								Ignorar
							</Button>
							<Button
								type="button"
								disabled={busy || !associateTo}
								onClick={async () => {
									await run(() => associateGtinToLineFn({ data: { receiptItemId: associateTo, gtin: unknownGtin } }), "Código associado")
									setUnknownGtin(null)
									setAssociateTo("")
								}}
							>
								Associar
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{refusing && (
				<Dialog open onOpenChange={(open) => !open && setRefusing(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Recusar {refusing.description}</DialogTitle>
							<DialogDescription>A linha entra com quantidade zero e o motivo fica no termo.</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<div className="space-y-1">
								<Label htmlFor="refusal">Motivo</Label>
								<Select value={refusalReason} onValueChange={(value) => setRefusalReason((value ?? "damaged") as typeof refusalReason)}>
									<SelectTrigger id="refusal">
										<SelectValue>{REFUSAL_REASONS.find((reason) => reason.value === refusalReason)?.label}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{REFUSAL_REASONS.map((reason) => (
											<SelectItem key={reason.value} value={reason.value}>
												{reason.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1">
								<Label htmlFor="refusal-note">Observação</Label>
								<Input id="refusal-note" value={refusalNote} maxLength={300} onChange={(event) => setRefusalNote(event.target.value)} />
							</div>
							<label className="flex items-center gap-2 text-sm">
								<input type="checkbox" checked={replacementPromised} onChange={(event) => setReplacementPromised(event.target.checked)} />
								Fornecedor prometeu repor
							</label>
						</div>
						<DialogFooter>
							<Button type="button" variant="ghost" onClick={() => setRefusing(null)}>
								Cancelar
							</Button>
							<Button
								type="button"
								disabled={busy}
								onClick={async () => {
									await run(
										() =>
											refuseReceiptLineFn({
												data: { receiptItemId: refusing.id, reason: refusalReason, note: refusalNote.trim() || undefined, replacementPromised },
											}),
										"Linha recusada"
									)
									setRefusing(null)
									setRefusalNote("")
									setReplacementPromised(false)
								}}
							>
								Recusar linha
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}
