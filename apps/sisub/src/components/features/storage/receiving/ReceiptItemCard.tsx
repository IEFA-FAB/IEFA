/**
 * Cartão de item da conferência de recebimento: quantidade recebida, lotes, validade,
 * conservação e temperatura. Saiu da rota `storage/$kitchenId/receiving/$receiptId`.
 */

import {
	CONSERVATION_LABELS,
	type ConservationClass,
	describeConditioning,
	type LotBalanceSummary,
	lotBalance,
	type PackageType,
	type TemperatureVerdict,
	type TransportRequirement,
} from "@iefa/sisub-domain"
import { Plus, Thermometer, Trash2, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { deleteReceiptLotFn, updateReceiptItemFn, upsertReceiptLotFn } from "@/server/receiving.fn"
import {
	buildConservationItems,
	buildLotDrafts,
	evaluateLot,
	initialLotFields,
	lotRowClassName,
	NUM,
	requiredRange,
	type TemperatureRangeC,
} from "./receipt-detail"

export interface ReceiptLotRow {
	id: string
	lot_code: string
	expiry_date: string | null
	quantity_base: number
	unit_cost: number | null
	measured_temperature_c: number | null
	divergence_reason: string | null
	temperature_ack_by: string | null
	/** Classe em que o lote chegou; nula = não informada (vale a sugerida). */
	conservation_class: ConservationClass | null
	/** Nota do conferente sobre a divergência, guardada à parte para sobreviver a novas gravações. */
	divergence_note: string | null
}

export interface ConditioningRow {
	conservation_class: ConservationClass | null
	storage_temp_min_c: number | null
	storage_temp_max_c: number | null
	package_type: PackageType | null
	package_net_content: number | null
	package_net_content_unit: string | null
	transport_requirement: TransportRequirement | null
	min_shelf_life_days_on_delivery: number | null
	delivery_conditioning: string | null
}

export interface ReceiptItemRow {
	/** Classe sugerida pela especificação, na mesma resolução que o servidor usa ao gravar o lote. */
	suggested_conservation_class: ConservationClass | null
	id: string
	description: string
	measure_unit: string | null
	gtin: string | null
	invoiced_qty_base: number | null
	received_qty_base: number
	divergence_reason: string | null
	conditioning: ConditioningRow | null
	lots: ReceiptLotRow[]
}

/**
 * Resumo do que a especificação de compra exige.
 *
 * Vive aqui porque o conferente é quem aceita ou recusa a carga, e até agora
 * essa exigência morria no formulário de compras: a tela mostrava quantidade,
 * lote e validade, e nada sobre em que condição o item tinha de chegar.
 */
function ConditioningSummary({ conditioning }: { conditioning: ConditioningRow | null }) {
	if (!conditioning) return null
	const summary = describeConditioning({
		conservationClass: conditioning.conservation_class,
		storageTempMinC: conditioning.storage_temp_min_c != null ? Number(conditioning.storage_temp_min_c) : null,
		storageTempMaxC: conditioning.storage_temp_max_c != null ? Number(conditioning.storage_temp_max_c) : null,
		minShelfLifeDaysOnDelivery: conditioning.min_shelf_life_days_on_delivery,
		packageType: conditioning.package_type,
		packageNetContent: conditioning.package_net_content != null ? Number(conditioning.package_net_content) : null,
		packageNetContentUnit: conditioning.package_net_content_unit,
		transportRequirement: conditioning.transport_requirement,
	})
	if (summary === "" && !conditioning.delivery_conditioning) return null

	return (
		<div className="mt-1 space-y-0.5">
			{summary !== "" && <p className="text-caption text-muted-foreground">Exigido: {summary}</p>}
			{conditioning.delivery_conditioning && <p className="text-caption text-muted-foreground whitespace-pre-line">{conditioning.delivery_conditioning}</p>}
		</div>
	)
}

/**
 * Linha de lote em edição. Lote existente tem id; o rascunho de inclusão, não.
 *
 * A conservação vem preenchida com a SUGERIDA pela especificação e pode ser trocada: o lote
 * que chegou resfriado a vácuo em vez de congelado (freezer quebrado — EST-REC-04) entra
 * como resfriado, com a divergência registrada, sem bloquear a entrada.
 */
function LotEditor({
	lot,
	itemId,
	editable,
	range,
	suggested,
	onSaved,
	onCancel,
}: {
	lot: ReceiptLotRow | null
	itemId: string
	editable: boolean
	range: TemperatureRangeC
	suggested: ConservationClass | null
	onSaved: () => void
	onCancel?: () => void
}) {
	const initial = initialLotFields(lot, suggested)
	const [code, setCode] = useState(initial.code)
	const [expiry, setExpiry] = useState(initial.expiry)
	const [quantity, setQuantity] = useState(initial.quantity)
	const [temperature, setTemperature] = useState(initial.temperature)
	const [conservation, setConservation] = useState<ConservationClass | null>(initial.conservation)
	const [note, setNote] = useState(initial.note)
	const [busy, setBusy] = useState(false)

	const { classDivergence, measured, verdict, outOfRange } = evaluateLot(suggested, conservation, temperature, range)
	const conservationItems = buildConservationItems(suggested)

	async function save() {
		setBusy(true)
		try {
			// Fora da faixa não bloqueia: pede o aceite explícito e grava quem aceitou.
			const accept = outOfRange
				? window.confirm(`Temperatura ${measured} °C está fora da faixa exigida. Registrar o lote assim mesmo? O aceite fica registrado em seu nome.`)
				: false
			if (outOfRange && !accept) return

			await upsertReceiptLotFn({
				data: {
					lotId: lot?.id,
					receiptItemId: itemId,
					lotCode: code.trim(),
					expiryDate: expiry || null,
					quantityBase: Number(quantity),
					measuredTemperatureC: measured,
					acceptOutOfRange: accept,
					conservationClass: conservation,
					// A nota é da divergência de classe: voltou à sugerida, o campo some e a nota não vai.
					divergenceNote: classDivergence ? note.trim() || null : null,
				},
			})
			toast.success(lot ? "Lote atualizado" : "Lote adicionado")
			onCancel?.()
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao gravar lote")
		} finally {
			setBusy(false)
		}
	}

	async function remove() {
		if (!lot) return
		setBusy(true)
		try {
			await deleteReceiptLotFn({ data: { lotId: lot.id, receiptItemId: itemId } })
			toast.success("Lote removido")
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao remover lote")
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<tr className={lotRowClassName(outOfRange, classDivergence)}>
				<td className="py-1.5 px-2">
					<Input className="h-7 text-xs font-mono" placeholder="lote" value={code} disabled={!editable} onChange={(e) => setCode(e.target.value)} />
				</td>
				<td className="py-1.5 px-2 w-36">
					<Input type="date" className="h-7 text-xs" value={expiry} disabled={!editable} onChange={(e) => setExpiry(e.target.value)} />
				</td>
				<td className="py-1.5 px-2 w-28">
					<Input
						type="number"
						min="0"
						step="any"
						className="h-7 text-xs text-right"
						placeholder="qtd"
						value={quantity}
						disabled={!editable}
						onChange={(e) => setQuantity(e.target.value)}
					/>
				</td>
				<td className="py-1.5 px-2 w-36">
					<Select items={conservationItems} value={conservation} onValueChange={(value) => setConservation(value)} disabled={!editable}>
						<SelectTrigger size="sm" className="w-full" aria-label="Conservação em que o lote chegou">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{conservationItems.map((option) => (
								<SelectItem key={option.value ?? "none"} value={option.value}>
									{option.label}
									{option.value != null && option.value === suggested ? " (sugerida)" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</td>
				<td className="py-1.5 px-2 w-32">
					<Input
						type="number"
						step="0.1"
						className="h-7 text-xs text-right"
						placeholder="°C (opcional)"
						value={temperature}
						disabled={!editable}
						onChange={(e) => setTemperature(e.target.value)}
					/>
				</td>
				<LotVerdictCell verdict={verdict} outOfRange={outOfRange} classDivergence={classDivergence} temperatureAckBy={lot?.temperature_ack_by} />
				<td className="py-1.5 px-2 w-28 text-right print:hidden">
					{editable && <LotActions busy={busy} isExisting={!!lot} onSave={save} onRemove={remove} onCancel={onCancel} />}
				</td>
			</tr>
			<LotDivergenceRow
				classDivergence={classDivergence}
				divergenceReason={lot?.divergence_reason}
				conservation={conservation}
				editable={editable}
				note={note}
				onNoteChange={setNote}
			/>
		</>
	)
}

function LotVerdictCell({
	verdict,
	outOfRange,
	classDivergence,
	temperatureAckBy,
}: {
	verdict: TemperatureVerdict
	outOfRange: boolean
	classDivergence: string | null
	temperatureAckBy: string | null | undefined
}) {
	return (
		<td className="py-1.5 px-2 w-40 text-xs">
			{verdict === "dentro" && <Badge variant="secondary">na faixa</Badge>}
			{outOfRange && (
				<Badge variant="destructive">
					<Thermometer className="size-3" />
					fora da faixa
				</Badge>
			)}
			{verdict === "sem_faixa" && <span className="text-muted-foreground">{classDivergence ? "faixa sugerida não se aplica" : "sem faixa exigida"}</span>}
			{verdict === "nao_medido" && <span className="text-muted-foreground">não medido</span>}
			{temperatureAckBy && <span className="block text-[10px] text-muted-foreground">aceite registrado</span>}
		</td>
	)
}

function LotActions({
	busy,
	isExisting,
	onSave,
	onRemove,
	onCancel,
}: {
	busy: boolean
	isExisting: boolean
	onSave: () => void
	onRemove: () => void
	onCancel: (() => void) | undefined
}) {
	return (
		<div className="flex justify-end gap-1">
			<Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onSave}>
				{busy ? <Spinner className="size-3" /> : "Salvar"}
			</Button>
			{isExisting ? (
				<Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={onRemove} aria-label="Remover lote">
					<Trash2 className="size-3.5" />
				</Button>
			) : (
				<Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onCancel}>
					Cancelar
				</Button>
			)}
		</div>
	)
}

/** Divergência de classe (com o motivo opcional) ou a divergência gravada no lote. */
function LotDivergenceRow({
	classDivergence,
	divergenceReason,
	conservation,
	editable,
	note,
	onNoteChange,
}: {
	classDivergence: string | null
	divergenceReason: string | null | undefined
	conservation: ConservationClass | null
	editable: boolean
	note: string
	onNoteChange: (value: string) => void
}) {
	return (
		(classDivergence || divergenceReason) && (
			<tr className={classDivergence ? "bg-warning/5" : undefined}>
				<td colSpan={7} className="px-2 pb-2">
					<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
						<p className="flex items-start gap-1.5 text-caption text-foreground">
							<TriangleAlert className="size-3.5 shrink-0 translate-y-0.5 text-warning" />
							{classDivergence
								? `${classDivergence}. O lote entra como ${CONSERVATION_LABELS[conservation as ConservationClass].toLowerCase()}, e o recebimento fica registrado com divergência.`
								: divergenceReason}
						</p>
						{classDivergence && editable && (
							<Input
								className="h-7 sm:max-w-xs"
								placeholder="motivo (opcional) — ex.: freezer em manutenção"
								aria-label="Motivo da conservação diferente (opcional)"
								value={note}
								maxLength={280}
								onChange={(e) => onNoteChange(e.target.value)}
							/>
						)}
					</div>
				</td>
			</tr>
		)
	)
}

/**
 * Lote, validade e temperatura da linha. O destaque por leitura saiu daqui: a
 * leitura agora vira evento, e o progresso "conferido × faturado" mora na
 * conferência, onde o operador olha.
 */
export function ItemCard({ item, editable, onSaved }: { item: ReceiptItemRow; editable: boolean; onSaved: () => void }) {
	const [qty, setQty] = useState(String(item.received_qty_base))
	const [reason, setReason] = useState(item.divergence_reason ?? "")
	const [addingLot, setAddingLot] = useState(false)
	const [saving, setSaving] = useState(false)

	const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
	const diverges = invoiced != null && Number(qty) !== invoiced
	const range = requiredRange(item.conditioning)

	const drafts = buildLotDrafts(item.lots)
	const balance = lotBalance(Number(qty) || 0, drafts)

	async function save() {
		setSaving(true)
		try {
			await updateReceiptItemFn({
				// o que a tela carregou: salvar só o motivo não regrava a quantidade, e
				// quantidade mudada por leitura no meio da edição é recusada, não sobrescrita
				data: {
					receiptItemId: item.id,
					receivedQtyBase: Number(qty),
					divergenceReason: reason || null,
					baselineQtyBase: Number(item.received_qty_base),
				},
			})
			toast.success("Item conferido")
			onSaved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao salvar item")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card>
			<CardContent className="pt-4 space-y-3">
				<ItemCardHeader item={item} invoiced={invoiced} qty={qty} onQtyChange={setQty} editable={editable} saving={saving} onSave={save} />

				{diverges && (
					<Input
						className="h-7 text-xs"
						placeholder="motivo da divergência (obrigatório)"
						value={reason}
						disabled={!editable}
						onChange={(e) => setReason(e.target.value)}
					/>
				)}

				<div className="rounded-md border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
								<th className="py-1.5 px-2 text-left text-label">Lote</th>
								<th className="py-1.5 px-2 text-left text-label w-36">Validade</th>
								<th className="py-1.5 px-2 text-left text-label w-28">Quantidade</th>
								<th className="py-1.5 px-2 text-left text-label w-36">Conservação</th>
								<th className="py-1.5 px-2 text-left text-label w-32">Temperatura</th>
								<th className="py-1.5 px-2 text-left text-label w-40">Aferição</th>
								<th className="py-1.5 px-2 w-28 print:hidden" />
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{item.lots.map((lot) => (
								<LotEditor
									key={lot.id}
									lot={lot}
									itemId={item.id}
									editable={editable}
									range={range}
									suggested={item.suggested_conservation_class}
									onSaved={onSaved}
								/>
							))}
							{addingLot && (
								<LotEditor
									lot={null}
									itemId={item.id}
									editable={editable}
									range={range}
									suggested={item.suggested_conservation_class}
									onSaved={onSaved}
									onCancel={() => setAddingLot(false)}
								/>
							)}
							{item.lots.length === 0 && !addingLot && (
								<tr>
									<td colSpan={7} className="py-3 px-2 text-xs text-muted-foreground">
										Sem lote lançado. A efetivação criará um lote sintético com a quantidade inteira — informe os lotes se a carga veio com validades
										diferentes.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				<div className="flex items-center justify-between gap-3">
					<LotBalanceLine balance={balance} />
					{editable && !addingLot && (
						<Button size="sm" variant="outline" className="h-7 text-xs print:hidden" onClick={() => setAddingLot(true)}>
							<Plus className="size-3" />
							Adicionar lote
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

function ItemCardHeader({
	item,
	invoiced,
	qty,
	onQtyChange,
	editable,
	saving,
	onSave,
}: {
	item: ReceiptItemRow
	invoiced: number | null
	qty: string
	onQtyChange: (value: string) => void
	editable: boolean
	saving: boolean
	onSave: () => void
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="min-w-0">
				<p className="text-sm font-medium">{item.description}</p>
				{item.gtin && <span className="block text-[10px] font-mono text-muted-foreground">{item.gtin}</span>}
				<ConditioningSummary conditioning={item.conditioning} />
			</div>

			<div className="flex items-end gap-3">
				<div className="text-right">
					<p className="text-caption text-muted-foreground">Faturado</p>
					<p className="text-sm tabular-nums">
						{invoiced != null ? NUM.format(invoiced) : "—"}
						{item.measure_unit && <span className="ml-1 text-muted-foreground">{item.measure_unit}</span>}
					</p>
				</div>
				<div className="w-28">
					<p className="text-caption text-muted-foreground">Recebido</p>
					<Input
						type="number"
						min="0"
						step="any"
						className="h-7 text-xs text-right"
						value={qty}
						disabled={!editable}
						onChange={(e) => onQtyChange(e.target.value)}
					/>
				</div>
				{editable && (
					<Button size="sm" variant="ghost" className="h-7 text-xs print:hidden" disabled={saving} onClick={onSave}>
						{saving ? <Spinner className="size-3" /> : "Salvar"}
					</Button>
				)}
			</div>
		</div>
	)
}

function LotBalanceLine({ balance }: { balance: LotBalanceSummary }) {
	return (
		<p className="text-caption">
			{balance.status === "fecha" && <span className="text-muted-foreground">Lotes somam a quantidade conferida.</span>}
			{balance.status === "falta" && (
				<span className="inline-flex items-center gap-1 text-muted-foreground">
					<TriangleAlert className="size-3" />
					Faltam {NUM.format(balance.remaining)} para fechar com o recebido.
				</span>
			)}
			{balance.status === "excede" && (
				<span className="inline-flex items-center gap-1 text-destructive">
					<TriangleAlert className="size-3" />
					Lotes excedem o recebido em {NUM.format(Math.abs(balance.remaining))}.
				</span>
			)}
		</p>
	)
}
